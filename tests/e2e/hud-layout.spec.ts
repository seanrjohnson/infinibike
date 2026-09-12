import { expect, test } from "@playwright/test";

for (const mobile of [false, true]) {
  test(`keeps ride overlays compact and separate ${mobile ? "@mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/?e2e=1");
    await page.getByRole("button", { name: "Ride with keys or touch" }).click();
    await page.locator("#landscape").selectOption("city");
    await page.getByRole("button", { name: "Start ride" }).click();
    await expect(page.locator("#ride-cue")).toHaveText("Free Ride");
    for (const width of [320, 390, 600, 760, 800, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 800 });
      const boxes = await page
        .locator(".hud > div, .ride-objective, .route-preview, .ride-controls")
        .evaluateAll((elements) =>
          elements.map((element) => {
            const { x, y, width, height } = element.getBoundingClientRect();
            return { x, y, width, height };
          }),
        );
      for (const [i, a] of boxes.entries()) {
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(a.x + a.width).toBeLessThanOrEqual(width + 1);
        for (const b of boxes.slice(i + 1)) {
          const overlapX =
            Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
          const overlapY =
            Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
          expect(overlapX > 1 && overlapY > 1).toBe(false);
        }
      }
      expect(
        (await page.locator(".ride-objective").boundingBox())!.width,
      ).toBeLessThan(190);
    }
    const debug = await page.evaluate(() => window.__INFINIBIKE_DEBUG__!);
    expect(Number(debug.calls)).toBeGreaterThan(0);
    expect(Number(debug.calls)).toBeLessThanOrEqual(1700);
    expect(Number(debug.contextLosses)).toBe(0);
    expect(
      (
        await page.screenshot({
          path: `test-results/hud-${mobile ? "touch" : "desktop"}.png`,
        })
      ).byteLength,
    ).toBeGreaterThan(10000);
  });
}
