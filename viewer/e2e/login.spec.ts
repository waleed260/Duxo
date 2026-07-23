import { test, expect } from "@playwright/test";

test.describe("Login page (§3.4)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("renders login form with both auth methods", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible();

    await expect(
      page.getByRole("button", { name: /continue with google/i })
    ).toBeVisible();

    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in" })
    ).toBeVisible();
  });

  test("displays signup toggle", async ({ page }) => {
    await expect(
      page.getByText("New to Duxo?")
    ).toBeVisible();
  });

  test("signup mode shows password hint", async ({ page }) => {
    await page.getByText("Create an account").click({ force: true });
    await expect(
      page.getByText(/at least 10 characters/i)
    ).toBeVisible();
  });
});
