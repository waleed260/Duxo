import { test, expect } from "@playwright/test";

test.describe("Download page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/download");
  });

  test("renders download options for each platform", async ({ page }) => {
    await expect(page.getByText(/windows/i)).toBeVisible();
    await expect(page.getByText(/linux/i)).toBeVisible();
  });

  test("download buttons are present", async ({ page }) => {
    const downloadButtons = page.getByRole("link", { name: /download/i });
    const count = await downloadButtons.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
