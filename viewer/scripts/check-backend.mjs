/**
 * Duxo — Firebase backend check (§0.13 items 4–5).
 *
 * A Firebase *project* and a Firebase *backend* are different things, and
 * nothing in the code can tell them apart. The project can exist, the API key
 * can be valid, the service account can authenticate — and every session,
 * code and pairing still has nowhere to live, because Realtime Database,
 * Firestore and Authentication are each created by a separate click in the
 * console and none of them exists until someone makes it.
 *
 * The symptoms do not name the cause. A missing database answers 404, which
 * reads as "empty path" and sends you auditing rules and tokens. Missing Auth
 * lets device pairing report success in the browser and then fail on the host
 * when it exchanges the custom token. So this asks each service directly and
 * says which click is missing.
 *
 * Every probe uses public values from `.env.local` — no service-account key,
 * nothing that has to be kept secret, safe to run and safe to paste.
 *
 * Usage:  npm run check:backend
 *         node scripts/check-backend.mjs <project-id> [api-key]
 */
import { readFileSync } from "node:fs";

const TIMEOUT_MS = 10_000;

function loadEnvLocal() {
  const env = {};
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // Arguments are an equally good source.
  }
  return env;
}

function resolveConfig() {
  const [, , argProject, argKey] = process.argv;
  const env = loadEnvLocal();
  const projectId = argProject ?? env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = argKey ?? env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const databaseUrl =
    env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ||
    (projectId ? `https://${projectId}-default-rtdb.firebaseio.com` : null);
  return { projectId, apiKey, databaseUrl };
}

async function get(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return { status: res.status, body: await res.text() };
  } catch (error) {
    return { status: 0, body: String(error) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A database that exists but denies you answers 401. One that was never
 * created answers 404 — the instance is missing, not the path.
 */
async function checkRealtimeDatabase(databaseUrl) {
  const { status } = await get(`${databaseUrl.replace(/\/$/, "")}/.json`);
  if (status === 401 || status === 200) {
    return {
      ok: true,
      detail:
        status === 401
          ? "exists, and its rules are denying anonymous reads (correct)"
          : "exists, and is readable anonymously — deploy the rules in firebase/",
    };
  }
  if (status === 404) {
    return {
      ok: false,
      detail: "404 — no database instance exists in this project",
      fix: "Firebase console → Build → Realtime Database → Create Database → Locked mode",
    };
  }
  return { ok: false, detail: `unexpected status ${status}` };
}

/**
 * Firestore's REST API answers 403 with "has not been used in this project
 * before" until the API is enabled, and 401/403 with a permission-denied body
 * once it is. The distinguishing text is the "has not been used" phrase.
 */
async function checkFirestore(projectId) {
  const { status, body } = await get(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/devices?pageSize=1`,
  );
  if (/has not been used in project|SERVICE_DISABLED/i.test(body)) {
    return {
      ok: false,
      detail: "the Firestore API has never been enabled for this project",
      fix: "Firebase console → Build → Firestore Database → Create database → Locked mode",
    };
  }
  if (status === 401 || status === 403) {
    return { ok: true, detail: "exists, and is refusing an anonymous read (correct)" };
  }
  if (status === 200) {
    return {
      ok: true,
      detail: "exists, and is readable anonymously — deploy the rules in firebase/",
    };
  }
  return { ok: false, detail: `unexpected status ${status}` };
}

/**
 * Deliberately signs in with an invalid custom token. A project with Auth
 * enabled rejects the *token* (INVALID_CUSTOM_TOKEN). One without it rejects
 * the *project* (CONFIGURATION_NOT_FOUND) — so the error text, not the
 * status, is the answer.
 *
 * This matters more than it looks: pairing mints a custom token server-side,
 * which works whether or not Auth exists, and only fails when the host
 * exchanges it. The web app reports a successful pairing either way.
 */
async function checkAuth(apiKey) {
  const { body } = await get(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "not-a-real-token", returnSecureToken: true }),
    },
  );
  if (/CONFIGURATION_NOT_FOUND/.test(body)) {
    return {
      ok: false,
      detail: "CONFIGURATION_NOT_FOUND — Authentication was never enabled",
      fix: "Firebase console → Build → Authentication → Get started → enable Email/Password",
    };
  }
  if (/INVALID_CUSTOM_TOKEN|CREDENTIAL_MISMATCH|INVALID_ID_TOKEN/.test(body)) {
    return { ok: true, detail: "enabled, and rejecting a deliberately invalid token (correct)" };
  }
  if (/API key not valid/.test(body)) {
    return { ok: false, detail: "the API key was rejected — check NEXT_PUBLIC_FIREBASE_API_KEY" };
  }
  return { ok: false, detail: `unrecognised response: ${body.slice(0, 120)}` };
}

const { projectId, apiKey, databaseUrl } = resolveConfig();

if (!projectId || !apiKey) {
  console.error(
    "No project id or API key. Fill in viewer/.env.local, or pass them:\n" +
      "  node scripts/check-backend.mjs <project-id> <api-key>",
  );
  process.exit(2);
}

console.log(`Checking Firebase backend for ${projectId}\n`);

const results = [
  ["Realtime Database", await checkRealtimeDatabase(databaseUrl)],
  ["Cloud Firestore", await checkFirestore(projectId)],
  ["Authentication", await checkAuth(apiKey)],
];

for (const [name, result] of results) {
  console.log(`${result.ok ? "✓" : "✗"} ${name.padEnd(18)} ${result.detail}`);
  if (result.fix) console.log(`  → ${result.fix}`);
}

const missing = results.filter(([, r]) => !r.ok);

if (missing.length === 0) {
  console.log(
    "\nAll three services exist. Sessions, codes and pairings have somewhere\n" +
      "to live. Rules still have to be deployed — see firebase/ and\n" +
      ".github/workflows/deploy-rules.yml.",
  );
  process.exit(0);
}

console.error(
  `\n${missing.length} of 3 services missing. Nothing in the product works until\n` +
    "they exist: every session, code and pairing lives in these. Spark (free)\n" +
    "covers all three, per §0.3.\n\n" +
    `  https://console.firebase.google.com/project/${projectId}/overview`,
);
process.exit(1);
