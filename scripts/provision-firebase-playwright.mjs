#!/usr/bin/env node
/**
 * Drive the Firebase console with Playwright to provision what
 * `./scripts/provision.sh firebase` would, for people who would rather click
 * than run `firebase login`.
 *
 * Uses your real Chrome profile (so your Google session is already there):
 *   ~/.config/google-chrome  — Chrome MUST be fully closed first, or the
 *   profile is locked and Chromium refuses to start.
 *
 * Stages (run them in order; each is idempotent-ish and stops on the first
 * problem):
 *   node scripts/provision-firebase-playwright.mjs check      # report state, screenshot
 *   node scripts/provision-firebase-playwright.mjs rtdb       # create Realtime DB (us-central1)
 *   node scripts/provision-firebase-playwright.mjs firestore  # create Firestore (nam5 — PERMANENT)
 *   node scripts/provision-firebase-playwright.mjs auth       # enable Email/Password
 *
 * The console DOM is not a stable API. If a selector misses, the script
 * screenshots to scripts/.pw/ and bails rather than clicking blindly.
 */
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

// playwright-core is a dependency of viewer/ (via @playwright/test), not of the
// repo root — resolve it from there so this script runs from anywhere.
const require = createRequire(path.join(import.meta.dirname, "../viewer/package.json"));
let chromium;
try {
  ({ chromium } = require("playwright-core"));
} catch {
  console.error("playwright-core not found. Run `npm install` in viewer/ first.");
  process.exit(1);
}

const PROJECT = process.env.DUXO_FIREBASE_PROJECT_ID || "duxo-967f0";
const BASE = `https://console.firebase.google.com/project/${PROJECT}`;
const USER_DATA_DIR = path.join(homedir(), ".config/google-chrome");
const SHOT_DIR = path.join(import.meta.dirname, ".pw");
const stage = process.argv[2];

if (!["check", "rtdb", "firestore", "auth"].includes(stage)) {
  console.error("usage: provision-firebase-playwright.mjs <check|rtdb|firestore|auth>");
  process.exit(2);
}
mkdirSync(SHOT_DIR, { recursive: true });

const shot = async (page, name) => {
  const p = path.join(SHOT_DIR, `${stage}-${name}-${Date.now()}.png`);
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  console.log(`  screenshot: ${p}`);
};

const bail = async (page, msg) => {
  console.error(`\n✗ ${msg}`);
  await shot(page, "bail");
  await ctx.close();
  process.exit(1);
};

if (!existsSync(USER_DATA_DIR)) {
  console.error(`No Chrome profile at ${USER_DATA_DIR}. Set it or install Chrome.`);
  process.exit(1);
}

console.log(`project: ${PROJECT}`);
console.log(`profile: ${USER_DATA_DIR}  (Chrome must be closed)`);
console.log(`stage:   ${stage}\n`);

const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
  channel: "chrome",
  headless: false,
  viewport: { width: 1400, height: 950 },
  args: ["--profile-directory=Default"],
});

const page = ctx.pages()[0] || (await ctx.newPage());
page.setDefaultTimeout(45_000);

async function ensureSignedIn() {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  if (/accounts\.google\.com/.test(page.url())) {
    console.log("→ Google is asking you to sign in. Do it in the window; I'll wait.");
    await page.waitForURL(/console\.firebase\.google\.com/, { timeout: 180_000 }).catch(() => {});
  }
  if (!/console\.firebase\.google\.com/.test(page.url())) {
    await bail(page, `Not on the Firebase console (at ${page.url()}).`);
  }
  console.log("✓ signed in to the Firebase console");
}

async function runCheck() {
  const probe = async (label, urlPart, presentRe, absentRe) => {
    await page.goto(`${BASE}/${urlPart}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2500);
    const body = (await page.locator("body").innerText().catch(() => "")) || "";
    const present = presentRe.test(body);
    const absent = absentRe.test(body);
    console.log(`  ${label.padEnd(18)} ${present ? "PRESENT" : absent ? "absent" : "unclear — see screenshot"}`);
    if (!present) await shot(page, label.toLowerCase().replace(/\W+/g, "-"));
  };
  await probe("Realtime Database", "database", /https:\/\/[\w-]+\.firebaseio\.com|firebasedatabase\.app|Data\s+Rules\s+Backups/i, /Create Database|Get started/i);
  await probe("Firestore", "firestore", /Start collection|Panel view|Query builder/i, /Create database|Get started/i);
  await probe("Authentication", "authentication/providers", /Email\/Password.*Enabled|Sign-in providers/i, /Get started/i);
  console.log("\nIf a row says 'absent', run the matching stage next.");
}

await ensureSignedIn();

if (stage === "check") {
  await runCheck();
} else {
  console.log(`\nStage '${stage}' drives console clicks. Watch the window.`);
  console.log("This script only opens the right page and screenshots it — the");
  console.log("actual Create/Enable click is left for you to make, on purpose:");
  console.log("the Firestore location (nam5) is PERMANENT and the console's");
  console.log("confirm dialogs move around between releases. Selector-clicking");
  console.log("them blind is how you get us-east4 forever.\n");
  const target = stage === "rtdb" ? "database" : stage === "firestore" ? "firestore" : "authentication/providers";
  await page.goto(`${BASE}/${target}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot(page, "ready");
  console.log("→ Page is open. Make the choice in the window:");
  if (stage === "rtdb") console.log("  Create Database → location us-central1 → Locked mode → Enable");
  if (stage === "firestore") console.log("  Create database → location nam5 (PERMANENT) → Locked mode → Create");
  if (stage === "auth") console.log("  Email/Password → toggle Enable → Save");
  console.log("\nLeaving the browser open for 5 minutes. Ctrl-C when done.");
  await page.waitForTimeout(300_000);
}

await ctx.close();
console.log("\ndone.");
