import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { normalizeEnvironment } from "../../src/domain/environment";
import { biomesFor } from "../../src/domain/biomes";

for (const suffix of ["desktop", "@mobile"]) {
  test(`keeps KJY4EJ horizon stable while terrain loads ${suffix}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const environment = normalizeEnvironment({
      seed: "KJY4EJ",
      graphics: "medium",
      biomeFrequencies: {
        countryside: Object.fromEntries(
          biomesFor("countryside").map((id) => [
            id,
            id === "ancient-way" ? "normal" : "off",
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
    await page.goto("/?visualQa=1&e2e=1");
    await page.getByRole("button", { name: "Ride with keys or touch" }).click();
    await page.getByRole("button", { name: "Start ride" }).click();
    await page.getByRole("button", { name: "Pause ride" }).click();
    await expect
      .poll(() =>
        page.evaluate(() => window.__INFINIBIKE_DEBUG__?.assetLibrary),
      )
      .toBe("ready");
    await page.evaluate(() => {
      window.__INFINIBIKE_VISUAL_QA__!.freeze();
      window.__INFINIBIKE_VISUAL_QA__!.setCamera("handlebar");
    });
    const result = await page.evaluate(async () => {
      const qa = window.__INFINIBIKE_VISUAL_QA__!;
      const captures: Record<string, string> = {};
      const canvas = document.querySelector<HTMLCanvasElement>("#world")!;
      let maxCalls = 0,
        maxGeometries = 0;
      for (let distance = 0; distance <= 2100; distance += 5) {
        qa.setDistance(distance, false);
        maxCalls = Math.max(
          maxCalls,
          Number(window.__INFINIBIKE_DEBUG__!.calls),
        );
        maxGeometries = Math.max(
          maxGeometries,
          Number(window.__INFINIBIKE_DEBUG__!.geometries),
        );
        if (distance % 50 === 0 && distance >= 750)
          captures[String(distance)] = canvas.toDataURL();
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
      }
      qa.settleExpansion();
      const target = document.createElement("canvas");
      target.width = target.height = 64;
      const context = target.getContext("2d")!;
      context.drawImage(canvas, 0, 0, 64, 64);
      const pixels = context.getImageData(0, 0, 64, 64).data;
      const colors = new Set<string>();
      for (let i = 0; i < pixels.length; i += 4)
        colors.add(`${pixels[i]}:${pixels[i + 1]}:${pixels[i + 2]}`);
      return {
        captures,
        maxCalls,
        maxGeometries,
        colors: colors.size,
        fallback: window.__INFINIBIKE_DEBUG__!.terrainFallbackTiles,
      };
    });
    for (const [phase, data] of Object.entries(result.captures))
      await writeFile(
        testInfo.outputPath(`${phase}.png`),
        Buffer.from(data.split(",")[1]!, "base64"),
      );
    expect(result.colors).toBeGreaterThan(20);
    expect(result.maxCalls).toBeLessThanOrEqual(1700);
    expect(result.maxGeometries).toBeLessThanOrEqual(700);
    expect(result.fallback).toBe(0);
    expect(errors).toEqual([]);
  });
}
