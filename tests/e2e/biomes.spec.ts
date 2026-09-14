import { expect, test } from "@playwright/test";
import {
  BIOME_CATALOG,
  biomeForSection,
  biomesFor,
  defaultBiomeFrequencies,
  type BiomeId,
} from "../../src/domain/biomes";
import { normalizeEnvironment } from "../../src/domain/environment";

for (const mobile of [false, true]) {
  test(`blends biome transitions across quality changes ${mobile ? "@mobile" : "desktop"}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    const environment = normalizeEnvironment({
      seed: "mixed-biomes",
      graphics: "low",
      terrain: "gentle",
      biomeFrequencies: {
        countryside: Object.fromEntries(
          biomesFor("countryside").map((id) => [
            id,
            id === "ancient-way" || id === "wildlife-meadows"
              ? "normal"
              : "off",
          ]),
        ),
      },
    });
    let section = 1;
    while (
      section < 20 &&
      biomeForSection(environment, section) ===
        biomeForSection(environment, section - 1)
    )
      section++;
    expect(section).toBeLessThan(20);
    await page.addInitScript(
      (environment) =>
        localStorage.setItem(
          "infinibike.preferences.v1",
          JSON.stringify({ environment }),
        ),
      environment,
    );
    await page.goto("/?visualQa=1");
    await page.getByRole("button", { name: "Ride with keys or touch" }).click();
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
      .evaluate((element) => ((element as HTMLElement).style.display = "none"));
    const index = section * 4;
    const before = await page.evaluate(
      (index) => window.__INFINIBIKE_VISUAL_QA__!.scenery(index),
      index,
    );
    expect(new Set(before.map((item) => item.biome)).size).toBe(2);
    for (const quality of ["low", "high", "medium"] as const) {
      await page.evaluate(
        ({ quality, distance }) => {
          const qa = window.__INFINIBIKE_VISUAL_QA__!;
          qa.setGraphics(quality);
          for (const offset of [-1, 1, 125, 249, 251])
            qa.setDistance(distance + offset);
        },
        { quality, distance: section * 1000 },
      );
      expect(
        await page.evaluate(
          (index) => window.__INFINIBIKE_VISUAL_QA__!.scenery(index),
          index,
        ),
      ).toEqual(before);
      const diagnostics = await page.evaluate(
        () => window.__INFINIBIKE_DEBUG__!,
      );
      expect(Number(diagnostics.calls)).toBeLessThanOrEqual(1700);
      expect(Number(diagnostics.geometries)).toBeLessThanOrEqual(700);
      expect(Number(diagnostics.contextLosses)).toBe(0);
    }
    await page.evaluate(
      (distance) => window.__INFINIBIKE_VISUAL_QA__!.setDistance(distance),
      section * 1000 + 100,
    );
    await page.screenshot({
      path: testInfo.outputPath("biome-transition.png"),
    });
  });
  test(`remembers biome choices, protects the last enabled biome and replays ${mobile ? "@mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.goto("/?e2e=1");
    await page.getByRole("button", { name: "Ride with keys or touch" }).click();
    await page.locator("#biome-settings summary").click();
    await page.getByLabel("Ancient Way frequency").selectOption("frequent");
    for (const id of biomesFor("countryside").filter(
      (id) => id !== "ancient-way",
    ))
      await page
        .getByLabel(`${BIOME_CATALOG[id].name} frequency`)
        .selectOption("off");
    await page.getByLabel("Ancient Way frequency").selectOption("off");
    await expect(page.getByLabel("Ancient Way frequency")).toHaveValue(
      "frequent",
    );
    await expect(page.locator("#biome-message")).toContainText(
      "Keep at least one",
    );
    await expect(page.locator('[data-biome-share="ancient-way"]')).toHaveText(
      "100% estimated share",
    );
    await page.locator("#landscape").selectOption("city");
    await page.getByLabel("Brutalist Gardens frequency").selectOption("rare");
    await page.locator("#landscape").selectOption("dreamscape");
    await expect(page.getByLabel("Dreamwood frequency")).toBeDisabled();
    await expect(page.locator('[data-biome-share="dreamwood"]')).toHaveText(
      "100% estimated share",
    );
    await page.locator("#landscape").selectOption("countryside");
    await expect(page.getByLabel("Ancient Way frequency")).toHaveValue(
      "frequent",
    );
    await page.reload();
    await page.getByRole("button", { name: "Ride with keys or touch" }).click();
    await page.locator("#biome-settings summary").click();
    await expect(page.getByLabel("Ancient Way frequency")).toHaveValue(
      "frequent",
    );
    await page.locator("#landscape").selectOption("city");
    await expect(page.getByLabel("Brutalist Gardens frequency")).toHaveValue(
      "rare",
    );
    await page.getByRole("button", { name: "Reset defaults" }).click();
    await expect(page.getByLabel("Brutalist Gardens frequency")).toHaveValue(
      "normal",
    );
    await page.locator("#landscape").selectOption("countryside");
    await expect(page.getByLabel("Ancient Way frequency")).toHaveValue(
      "frequent",
    );
    await page.getByRole("button", { name: "Start ride" }).click();
    await page.getByRole("button", { name: "Pause ride" }).click();
    await page.getByRole("button", { name: "End ride" }).click();
    await page.getByRole("button", { name: "Ride again", exact: true }).click();
    await page.getByRole("button", { name: "Pause ride" }).click();
    await page.getByRole("button", { name: "End ride" }).click();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("infinibike.rideHistory.v1")!),
    );
    expect(saved[0].environment.biomeFrequencies).toEqual(
      saved[1].environment.biomeFrequencies,
    );
    expect(
      saved[0].environment.biomeFrequencies.countryside["ancient-way"],
    ).toBe("frequent");
    expect(saved[0].environment.biomeGenerationVersion).toBe(2);
  });

  for (const id of [
    "wildlife-meadows",
    "ancient-way",
    "arcaded-city",
    "brutalist-gardens",
    "dreamwood",
  ] as BiomeId[]) {
    test(`renders and streams ${id} ${mobile ? "@mobile" : "desktop"}`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(300_000);
      const landscape = BIOME_CATALOG[id].landscape;
      const frequencies = defaultBiomeFrequencies();
      for (const other of biomesFor(landscape))
        frequencies[landscape][other] = other === id ? "normal" : "off";
      await page.addInitScript(
        ({ landscape, frequencies }) => {
          localStorage.setItem(
            "infinibike.preferences.v1",
            JSON.stringify({
              environment: {
                seed: "biome-showcase",
                landscape,
                biomeFrequencies: frequencies,
                biomeGenerationVersion: 2,
                terrain: "gentle",
                time: landscape === "dreamscape" ? "night" : "day",
                weather: landscape === "dreamscape" ? "rain" : "clear",
                graphics: "low",
              },
            }),
          );
        },
        { landscape, frequencies },
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
      for (const distance of [80, 999, 1001, 1250, 2750, 5000]) {
        await page.evaluate(
          (distance) => window.__INFINIBIKE_VISUAL_QA__!.setDistance(distance),
          distance,
        );
        const diagnostics = await page.evaluate(
          () => window.__INFINIBIKE_DEBUG__!,
        );
        expect(Number(diagnostics[`biome:${id}`])).toBeGreaterThan(0);
        expect(Number(diagnostics.chunks)).toBeLessThanOrEqual(13);
        expect(Number(diagnostics.calls)).toBeLessThanOrEqual(1700);
        expect(Number(diagnostics.triangles)).toBeLessThanOrEqual(10_000_000);
        expect(Number(diagnostics.geometries)).toBeLessThanOrEqual(700);
        expect(Number(diagnostics.contextLosses)).toBe(0);
      }
      await page.evaluate(() => {
        window.__INFINIBIKE_VISUAL_QA__!.setDistance(80);
        window.__INFINIBIKE_VISUAL_QA__!.freeze();
        window.__INFINIBIKE_VISUAL_QA__!.setDistance(80);
      });
      if (id === "wildlife-meadows" || id === "dreamwood") {
        const kind = id === "dreamwood" ? "white-deer" : "deer";
        const motion = await page.evaluate((kind) => {
          const qa = window.__INFINIBIKE_VISUAL_QA__!;
          const before = qa
            .actorFrames()
            .filter((actor) => actor.kind === kind && actor.visible);
          qa.advanceActors(2);
          return {
            before,
            after: qa
              .actorFrames()
              .filter((actor) => actor.kind === kind && actor.visible),
          };
        }, kind);
        expect(motion.before.length).toBeGreaterThan(0);
        expect(motion.after[0]!.position).not.toEqual(
          motion.before[0]!.position,
        );
      }
      const pixels = await page
        .locator("canvas")
        .first()
        .evaluate((canvas) => {
          window.__INFINIBIKE_VISUAL_QA__!.setDistance(80);
          const target = document.createElement("canvas");
          target.width = 32;
          target.height = 32;
          const context = target.getContext("2d")!;
          context.drawImage(canvas as HTMLCanvasElement, 0, 0, 32, 32);
          const data = context.getImageData(0, 0, 32, 32).data;
          const colors = new Set<string>();
          for (let i = 0; i < data.length; i += 4)
            colors.add(`${data[i]}:${data[i + 1]}:${data[i + 2]}`);
          return colors.size;
        });
      expect(pixels).toBeGreaterThan(20);
      await page.screenshot({ path: testInfo.outputPath(`${id}.png`) });
      await testInfo.attach("renderer-diagnostics", {
        body: JSON.stringify(
          await page.evaluate(() => window.__INFINIBIKE_DEBUG__),
        ),
        contentType: "application/json",
      });
      expect(errors).toEqual([]);
    });
  }
}
