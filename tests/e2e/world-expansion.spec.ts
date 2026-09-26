import { expect, test } from "@playwright/test";

for (const suffix of ["desktop", "@mobile"]) {
  for (const landscape of ["countryside", "city"] as const) {
    test(`keeps ${landscape} surroundings continuous through turns and retirement ${suffix}`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(240_000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("/?visualQa=1");
      await page
        .getByRole("button", { name: "Ride with keys or touch" })
        .click();
      await page.locator("#seed").fill("windows-visual-qa");
      await page.locator("#landscape").selectOption(landscape);
      await page.locator("#graphics").selectOption("medium");
      await page.locator("#time").selectOption("day");
      await page.getByRole("button", { name: "Start ride" }).click();
      await page.getByRole("button", { name: "Pause ride" }).click();
      await page.waitForFunction(
        () => window.__INFINIBIKE_DEBUG__?.assetLibrary === "ready",
      );
      await page.evaluate(() => window.__INFINIBIKE_VISUAL_QA__!.freeze());
      await page.locator(".modal-layer").evaluate((el) => {
        (el as HTMLElement).style.display = "none";
      });
      const turn = await page.evaluate(
        (landscape) =>
          landscape === "city"
            ? window.__INFINIBIKE_VISUAL_QA__!.findCityTurnDistance()
            : window.__INFINIBIKE_VISUAL_QA__!.findCountrysideRouteEvent(
                "fork",
              ),
        landscape,
      );
      expect(turn).toBeGreaterThan(0);
      for (const [index, offset] of [-35, 0, 55, 650, 1100].entries()) {
        await page.evaluate(
          ({ distance, index }) => {
            const qa = window.__INFINIBIKE_VISUAL_QA__!;
            qa.setDistance(distance);
            qa.setCamera(
              index % 2 ? "handlebar" : "wide",
              index % 2 ? "left" : "right",
            );
          },
          { distance: turn + offset, index },
        );
        const d = await page.evaluate(() => window.__INFINIBIKE_DEBUG__!);
        expect(Number(d.terrainCoverageRadiusM)).toBeGreaterThanOrEqual(1650);
        expect(Number(d.terrainTilesFine)).toBeGreaterThan(0);
        expect(Number(d.terrainTilesCoarse)).toBeGreaterThan(0);
        expect(Number(d.distantSceneryInstances)).toBeGreaterThan(0);
        expect(Number(d.continuationPageIntersections)).toBeGreaterThan(0);
        expect(Number(d.expansionPendingBuilds)).toBe(0);
        expect(Number(d.calls)).toBeLessThanOrEqual(1700);
        expect(Number(d.triangles)).toBeLessThanOrEqual(11_000_000);
        expect(Number(d.geometries)).toBeLessThanOrEqual(700);
        expect(Number(d.textures)).toBeLessThanOrEqual(30);
        expect(Number(d.contextLosses)).toBe(0);
        if (offset <= 55) {
          const screenshot = await page.screenshot({
            path: testInfo.outputPath(`${landscape}-${offset}.png`),
          });
          expect(screenshot.byteLength).toBeGreaterThan(20_000);
        }
      }
      // Repeated identical journeys must not accumulate GPU resources.
      const resources: number[] = [];
      for (let pass = 0; pass < 3; pass++) {
        await page.evaluate((turn) => {
          const qa = window.__INFINIBIKE_VISUAL_QA__!;
          qa.setDistance(turn + 2200);
          qa.setDistance(turn);
          qa.settleExpansion();
        }, turn);
        resources.push(
          await page.evaluate(() =>
            Number(window.__INFINIBIKE_DEBUG__!.geometries),
          ),
        );
      }
      expect(resources[2]).toBeLessThanOrEqual(resources[1]! + 2);
      expect(errors).toEqual([]);
    });
  }
}

for (const weather of ["clear", "cloudy", "rain"] as const) {
  test(`settles expanded terrain in ${weather} at night @mobile`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/?visualQa=1");
    await page.getByRole("button", { name: "Ride with keys or touch" }).click();
    await page.locator("#weather").selectOption(weather);
    await page.locator("#time").selectOption("night");
    await page.locator("#graphics").selectOption("low");
    await page.getByRole("button", { name: "Start ride" }).click();
    await page.getByRole("button", { name: "Pause ride" }).click();
    await page.evaluate(() => {
      window.__INFINIBIKE_VISUAL_QA__!.freeze();
      window.__INFINIBIKE_VISUAL_QA__!.setDistance(2001);
    });
    const d = await page.evaluate(() => window.__INFINIBIKE_DEBUG__!);
    expect(Number(d.terrainCoverageRadiusM)).toBe(
      { clear: 1550, cloudy: 1150, rain: 720 }[weather] + 200,
    );
    expect(Number(d.expansionPendingBuilds)).toBe(0);
    expect(Number(d.contextLosses)).toBe(0);
    expect(Number(d.triangles)).toBeGreaterThan(1000);
  });
}
