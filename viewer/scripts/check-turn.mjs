/**
 * Duxo — TURN relay check (§0.8).
 *
 * TURN is the fallback for the ~10-15% of networks STUN cannot traverse, and
 * it is the single most common thing to get quietly wrong: bad credentials, a
 * blocked port, or an expired free tier all fail exactly the same way — the
 * session connects on your own LAN and mysteriously does not for the person
 * you are trying to help.
 *
 * This forces the question. It gathers ICE candidates with
 * `iceTransportPolicy: "relay"`, which makes the browser refuse every host and
 * server-reflexive candidate. If a relay candidate appears, TURN works. If
 * none does, it does not — and you know before a user does.
 *
 * Usage:  node scripts/check-turn.mjs
 *         node scripts/check-turn.mjs turn:host:3478 user pass
 */
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const GATHER_TIMEOUT_MS = 15_000;

function loadEnvLocal() {
  const env = {};
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // No .env.local is fine when credentials are passed as arguments.
  }
  return env;
}

function resolveConfig() {
  const [, , argUrls, argUser, argPass] = process.argv;
  if (argUrls) {
    return {
      urls: argUrls.split(",").filter(Boolean),
      username: argUser,
      credential: argPass,
      source: "command line",
    };
  }

  const env = loadEnvLocal();
  return {
    urls: (env.NEXT_PUBLIC_METERED_TURN_URLS ?? "").split(",").filter(Boolean),
    username: env.NEXT_PUBLIC_METERED_TURN_USERNAME,
    credential: env.NEXT_PUBLIC_METERED_TURN_CREDENTIAL,
    source: ".env.local",
  };
}

const config = resolveConfig();

if (config.urls.length === 0) {
  console.error(
    `No TURN URLs found in ${config.source}.\n\n` +
      "Set NEXT_PUBLIC_METERED_TURN_URLS / _USERNAME / _CREDENTIAL in\n" +
      "viewer/.env.local (and the DUXO_METERED_TURN_* equivalents in\n" +
      "host-agent/src-tauri/.env), or pass them as arguments.\n\n" +
      "Until then, any session that cannot connect peer-to-peer will fail.",
  );
  process.exit(2);
}

if (!config.username || !config.credential) {
  console.error(
    "TURN URLs are set but username/credential are missing.\n" +
      "A credential-less TURN entry is worse than none: ICE spends its whole\n" +
      "timeout retrying allocations the server will always refuse.",
  );
  process.exit(2);
}

console.log(`Checking TURN from ${config.source}:`);
for (const url of config.urls) console.log(`  ${url}`);
console.log("");

const browser = await chromium.launch();
const page = await browser.newPage();

const result = await page.evaluate(
  async ({ urls, username, credential, timeoutMs }) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls, username, credential }],
      // The whole point: refuse host and srflx candidates, so anything
      // gathered had to come from the relay.
      iceTransportPolicy: "relay",
    });

    const candidates = [];
    const errors = [];

    pc.onicecandidateerror = (e) => {
      errors.push({
        url: e.url,
        code: e.errorCode,
        text: e.errorText,
      });
    };

    const done = new Promise((resolve) => {
      pc.onicecandidate = (e) => {
        if (e.candidate) candidates.push(e.candidate.candidate);
        else resolve("complete");
      };
      setTimeout(() => resolve("timeout"), timeoutMs);
    });

    pc.createDataChannel("probe");
    await pc.setLocalDescription(await pc.createOffer());
    const how = await done;
    pc.close();

    return { candidates, errors, how };
  },
  { ...config, timeoutMs: GATHER_TIMEOUT_MS },
);

await browser.close();

const relayCandidates = result.candidates.filter((c) => c.includes(" typ relay"));

for (const err of result.errors) {
  // 401 is the one worth calling out by name — it means the server is
  // reachable and rejecting the credentials, not that it is down.
  const hint =
    err.code === 401
      ? "  → credentials rejected. Check the username/password pair."
      : err.code === 701
        ? "  → could not reach the server. Check the URL and that the port is open."
        : "";
  console.error(`ICE error ${err.code} from ${err.url}: ${err.text}${hint ? "\n" + hint : ""}`);
}

if (relayCandidates.length > 0) {
  console.log(`\n✓ TURN works — ${relayCandidates.length} relay candidate(s) gathered.`);
  for (const c of relayCandidates) console.log(`  ${c}`);
  console.log("\nSessions on restrictive networks (§0.8) will connect.");
  process.exit(0);
}

console.error(
  `\n✗ No relay candidates (gathering ${result.how}).\n\n` +
    "TURN is not usable with this configuration. Sessions will still work\n" +
    "peer-to-peer, but will fail outright on roughly 10-15% of networks —\n" +
    "and they will fail for the remote person, not for you.",
);
process.exit(1);
