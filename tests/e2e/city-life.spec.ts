import { expect, test } from "@playwright/test";
for (const mobile of [false, true]) {
  test(`renders city neighborhoods and lane cyclists ${mobile ? "@mobile" : "desktop"}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/?visualQa=1&e2e=1");
    await page.getByRole("button", { name: "Ride with keys or touch" }).click();
    await page.locator("#landscape").selectOption("city");
    await page.locator("#seed").fill("city-life");
    await page.getByRole("button", { name: "Start ride" }).click();
    await page.getByRole("button", { name: "Pause ride" }).click();
    await expect
      .poll(() =>
        page.evaluate(() => window.__INFINIBIKE_DEBUG__?.assetLibrary),
      )
      .toBe("ready");
    await page.evaluate(() => window.__INFINIBIKE_VISUAL_QA__!.freeze());
    await page.locator(".modal-layer").evaluate((element) => {
      (element as HTMLElement).style.visibility = "hidden";
    });
    const assets = new Set<string>();
    for (const distance of [60, 750, 1750, 2750, 3750, 4750]) {
      const actors = await page.evaluate((d) => {
        const qa = window.__INFINIBIKE_VISUAL_QA__!;
        qa.setDistance(d);
        qa.advanceActors(0.1);
        return {
          frames: qa.actorFrames(),
          assets: qa.scenery(Math.floor(d / 250)).map((item) => item.asset),
        };
      }, distance);
      actors.assets.forEach((asset) => assets.add(asset));
      expect(
        actors.frames.some(
          (actor) => actor.kind === "cyclist" && actor.visible,
        ),
      ).toBe(true);
      const debug = await page.evaluate(() => window.__INFINIBIKE_DEBUG__!);
      expect(Number(debug.contextLosses)).toBe(0);
      expect(Number(debug.calls)).toBeGreaterThan(0);
      expect(Number(debug.calls)).toBeLessThanOrEqual(1700);
      expect(
        (
          await page.screenshot({
            path: testInfo.outputPath(`city-${distance}.png`),
          })
        ).byteLength,
      ).toBeGreaterThan(10000);
    }
    expect(assets.size).toBeGreaterThan(8);
    expect(errors).toEqual([]);
  });
}
