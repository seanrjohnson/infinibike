import { expect, test } from "@playwright/test";
for (const mobile of [false, true]) {
  test(`replays results and history with saved settings ${mobile ? "@mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/?e2e=1");
    await page.getByRole("button", { name: "Ride with keys or touch" }).click();
    await page.locator("#seed").fill("replay-route");
    await page.locator("#camera-mode").selectOption("wide");
    await page.locator("#ride-mode").selectOption("endurance");
    await page.locator("#ride-goal").selectOption("15");
    await page.getByRole("button", { name: "Start ride" }).click();
    await page.getByRole("button", { name: "Pause ride" }).click();
    await page.getByRole("button", { name: "End ride" }).click();
    await page.getByRole("button", { name: "Ride again", exact: true }).click();
    await page.getByRole("button", { name: "Pause ride" }).click();
    await expect(page.locator("#pause-camera")).toHaveValue("wide");
    await page.getByRole("button", { name: "End ride" }).click();
    await expect(page.locator(".seed-summary").first()).toContainText(
      "replay-route",
    );
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.getByRole("button", { name: "Ride with keys or touch" }).click();
    await page.locator("#seed").fill("different-route");
    await page.locator("#camera-mode").selectOption("close");
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Ride history" }).click();
    await page
      .getByRole("button", { name: "Ride again: replay-route" })
      .last()
      .click();
    await page.getByRole("button", { name: "Ride with keys or touch" }).click();
    await page.getByRole("button", { name: "Pause ride" }).click();
    await expect(page.locator("#pause-camera")).toHaveValue("wide");
    await page.getByRole("button", { name: "End ride" }).click();
    await expect(page.locator(".seed-summary").first()).toContainText(
      "replay-route",
    );
    await expect(page.locator(".seed-summary").last()).toContainText("15 min");
  });
}
