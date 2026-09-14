import { expect, test } from "@playwright/test";
import { BIOME_CATALOG, biomesFor } from "../../src/domain/biomes";
import { normalizeEnvironment } from "../../src/domain/environment";

for (const mobile of [false, true]) {
  for (const biome of [
    "arcaded-city",
    "brutalist-gardens",
    "ancient-way",
    "dreamwood",
    "downtown",
  ] as const) {
    test(
      "varies " +
        biome +
        " architecture over 30 km " +
        (mobile ? "@mobile" : "desktop"),
      async ({ page }, testInfo) => {
        test.setTimeout(300_000);
        const landscape = BIOME_CATALOG[biome].landscape;
        const environment = normalizeEnvironment({
          landscape,
          seed: "architecture-tour",
          terrain: "gentle",
          time: "day",
          graphics: "low",
          biomeFrequencies: {
            [landscape]: Object.fromEntries(
              biomesFor(landscape).map((id) => [
                id,
                id === biome ? "normal" : "off",
              ]),
            ),
          },
        });
        await page.addInitScript(
          (environment) =>
            localStorage.setItem(
              "infinibike.preferences.v1",
              JSON.stringify({ environment }),
            ),
          environment,
        );
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto("/?visualQa=1");
        await page
          .getByRole("button", { name: "Ride with keys or touch" })
          .click();
        await page.getByRole("button", { name: "Start ride" }).click();
        await page.getByRole("button", { name: "Pause ride" }).click();
        await expect
          .poll(() =>
            page.evaluate(() => window.__INFINIBIKE_DEBUG__?.assetLibrary),
          )
          .toBe("ready");
        await page.evaluate(() => window.__INFINIBIKE_VISUAL_QA__!.freeze());
        await page
          .locator(".modal-layer")
          .evaluate(
            (element) => ((element as HTMLElement).style.display = "none"),
          );
        const forms = new Set<string>();
        const signatures = new Set<string>();
        for (const distance of [80, 2500, 7500, 12500, 20000, 30000]) {
          const scenery = await page.evaluate((distance) => {
            const qa = window.__INFINIBIKE_VISUAL_QA__!;
            qa.setDistance(distance);
            const index = Math.floor(distance / 250);
            return [index, index + 1, index + 2].flatMap((i) => qa.scenery(i));
          }, distance);
          const buildings = scenery.filter((item) => item.architecture);
          expect(buildings.length).toBeGreaterThan(0);
          for (const building of buildings) {
            forms.add(building.architecture!.form);
            signatures.add(building.architecture!.signature);
            expect(building.footprint.halfAlong * 2).toBeCloseTo(
              building.architecture!.width,
            );
            expect(building.footprint.halfAcross * 2).toBeCloseTo(
              building.architecture!.depth,
            );
          }
          const diagnostics = await page.evaluate(
            () => window.__INFINIBIKE_DEBUG__!,
          );
          expect(Number(diagnostics.chunks)).toBeLessThanOrEqual(13);
          expect(Number(diagnostics.calls)).toBeLessThanOrEqual(1700);
          expect(Number(diagnostics.geometries)).toBeLessThanOrEqual(700);
          expect(Number(diagnostics.triangles)).toBeLessThanOrEqual(10_000_000);
          expect(Number(diagnostics.contextLosses)).toBe(0);
          if (distance === 80 || distance === 12500)
            await page.screenshot({
              path: testInfo.outputPath(biome + "-" + distance + "m.png"),
            });
        }
        expect(forms.size).toBeGreaterThanOrEqual(4);
        expect(signatures.size).toBeGreaterThan(20);
        const index = 120;
        const before = await page.evaluate(
          (index) => window.__INFINIBIKE_VISUAL_QA__!.scenery(index),
          index,
        );
        for (const quality of ["high", "medium", "low"] as const) {
          await page.evaluate((quality) => {
            const qa = window.__INFINIBIKE_VISUAL_QA__!;
            qa.setGraphics(quality);
            qa.setDistance(30000);
          }, quality);
          expect(
            await page.evaluate(
              (index) => window.__INFINIBIKE_VISUAL_QA__!.scenery(index),
              index,
            ),
          ).toEqual(before);
          const diagnostics = await page.evaluate(
            () => window.__INFINIBIKE_DEBUG__!,
          );
          expect(Number(diagnostics.geometries)).toBeLessThanOrEqual(700);
          expect(Number(diagnostics.calls)).toBeLessThanOrEqual(1700);
        }
        const colors = await page
          .locator("canvas")
          .first()
          .evaluate((canvas) => {
            window.__INFINIBIKE_VISUAL_QA__!.setDistance(30000);
            const target = document.createElement("canvas");
            target.width = 32;
            target.height = 32;
            const context = target.getContext("2d")!;
            context.drawImage(canvas as HTMLCanvasElement, 0, 0, 32, 32);
            const data = context.getImageData(0, 0, 32, 32).data;
            const colors = new Set<string>();
            for (let i = 0; i < data.length; i += 4)
              colors.add([data[i], data[i + 1], data[i + 2]].join(":"));
            return colors.size;
          });
        expect(colors).toBeGreaterThan(20);
        expect(errors).toEqual([]);
        await testInfo.attach("architectural-variety", {
          body: JSON.stringify({
            forms: [...forms],
            uniqueDesigns: signatures.size,
            diagnostics: await page.evaluate(() => window.__INFINIBIKE_DEBUG__),
          }),
          contentType: "application/json",
        });
      },
    );
  }
}
