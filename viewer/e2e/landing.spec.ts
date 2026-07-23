import { test, expect } from "@playwright/test";

test.describe("Landing page (§11)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders hero section with title and CTA", async ({ page }) => {
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByText("Download host agent")).toBeVisible();
  });

  test("navigation links work", async ({ page }) => {
    await expect(page.getByRole("link", { name: /features/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /how it works/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /github/i }).first()).toBeVisible();
  });

  test("navigates to login page", async ({ page }) => {
    await page.getByRole("link", { name: /sign in to connect/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
