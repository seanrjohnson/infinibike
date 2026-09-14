import { expect, test } from "@playwright/test";
import { biomesFor } from "../../src/domain/biomes";
import { normalizeEnvironment } from "../../src/domain/environment";

// Use a reproducible headless renderer for the monument screenshot tour.
// The Windows native compositor can fail SharedImage allocation before traversal.
test.use({
  launchOptions: {
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
});

for (const formUnderTest of [
  "windmill-complex",
  "monumental-dovecote",
] as const) {
  for (const mobile of [false, true]) {
    test(
      "shows " +
        formUnderTest +
        " variants throughout a long ride " +
        (mobile ? "@mobile" : "desktop"),
      async ({ page }, testInfo) => {
        test.setTimeout(300_000);
        const environment = normalizeEnvironment({
          seed: "wildlife-lookout",
          landscape: "countryside",
          terrain: "gentle",
          graphics: "low",
          time: "day",
          biomeFrequencies: {
            countryside: Object.fromEntries(
              biomesFor("countryside").map((id) => [
                id,
                id === "wildlife-meadows" ? "normal" : "off",
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
        const monuments = await page.evaluate(async (formUnderTest) => {
          const qa = window.__INFINIBIKE_VISUAL_QA__!;
          const results: ReturnType<typeof qa.scenery> = [];
          for (let index = 0; index < 120; index++) {
            results.push(
              ...qa
                .scenery(index)
                .filter((item) => item.architecture?.form === formUnderTest),
            );
            if (index % 4 === 0)
              await new Promise<void>((resolve) =>
                requestAnimationFrame(() => resolve()),
              );
          }
          return results;
        }, formUnderTest);
        expect(monuments.length).toBeGreaterThanOrEqual(3);
        expect(monuments.length).toBeLessThanOrEqual(8);
        const variants = [
          monuments[0]!,
          monuments[Math.floor(monuments.length / 2)]!,
          monuments[monuments.length - 1]!,
        ];
        expect(
          new Set(variants.map((item) => item.architecture!.signature)).size,
        ).toBe(3);
        for (const monument of variants) {
          const form = monument.architecture!.form;
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
            expect(Number(diagnostics.geometries)).toBeLessThanOrEqual(700);
            expect(Number(diagnostics.calls)).toBeLessThanOrEqual(1700);
            expect(Number(diagnostics.triangles)).toBeLessThanOrEqual(
              10_000_000,
            );
            expect(Number(diagnostics.chunks)).toBeLessThanOrEqual(13);
            expect(Number(diagnostics.monumentBirds)).toBeLessThanOrEqual(
              quality === "low" ? 4 : quality === "medium" ? 8 : 12,
            );
            expect(Number(diagnostics.monumentRotors)).toBeLessThanOrEqual(
              quality === "low" ? 2 : quality === "medium" ? 4 : 6,
            );
            const beforeMotion = await page.evaluate(() =>
              window.__INFINIBIKE_VISUAL_QA__!.monumentFrames(),
            );
            await page.evaluate(() =>
              window.__INFINIBIKE_VISUAL_QA__!.advanceActors(2.5),
            );
            const afterMotion = await page.evaluate(() =>
              window.__INFINIBIKE_VISUAL_QA__!.monumentFrames(),
            );
            const before = beforeMotion.filter(
              (item) => item.id === monument!.id && item.active,
            );
            const after = afterMotion.filter(
              (item) => item.id === monument!.id && item.active,
            );
            expect(before.length).toBeGreaterThan(0);
            expect(after).not.toEqual(before);
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
          // Portrait views need a longer approach to include the roadside parcel.
          if (mobile)
            await page.evaluate(
              (distance) =>
                window.__INFINIBIKE_VISUAL_QA__!.setDistance(distance - 400),
              distance,
            );
          await page.screenshot({
            path: testInfo.outputPath(form + "-" + distance + ".png"),
          });
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
        }
        const firstDistance = Number(monuments[0]!.id.split(":")[2]);
        await page.evaluate(
          (distance) =>
            window.__INFINIBIKE_VISUAL_QA__!.setDistance(distance - 70),
          firstDistance,
        );
        await page.screenshot({
          path: testInfo.outputPath(formUnderTest + "-passing.png"),
        });
        expect(errors).toEqual([]);
        await testInfo.attach("monuments", {
          body: JSON.stringify(monuments),
          contentType: "application/json",
        });
      },
    );
  }
}
