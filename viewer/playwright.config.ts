import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  // The webServer below is `next dev`, which compiles a route the first time
  // something asks for it. A client-side navigation therefore waits on a cold
  // compile — 5 to 10 seconds for /login, which pulls in Clerk's SignIn — and
  // Playwright's 5s default made that read as "the link does not work". It is
  // a real wait, not a hang, so the fix is to allow for it rather than to
  // shorten what the tests check.
  expect: { timeout: 20_000 },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
