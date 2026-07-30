import { test, expect } from "@playwright/test";

test.describe("Login page (§3.4) — Clerk auth UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("renders Clerk SignIn component with auth options", async ({ page }) => {
    // Clerk renders its own heading inside the <SignIn /> component
    await expect(page.getByText(/sign in|sign in to continue/i)).toBeVisible({ timeout: 15000 });

    // Social login buttons (Google, GitHub, etc.)
    await expect(
      page.locator(".cl-socialButtonsBlockButton").first()
    ).toBeVisible({ timeout: 10000 });

    // Email/username field
    await expect(page.locator("input[name='identifier']").first()).toBeVisible({ timeout: 10000 });
  });

  test("shows sign-up link to switch modes", async ({ page }) => {
    // Clerk provides a link to switch to sign-up
    await expect(
      page.getByText(/no account/i).first()
    ).toBeVisible({ timeout: 15000 });
  });
});
