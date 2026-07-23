import { test, expect } from "@playwright/test";

test.describe("Login page (§3.4)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("renders login form with both auth methods", async ({ page }) => {
    await expect(page.getByText(/sign in/i)).toBeVisible();

    // Google OAuth button
    await expect(
      page.getByRole("button", { name: /google/i })
    ).toBeVisible();

    // Email/password form
    await expect(page.getByText(/email/i)).toBeVisible();
    await expect(page.getByText(/password/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /sign in with email/i })
    ).toBeVisible();
  });

  test("displays signup toggle", async ({ page }) => {
    await expect(
      page.getByText(/don't have an account/i)
    ).toBeVisible();
  });

  test("password field respects minimum length", async ({ page }) => {
    const passwordInput = page.getByLabel(/password/i);
    await passwordInput.fill("short");
    await expect(passwordInput).toHaveAttribute("minLength", "10");
  });
});
