/**
 * Deployment smoke check — drives a real browser against a deployed Duxo.
 *
 * `npm run build` passing says the code compiles. It says nothing about
 * whether the deployed instance has its environment set, whether Clerk's
 * publishable key matches the domain it is served from, or whether the API
 * routes the session flow depends on are actually reachable. Those only fail
 * in a browser, against the real origin, which is what this does.
 *
 *   node scripts/check-deployment.mjs https://your-app.up.railway.app
 *   npm run check:deploy -- https://your-app.up.railway.app
 *
 * Exits non-zero if any check fails, so it can gate a release.
 */
import { chromium } from "@playwright/test";

const base = (process.argv[2] ?? process.env.DUXO_DEPLOY_URL ?? "").replace(/\/+$/, "");

if (!base) {
  console.error(
    "Usage: node scripts/check-deployment.mjs <base-url>\n" +
      "   or: DUXO_DEPLOY_URL=https://… node scripts/check-deployment.mjs",
  );
  process.exit(2);
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

// Console errors and failed requests are collected per-navigation. A page that
// renders but throws in the browser is the shape a missing NEXT_PUBLIC_* key
// takes, and it looks entirely fine to curl.
const consoleErrors = [];
const cspViolations = [];
const failedRequests = [];

// Origins a CSP block is the *correct* outcome for. The README promises no
// telemetry, so the policy refusing analytics is the policy working — but a
// CSP violation is not automatically benign (the "worker-src blob" fix in this
// repo's history was a real break found exactly this way), so the two are
// separated rather than the whole category being ignored.
const EXPECTED_CSP_BLOCKS = /google-analytics\.com|googletagmanager\.com|doubleclick\.net/;

page.on("console", (m) => {
  if (m.type() !== "error") return;
  const text = m.text();
  if (/Content Security Policy/i.test(text)) cspViolations.push(text);
  else consoleErrors.push(text);
});
page.on("requestfailed", (r) => {
  // Next.js fires RSC prefetches (`?_rsc=`) for links in view and aborts them
  // the moment a navigation starts. They show up as ERR_ABORTED and mean
  // nothing is wrong — flagging them would make this check cry wolf on every
  // healthy deploy, which is how a red check stops being read.
  const aborted = r.failure()?.errorText === "net::ERR_ABORTED";
  if (aborted && /[?&]_rsc=/.test(r.url())) return;
  failedRequests.push(`${r.method()} ${r.url()} — ${r.failure()?.errorText}`);
});

try {
  // ── 1. The deployment is up and serving the app ──────────────────────────
  const landing = await page.goto(base, { waitUntil: "domcontentloaded", timeout: 45_000 });
  record("landing page responds", landing?.ok() === true, `HTTP ${landing?.status()}`);

  const h1 = await page.locator("h1").first().textContent().catch(() => null);
  record("landing page rendered markup", Boolean(h1?.trim()), h1?.trim()?.slice(0, 60));

  // ── 2. Configuration, via the health route ───────────────────────────────
  // The single most useful signal: a deploy can be up and still be missing
  // every server secret, and nothing on the landing page would show it.
  const health = await page.request.get(`${base}/api/health`);
  const healthBody = await health.json().catch(() => null);
  record(
    "/api/health reports configured",
    health.status() === 200 && healthBody?.status === "ok",
    healthBody
      ? `status=${healthBody.status} missing=${JSON.stringify(healthBody.missing)}`
      : `HTTP ${health.status()} (route missing — is this deploy current?)`,
  );
  if (healthBody && healthBody.turnConfigured === false) {
    // Not a failure: §0.8 says this degrades rather than breaks. But it breaks
    // for the remote person on ~10-15% of networks, so it must not be silent.
    console.log(
      "WARN  TURN is not configured — sessions will fail on restrictive " +
        "networks (§0.8), and they fail for the remote caller, not for you.",
    );
  }

  // ── 3. The API routes the session flow depends on ────────────────────────
  // Unauthenticated calls must be refused with JSON, not redirected to an
  // HTML login page — a redirect here is what turns "please sign in" into an
  // unparseable response in the middle of the dashboard's fetch.
  for (const route of ["/api/resolve-code", "/api/link-device"]) {
    const res = await page.request.post(`${base}${route}`, {
      data: { code: "00000000" },
      failOnStatusCode: false,
      maxRedirects: 0,
    });
    const type = res.headers()["content-type"] ?? "";
    record(
      `${route} refuses an anonymous caller as JSON`,
      res.status() === 401 && type.includes("application/json"),
      `HTTP ${res.status()} ${type}`,
    );
  }

  // ── 4. Auth gating actually redirects ────────────────────────────────────
  // §3.3 — a protected page must send an anonymous visitor to /login rather
  // than 404 or, worse, render.
  await page.goto(`${base}/dashboard`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  const url = page.url();
  record("/dashboard redirects an anonymous visitor to /login", /\/login/.test(url), url);

  // ── 4b. Sign-in actually mounts ──────────────────────────────────────────
  // Clerk loads from its own origin, so a CSP or key mismatch shows up here
  // and nowhere else: the page still returns 200 and renders its shell, and
  // only the form — the thing every user needs — is missing.
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  const clerkMounted = await page
    .locator("input[type='email'], input[name='identifier'], .cl-rootBox")
    .first()
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  record("sign-in form mounts on /login", clerkMounted);

  // ── 5. Static pages that carry no auth ───────────────────────────────────
  for (const path of ["/download", "/docs"]) {
    const res = await page.goto(`${base}${path}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    record(`${path} responds`, res?.ok() === true, `HTTP ${res?.status()}`);
  }

  // ── 6. Nothing exploded client-side ──────────────────────────────────────
  // Filter the noise a browser produces regardless of the app's health.
  const realErrors = consoleErrors.filter(
    (e) => !/favicon|Download the React DevTools|sourcemap/i.test(e),
  );
  record(
    "no console errors across the pages visited",
    realErrors.length === 0,
    realErrors.slice(0, 3).join(" | ") || undefined,
  );

  // A CSP block against anything the app actually depends on is a real
  // failure; one against a tracker is the policy doing its job.
  const unexpectedCsp = cspViolations.filter((v) => !EXPECTED_CSP_BLOCKS.test(v));
  record(
    "no CSP violations against origins the app needs",
    unexpectedCsp.length === 0,
    unexpectedCsp.slice(0, 2).join(" | ") || undefined,
  );
  if (cspViolations.length > unexpectedCsp.length) {
    console.log(
      "INFO  CSP blocked analytics requests — expected, and what \"no " +
        "telemetry\" means in practice. Clerk's script attempts these.",
    );
  }
  record(
    "no failed network requests",
    failedRequests.length === 0,
    failedRequests.slice(0, 3).join(" | ") || undefined,
  );
} catch (error) {
  record("deployment check completed", false, String(error?.message ?? error));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed against ${base}`,
);
process.exit(failed.length === 0 ? 0 : 1);
