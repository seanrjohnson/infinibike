import { expect, test } from "@playwright/test";

for (const suffix of ["desktop", "@mobile"]) {
  test(`changes chase angle independently of camera distance ${suffix}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    await page.goto("/?visualQa=1");
    await page.getByRole("button", { name: "Ride with keys or touch" }).click();
    await page.locator("#landscape").selectOption("city");
    await page.locator("#camera-angle").selectOption("left");
    await page.getByRole("button", { name: "Start ride" }).click();
    await expect
      .poll(() => page.evaluate(() => window.__INFINIBIKE_DEBUG__?.cameraAngle))
      .toBe("left");
    for (const angle of ["right", "center", "left"]) {
      await page
        .getByRole("button", { name: "Change camera angle", exact: true })
        .click();
      await expect
        .poll(() =>
          page.evaluate(() => window.__INFINIBIKE_DEBUG__?.cameraAngle),
        )
        .toBe(angle);
      expect(
        await page.evaluate(() => window.__INFINIBIKE_DEBUG__?.cameraMode),
      ).toBe("close");
    }
    await page.getByRole("button", { name: "Pause ride" }).click();
    await expect
      .poll(() =>
        page.evaluate(() => window.__INFINIBIKE_DEBUG__?.assetLibrary),
      )
      .toBe("ready");
    for (const mode of ["close", "wide"]) {
      await page.locator("#pause-camera").selectOption(mode);
      for (const angle of ["left", "center", "right"]) {
        await page.locator("#pause-angle").selectOption(angle);
        await page.evaluate(() =>
          window.__INFINIBIKE_VISUAL_QA__!.setDistance(100),
        );
        const debug = await page.evaluate(() => window.__INFINIBIKE_DEBUG__!);
        expect(debug.cameraAngle).toBe(angle);
        expect(debug.cameraMode).toBe(mode);
        expect(Number(debug.calls)).toBeGreaterThan(0);
        expect(Number(debug.calls)).toBeLessThanOrEqual(1700);
        expect(Number(debug.contextLosses)).toBe(0);
        await page
          .locator(".modal-layer")
          .evaluate((el) => ((el as HTMLElement).style.visibility = "hidden"));
        expect(
          (
            await page.screenshot({
              path: testInfo.outputPath(`${mode}-${angle}.png`),
            })
          ).byteLength,
        ).toBeGreaterThan(10000);
        await page
          .locator(".modal-layer")
          .evaluate((el) => ((el as HTMLElement).style.visibility = ""));
      }
    }
  });
}
