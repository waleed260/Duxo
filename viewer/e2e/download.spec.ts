import { test, expect } from "@playwright/test";

test.describe("Download page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/download");
  });

  test("renders heading and platform cards", async ({ page }) => {
    await expect(page.locator("h1")).toHaveText(/download duxo/i);
    await expect(page.getByText("Open-source, free forever.")).toBeVisible();
  });

  test("download buttons are present", async ({ page }) => {
    const downloadButtons = page.getByRole("link", { name: /download/i });
    const count = await downloadButtons.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
