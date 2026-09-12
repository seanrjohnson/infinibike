import { expect, test } from "@playwright/test";
for (const mobile of [false, true]) {
  test(`remembers ride setup ${mobile ? "@mobile" : "desktop"}`, async ({
    page,
  }) => {
    await page.goto("/?e2e=1");
    await page.getByRole("button", { name: "Ride with keys or touch" }).click();
    await page.locator("#seed").fill("remember-my-road");
    await page.locator("#landscape").selectOption("city");
    await page.locator("#camera-angle").selectOption("left");
    await page.locator("#camera-mode").selectOption("wide");
    await page.locator("#ride-mode").selectOption("endurance");
    await page.locator("#ride-goal").selectOption("15");
    await page.reload();
    await page.getByRole("button", { name: "Ride with keys or touch" }).click();
    await expect(page.locator("#seed")).toHaveValue("remember-my-road");
    await expect(page.locator("#landscape")).toHaveValue("city");
    await expect(page.locator("#camera-angle")).toHaveValue("left");
    await expect(page.locator("#camera-mode")).toHaveValue("wide");
    await expect(page.locator("#ride-goal")).toHaveValue("15");
    await page.getByRole("button", { name: "Start ride" }).click();
    await page.getByRole("button", { name: "Toggle compact HUD" }).click();
    await expect(page.locator(".ride-ui")).toHaveClass(/compact-hud/);
    await expect(page.locator("#hud-climbing")).toBeHidden();
    await page.reload();
    await page.getByRole("button", { name: "Ride with keys or touch" }).click();
    await page.getByRole("button", { name: "Start ride" }).click();
    await expect(
      page.getByRole("button", { name: "Toggle compact HUD" }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Toggle compact HUD" }).click();
    await expect(page.locator("#hud-climbing")).toBeVisible();
  });
}
