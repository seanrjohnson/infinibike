import { expect, test } from "@playwright/test";
import { biomesFor } from "../../src/domain/biomes";
import { normalizeEnvironment } from "../../src/domain/environment";
import {
  WATERSIDE_MONUMENT_FORMS,
  isCrossing,
} from "../../src/world/waterside-landmarks";
const DECKS = {
  lakeside: WATERSIDE_MONUMENT_FORMS,
  "ancient-way": ["ceremonial-road-arch"],
  highland: ["crossing-stone-viaduct"],
} as const;

// Use a reproducible headless renderer for the monument screenshot tour.
// The Windows native compositor can fail SharedImage allocation before traversal.
test.use({
  launchOptions: {
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
});

for (const biome of Object.keys(DECKS) as (keyof typeof DECKS)[]) {
  for (const mobile of [true]) {
    test(
      "shows " +
        biome +
        " district monuments throughout a long ride " +
        (mobile ? "@mobile" : "desktop"),
      async ({ page }, testInfo) => {
        test.setTimeout(300_000);
        const environment = normalizeEnvironment({
          seed: "lake-tour",
          landscape: "countryside",
          terrain: "gentle",
          graphics: "low",
          time: "day",
          biomeFrequencies: {
            countryside: Object.fromEntries(
              biomesFor("countryside").map((id) => [
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
        await expect
          .poll(() =>
            page.evaluate(() => window.__INFINIBIKE_DEBUG__?.assetLibrary),
          )
          .toBe("ready");
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
        await page
          .locator(".modal-layer")
          .evaluate(
            (element) => ((element as HTMLElement).style.display = "none"),
          );
        expect(
          Number(
            await page.evaluate(
              () => window.__INFINIBIKE_DEBUG__!.contextLosses,
            ),
          ),
        ).toBe(0);
        if (biome === "lakeside") {
          const shoreline = await page.evaluate(() =>
            window
              .__INFINIBIKE_VISUAL_QA__!.scenery(23)
              .filter((item) => item.id.includes(":approach:")),
          );
          expect(shoreline.length).toBeGreaterThan(0);
          await page.evaluate(() =>
            window.__INFINIBIKE_VISUAL_QA__!.setDistance(5830),
          );
          await page.screenshot({
            path: testInfo.outputPath("shoreline-approach.png"),
          });
        }
        const monuments = await page.evaluate(async (forms) => {
          const qa = window.__INFINIBIKE_VISUAL_QA__!;
          const results: ReturnType<typeof qa.scenery> = [];
          for (let index = 0; index < 120; index++) {
            results.push(
              ...qa
                .scenery(index)
                .filter(
                  (item) =>
                    item.architecture?.monumental &&
                    forms.some((form) => form === item.architecture!.form),
                ),
            );
            if (index % 4 === 0)
              await new Promise<void>((resolve) =>
                requestAnimationFrame(() => resolve()),
              );
          }
          return results;
        }, DECKS[biome]);
        expect(monuments.length).toBeGreaterThanOrEqual(
          DECKS[biome].length * 2,
        );
        expect(monuments.length).toBeLessThanOrEqual(30);
        for (const form of DECKS[biome]) {
          const monument = monuments.find(
            (item) =>
              item.architecture!.form === form &&
              Number(item.id.split(":")[2]) >= 500,
          );
          expect(monument).toBeTruthy();
          const distance = Number(monument!.id.split(":")[2]);
          for (const quality of ["low", "high", "medium"] as const) {
            await page.evaluate(
              ({ distance, quality }) => {
                const qa = window.__INFINIBIKE_VISUAL_QA__!;
                qa.setGraphics(quality);
                qa.setDistance(distance - 200);
              },
              { distance, quality },
            );
            const diagnostics = await page.evaluate(
              () => window.__INFINIBIKE_DEBUG__!,
            );
            expect(
              await page.evaluate(() =>
                window.__INFINIBIKE_VISUAL_QA__!.renderedCityMonuments(),
              ),
            ).toContain(monument!.id);
            expect(Number(diagnostics.geometries)).toBeLessThanOrEqual(700);
            expect(Number(diagnostics.calls)).toBeLessThanOrEqual(1700);
            expect(Number(diagnostics.triangles)).toBeLessThanOrEqual(
              10_000_000,
            );
            expect(Number(diagnostics.chunks)).toBeLessThanOrEqual(13);
            expect(
              Number(diagnostics.contextLosses),
              JSON.stringify({ form, quality, diagnostics }),
            ).toBe(0);
            expect(
              await page.evaluate(
                (index) => window.__INFINIBIKE_VISUAL_QA__!.scenery(index),
                Math.floor(distance / 250),
              ),
            ).toContainEqual(monument);
          }
          if (isCrossing(form)) {
            for (const mode of ["close", "wide", "handlebar"] as const)
              for (let offset = -50; offset <= 50; offset += 10) {
                const diagnostics = await page.evaluate(
                  ({ mode, distance, offset }) => {
                    const qa = window.__INFINIBIKE_VISUAL_QA__!;
                    qa.setCamera(mode);
                    qa.setDistance(distance + offset);
                    return window.__INFINIBIKE_DEBUG__!;
                  },
                  { mode, distance, offset },
                );
                expect(Number(diagnostics.contextLosses)).toBe(0);
              }
            await page.evaluate((distance) => {
              const qa = window.__INFINIBIKE_VISUAL_QA__!;
              qa.setCamera("wide");
              qa.setDistance(distance - 30);
            }, distance);
            await page.screenshot({
              path: testInfo.outputPath(form + "-crossing.png"),
            });
          }
          if (mobile)
            await page.evaluate(
              (distance) =>
                window.__INFINIBIKE_VISUAL_QA__!.setDistance(distance - 350),
              distance,
            );
          await page.screenshot({ path: testInfo.outputPath(form + ".png") });
          const colors = await page
            .locator("canvas")
            .first()
            .evaluate((canvas, distance) => {
              window.__INFINIBIKE_VISUAL_QA__!.setDistance(distance - 200);
              const target = document.createElement("canvas");
              target.width = target.height = 32;
              const context = target.getContext("2d")!;
              context.drawImage(canvas as HTMLCanvasElement, 0, 0, 32, 32);
              const data = context.getImageData(0, 0, 32, 32).data;
              const colors = new Set<string>();
              for (let i = 0; i < data.length; i += 4)
                colors.add([data[i], data[i + 1], data[i + 2]].join(":"));
              return colors.size;
            }, distance);
          expect(colors).toBeGreaterThan(20);
          await page.evaluate(
            (distance) =>
              window.__INFINIBIKE_VISUAL_QA__!.setDistance(distance - 100),
            distance,
          );
          await page.screenshot({
            path: testInfo.outputPath(form + "-passing.png"),
          });
        }
        for (let distance = 0; distance <= 30000; distance += 1000) {
          const diagnostics = await page.evaluate((distance) => {
            window.__INFINIBIKE_VISUAL_QA__!.setDistance(distance);
            return window.__INFINIBIKE_DEBUG__!;
          }, distance);
          expect(Number(diagnostics.chunks)).toBeLessThanOrEqual(13);
          expect(Number(diagnostics.geometries)).toBeLessThanOrEqual(700);
          expect(Number(diagnostics.calls)).toBeLessThanOrEqual(1700);
          expect(Number(diagnostics.triangles)).toBeLessThanOrEqual(10_000_000);
          expect(Number(diagnostics.contextLosses)).toBe(0);
        }
        expect(errors).toEqual([]);
        await testInfo.attach("monuments", {
          body: JSON.stringify(monuments),
          contentType: "application/json",
        });
      },
    );
  }
}
