import { test, expect } from "@playwright/test";

test.describe("Static content pages (§11)", () => {
  test("docs page renders sections", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.getByRole("heading", { name: /documentation/i })).toBeVisible();
    await expect(page.getByText(/quick start/i)).toBeVisible();
    await expect(page.getByText(/architecture/i)).toBeVisible();
    await expect(page.getByText(/security/i)).toBeVisible();
    await expect(page.getByText(/network/i)).toBeVisible();
  });

  test("blog page lists posts", async ({ page }) => {
    await page.goto("/blog");
    await expect(page.getByRole("heading", { name: /blog/i })).toBeVisible();
    // At least one blog post should be listed
    const articles = page.locator("article");
    await expect(articles.first()).toBeVisible();
  });

  test("changelog page lists releases", async ({ page }) => {
    await page.goto("/changelog");
    await expect(page.getByRole("heading", { name: /changelog/i })).toBeVisible();
    // The v0.1.0 release should be listed
    await expect(page.getByText(/v0\.1\.0/i)).toBeVisible();
  });
});
