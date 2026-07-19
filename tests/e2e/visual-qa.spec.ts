import { expect, test } from "@playwright/test";

const visualQaEnabled = process.env.INFINIBIKE_VISUAL_QA === "1";

for (const landscape of ["countryside", "city"] as const) {
  for (const graphics of ["medium", "high"] as const) {
    test(`captures ${landscape} at 1440p in ${graphics} quality`, async ({
      page,
    }, testInfo) => {
      test.skip(
        !visualQaEnabled,
        "Set INFINIBIKE_VISUAL_QA=1 to capture QA images.",
      );
      test.skip(testInfo.project.name !== "desktop", "Desktop QA matrix only.");
      await page.setViewportSize({ width: 2560, height: 1440 });
      await page.goto("/");
      await page
        .getByRole("button", { name: "Ride with keys or touch" })
        .click();
      await page.locator("#seed").fill("windows-visual-qa");
      await page.locator("#landscape").selectOption(landscape);
      await page.locator("#graphics").selectOption(graphics);
      await page.getByRole("button", { name: "Start ride" }).click();
      await expect(
        page.getByRole("button", { name: "Pause ride" }),
      ).toBeVisible();
      await page.keyboard.down("ArrowUp");
      await page.waitForTimeout(2_500);
      await page.keyboard.up("ArrowUp");
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.__INFINIBIKE_DEBUG__))?.quality,
        )
        .toBe(graphics);
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.__INFINIBIKE_DEBUG__))
              ?.postProcessing,
        )
        .toBe(graphics === "high" ? "subtle-bloom" : "off");
      await page.screenshot({
        path: `test-results/visual-qa/${landscape}-${graphics}-1440p.png`,
        animations: "disabled",
      });
    });
  }
}
