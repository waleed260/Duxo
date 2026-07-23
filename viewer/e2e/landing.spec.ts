import { test, expect } from "@playwright/test";

test.describe("Landing page (§11)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders hero section with title and CTA", async ({ page }) => {
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByRole("link", { name: /get started/i })).toBeVisible();
  });

  test("navigation links work", async ({ page }) => {
    await expect(page.getByRole("link", { name: /docs/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /blog/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /changelog/i })).toBeVisible();
  });

  test("navigates to login page", async ({ page }) => {
    await page.getByRole("link", { name: /get started/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
