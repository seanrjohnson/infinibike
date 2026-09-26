import { expect, test } from "@playwright/test";
import {
  BIOME_CATALOG,
  biomesFor,
  type BiomeId,
} from "../../src/domain/biomes";
import { normalizeEnvironment } from "../../src/domain/environment";

test.use({
  launchOptions: {
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
});
const tours = [
  ["wildlife-meadows", "flock", ["farm-gate", "stone-wall", "channel"]],
  ["lakeside", "drinking-deer", ["reeds", "footbridge"]],
  ["ancient-way", "nest", ["fallen-column"]],
  ["arcaded-city", "market", ["stepped-garden"]],
  ["dreamwood", "glow-creatures", ["stepped-garden"]],
] as const;
for (const [biome, encounter, details] of tours) {
  test(`streams living ${biome} scenery and ground details @mobile`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    const landscape = BIOME_CATALOG[biome as BiomeId].landscape;
    const environment = normalizeEnvironment({
      seed: "living-scenery",
      terrain: "gentle",
      graphics: "low",
      landscape,
      time: biome === "dreamwood" ? "night" : "day",
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
    await expect
      .poll(() =>
        page.evaluate(() => window.__INFINIBIKE_DEBUG__?.assetLibrary),
      )
      .toBe("ready");
    await page.getByRole("button", { name: "Ride with keys or touch" }).click();
    await page.getByRole("button", { name: "Start ride" }).click();
    await page.getByRole("button", { name: "Pause ride" }).click();
    await page.evaluate(() => window.__INFINIBIKE_VISUAL_QA__!.freeze());
    await page
      .locator(".modal-layer")
      .evaluate((element) => ((element as HTMLElement).style.display = "none"));
    const sites = await page.evaluate(() => {
      const sites: Record<string, { id: string; distance: number }> = {};
      for (let index = 0; index < 40; index++)
        for (const item of window.__INFINIBIKE_VISUAL_QA__!.scenery(index)) {
          if (
            item.scenicDetail &&
            !sites[item.scenicDetail] &&
            Number(item.id.split(":")[4]) === 0
          )
            sites[item.scenicDetail] = {
              id: item.id,
              distance: Number(item.id.split(":")[2]),
            };
        }
      return sites;
    });
    for (const feature of [encounter, ...details]) {
      expect(sites[feature], feature).toBeDefined();
      await page.evaluate(
        (distance) =>
          window.__INFINIBIKE_VISUAL_QA__!.setDistance(
            Math.max(0, distance - 30),
          ),
        sites[feature]!.distance,
      );
      await page.screenshot({ path: testInfo.outputPath(`${feature}.png`) });
    }
    const site = sites[encounter]!;
    for (const quality of ["low", "medium", "high"] as const) {
      const frames = await page.evaluate(
        ({ quality, site }) => {
          const qa = window.__INFINIBIKE_VISUAL_QA__!;
          qa.setGraphics(quality);
          qa.setDistance(Math.max(0, site.distance - 30));
          const before = qa
            .lifeFrames()
            .filter((item) => item.visible && item.id === site.id);
          qa.advanceActors(2);
          return {
            before,
            after: qa
              .lifeFrames()
              .filter((item) => item.visible && item.id === site.id),
            count: qa.lifeFrames().filter((item) => item.visible).length,
          };
        },
        { quality, site },
      );
      expect(frames.before).toHaveLength(3);
      expect(frames.after).toHaveLength(3);
      expect(frames.after).not.toEqual(frames.before);
      expect(frames.count).toBeLessThanOrEqual(
        quality === "low" ? 6 : quality === "medium" ? 12 : 18,
      );
    }
    await page.evaluate(() =>
      window.__INFINIBIKE_VISUAL_QA__!.setGraphics("low"),
    );
    for (const distance of [1000, 5000, 10000, 20000, 30000]) {
      await page.evaluate(
        (distance) => window.__INFINIBIKE_VISUAL_QA__!.setDistance(distance),
        distance,
      );
      const debug = await page.evaluate(() => window.__INFINIBIKE_DEBUG__!);
      expect(Number(debug.chunks)).toBeLessThanOrEqual(13);
      expect(Number(debug.calls)).toBeLessThanOrEqual(1700);
      expect(Number(debug.geometries)).toBeLessThanOrEqual(700);
      expect(Number(debug.triangles)).toBeLessThanOrEqual(10_000_000);
      expect(Number(debug.contextLosses)).toBe(0);
    }
    const colors = await page
      .locator("canvas")
      .first()
      .evaluate((canvas) => {
        window.__INFINIBIKE_VISUAL_QA__!.setDistance(30000);
        const target = document.createElement("canvas");
        target.width = target.height = 32;
        const ctx = target.getContext("2d")!;
        ctx.drawImage(canvas as HTMLCanvasElement, 0, 0, 32, 32);
        const data = ctx.getImageData(0, 0, 32, 32).data,
          colors = new Set<string>();
        for (let i = 0; i < data.length; i += 4)
          colors.add(`${data[i]}:${data[i + 1]}:${data[i + 2]}`);
        return colors.size;
      });
    expect(colors).toBeGreaterThan(20);
    expect(errors).toEqual([]);
  });
}
