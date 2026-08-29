import { expect, test } from "@playwright/test";

/**
 * Device pairing is the only way a host machine ever gets a credential, and
 * the route mints a Firebase token for whoever calls it. So the thing worth
 * asserting here is not that the form looks right — it is that an
 * unauthenticated caller cannot reach either half of it.
 */
test.describe("Device pairing", () => {
  test("redirects an unauthenticated visitor to login", async ({ page }) => {
    await page.goto("/link-device");

    await expect(page).toHaveURL(/\/login/);
    // The original path is carried through so the visitor lands back here
    // after signing in, rather than being dumped on the dashboard.
    expect(page.url()).toContain("redirect_url");
    expect(decodeURIComponent(page.url())).toContain("/link-device");
  });

  test("the pairing API refuses an unauthenticated request", async ({ request }) => {
    // A 401 here is what stops an anonymous caller minting a Firebase
    // credential by guessing a six-character code.
    const res = await request.post("/api/link-device", {
      data: { code: "AB3D9F" },
    });

    expect(res.status()).toBe(401);
  });

  test("the pairing API rejects a malformed code", async ({ request }) => {
    // Still unauthenticated, so this must fail on auth before it ever reaches
    // code validation — an anonymous caller must not be able to probe which
    // codes exist by comparing 400 against 404.
    const res = await request.post("/api/link-device", {
      data: { code: "not-a-code" },
    });

    expect(res.status()).toBe(401);
  });
});
