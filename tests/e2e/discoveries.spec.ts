import { expect, test } from "@playwright/test";
import { normalizeEnvironment } from "../../src/domain/environment";
import { JOURNAL_KEY } from "../../src/domain/discovery-journal";

test.use({
  launchOptions: {
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
});
test("surreal events and discovery journal survive tablet touring and reload @mobile", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  test.skip(
    testInfo.project.name === "mobile",
    "Discovery tour camera fixtures require the landscape tablet viewport.",
  );
  const environment = normalizeEnvironment({
    seed: "quiet-tour",
    landscape: "dreamscape",
    terrain: "gentle",
    time: "night",
    graphics: "low",
  });
  await page.addInitScript((environment) => {
    if (!localStorage.getItem("infinibike.preferences.v1"))
      localStorage.setItem(
        "infinibike.preferences.v1",
        JSON.stringify({
          environment,
          cameraSettings: {
            mode: "wide",
            angle: "center",
            reducedMotion: false,
          },
        }),
      );
  }, environment);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?visualQa=1&e2e=1");
  await expect
    .poll(() => page.evaluate(() => window.__INFINIBIKE_DEBUG__?.assetLibrary))
    .toBe("ready");
  await page.getByRole("button", { name: "Discoveries", exact: true }).click();
  await expect(page.locator("#journal-progress")).toContainText("0 of");
  await page.getByLabel("Category", { exact: true }).selectOption("Events");
  await page.getByLabel("Biome", { exact: true }).selectOption("dreamwood");
  await expect(page.locator('[data-discovery="spectral-deer"]')).toContainText(
    "Not yet discovered",
  );
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Ride with keys or touch" }).click();
  await page.getByRole("button", { name: "Start ride" }).click();
  await page.getByRole("button", { name: "Pause ride" }).click();
  await page.evaluate(() => window.__INFINIBIKE_VISUAL_QA__!.freeze());
  const sites = await page.evaluate(() => {
    const sites: Record<string, { id: string; distance: number }[]> = {};
    for (let index = 0; index < 120; index++)
      for (const item of window.__INFINIBIKE_VISUAL_QA__!.scenery(index)) {
        if (
          ["assembling-stones", "mushroom-spores", "spectral-deer"].includes(
            item.scenicDetail ?? "",
          )
        )
          (sites[item.scenicDetail!] ??= []).push({
            id: item.id,
            distance: Number(item.id.split(":")[2]),
          });
      }
    return sites;
  });
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  for (const kind of [
    "assembling-stones",
    "mushroom-spores",
    "spectral-deer",
  ]) {
    expect(sites[kind]?.length, kind).toBeGreaterThan(0);
    const site = sites[kind]![0]!;
    const frames = await page.evaluate((site) => {
      const qa = window.__INFINIBIKE_VISUAL_QA__!;
      qa.setDistance(site.distance - 65);
      qa.advanceActors(6);
      const before = qa
        .lifeFrames()
        .filter((item) => item.id === site.id && item.visible);
      qa.advanceActors(8);
      return {
        before,
        after: qa
          .lifeFrames()
          .filter((item) => item.id === site.id && item.visible),
        discoveries: qa.discoveries(),
      };
    }, site);
    expect(frames.before.length, kind).toBeGreaterThan(0);
    expect(frames.after).not.toEqual(frames.before);
    await page.screenshot({ path: testInfo.outputPath(`${kind}.png`) });
    // Realtime discovery collection runs after rendering, using the same camera checks.
    await expect
      .poll(() =>
        page.evaluate(
          ({ key, kind }) => {
            window.__INFINIBIKE_VISUAL_QA__!.advanceActors(0);
            return JSON.parse(
              localStorage.getItem(key) ?? '{"entries":[]}',
            ).entries.some((item: { id: string }) => item.id === kind);
          },
          { key: JOURNAL_KEY, kind },
        ),
      )
      .toBe(true);
    await page.evaluate(() =>
      window.__INFINIBIKE_VISUAL_QA__!.advanceActors(65),
    );
    expect(
      await page.evaluate(
        (id) =>
          window
            .__INFINIBIKE_VISUAL_QA__!.lifeFrames()
            .some((item) => item.id === id && item.visible),
        site.id,
      ),
    ).toBe(false);
    // Quality rebuilding must not restart an expired opportunity.
    await page.evaluate(() =>
      window.__INFINIBIKE_VISUAL_QA__!.setGraphics("medium"),
    );
    expect(
      await page.evaluate(
        (id) =>
          window
            .__INFINIBIKE_VISUAL_QA__!.lifeFrames()
            .some((item) => item.id === id && item.visible),
        site.id,
      ),
    ).toBe(false);
    await page.evaluate(() =>
      window.__INFINIBIKE_VISUAL_QA__!.setGraphics("low"),
    );
  }
  for (const distance of [1000, 5000, 10000, 20000, 30000]) {
    await page.evaluate(
      (distance) => window.__INFINIBIKE_VISUAL_QA__!.setDistance(distance),
      distance,
    );
    const debug = await page.evaluate(() => window.__INFINIBIKE_DEBUG__!);
    expect(Number(debug.chunks)).toBeLessThanOrEqual(13);
    expect(Number(debug.geometries)).toBeLessThanOrEqual(700);
    expect(Number(debug.calls)).toBeLessThanOrEqual(1700);
    expect(Number(debug.contextLosses)).toBe(0);
  }
  await page.getByRole("button", { name: "Pause ride" }).click();
  await page.getByRole("button", { name: "End ride", exact: true }).click();
  await page.getByRole("button", { name: "Open discovery journal" }).click();
  const card = page.locator('[data-discovery="spectral-deer"]');
  await expect(card).toContainText("\u2713 Discovered");
  await expect(card.locator("img")).toBeVisible();
  expect(
    await card
      .locator("img")
      .evaluate(
        (image: HTMLImageElement) =>
          image.complete && image.naturalWidth === 320,
      ),
  ).toBe(true);
  const colors = await card
    .locator("img")
    .evaluate((image: HTMLImageElement) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 32;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0, 32, 32);
      const data = ctx.getImageData(0, 0, 32, 32).data,
        colors = new Set<string>();
      for (let i = 0; i < data.length; i += 4)
        colors.add(`${data[i]}:${data[i + 1]}:${data[i + 2]}`);
      return colors.size;
    });
  expect(colors).toBeGreaterThan(20);
  await page.getByLabel("Category", { exact: true }).selectOption("Events");
  await page.getByLabel("Biome", { exact: true }).selectOption("dreamwood");
  await page.screenshot({ path: testInfo.outputPath("journal.png") });
  await page.reload();
  await page.getByRole("button", { name: "Discoveries", exact: true }).click();
  await expect(card).toContainText("\u2713 Discovered");
  await page.getByLabel("Show undiscovered only").check();
  await expect(card).toHaveCount(0);
  await page.getByLabel("Show undiscovered only").uncheck();
  await card.getByRole("button", { name: "Ride this route again" }).click();
  await page.getByRole("button", { name: "Ride with keys or touch" }).click();
  await expect(page.getByRole("button", { name: "Pause ride" })).toBeVisible();
  const saved = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("infinibike.preferences.v1")!)
        .environment,
  );
  expect(saved.seed).toBe(environment.seed);
  expect(saved.biomeFrequencies).toEqual(environment.biomeFrequencies);
  await page.reload();
  await page.getByRole("button", { name: "Discoveries", exact: true }).click();
  await card
    .getByRole("button", { name: "Delete Spectral Deer discovery" })
    .click();
  await expect(card).toContainText("Not yet discovered");
  await page.getByText("Manage journal data", { exact: true }).click();
  await page.getByRole("button", { name: "Clear journal..." }).click();
  await page
    .getByRole("button", { name: "Delete all discoveries", exact: true })
    .click();
  await expect(page.locator("#journal-progress")).toContainText("0 of");
  await page.reload();
  await page.getByRole("button", { name: "Discoveries", exact: true }).click();
  await expect(page.locator("#journal-progress")).toContainText("0 of");
  expect(errors).toEqual([]);
});

test("rain and reduced motion keep events bounded and aircraft discoverable @mobile", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(
    testInfo.project.name === "mobile",
    "Discovery tour camera fixtures require the landscape tablet viewport.",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  const environment = normalizeEnvironment({
    seed: "quiet-tour",
    landscape: "dreamscape",
    terrain: "gentle",
    weather: "rain",
    time: "day",
    graphics: "low",
  });
  await page.addInitScript(
    (environment) =>
      localStorage.setItem(
        "infinibike.preferences.v1",
        JSON.stringify({
          environment,
          cameraSettings: {
            mode: "wide",
            angle: "center",
            reducedMotion: true,
          },
        }),
      ),
    environment,
  );
  await page.goto("/?visualQa=1&e2e=1");
  await expect
    .poll(() => page.evaluate(() => window.__INFINIBIKE_DEBUG__?.assetLibrary))
    .toBe("ready");
  await page.getByRole("button", { name: "Discoveries", exact: true }).click();
  await page.getByLabel("Capture screenshots this session").uncheck();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Ride with keys or touch" }).click();
  await page.getByRole("button", { name: "Start ride" }).click();
  await page.getByRole("button", { name: "Pause ride" }).click();
  await page.evaluate(() => window.__INFINIBIKE_VISUAL_QA__!.freeze());
  const site = await page.evaluate(() => {
    const qa = window.__INFINIBIKE_VISUAL_QA__!;
    for (let index = 0; index < 120; index++) {
      const item = qa
        .scenery(index)
        .find((item) => item.scenicDetail === "spectral-deer");
      if (item) return { id: item.id, distance: Number(item.id.split(":")[2]) };
    }
    return undefined;
  });
  expect(site).toBeDefined();
  for (const quality of ["low", "medium", "high"] as const) {
    const frames = await page.evaluate(
      ({ site, quality }) => {
        const qa = window.__INFINIBIKE_VISUAL_QA__!;
        qa.setGraphics(quality);
        qa.setDistance(site!.distance - 65);
        const before = qa
          .lifeFrames()
          .filter((item) => item.id === site!.id && item.visible);
        qa.advanceActors(4);
        return {
          before,
          after: qa
            .lifeFrames()
            .filter((item) => item.id === site!.id && item.visible),
          discoveries: qa.discoveries(),
          debug: window.__INFINIBIKE_DEBUG__,
        };
      },
      { site, quality },
    );
    expect(frames.before).toHaveLength(1);
    expect(frames.after).toEqual(frames.before);
    expect(frames.discoveries.some((item) => item.id === "spectral-deer")).toBe(
      true,
    );
    expect(Number(frames.debug!.geometries)).toBeLessThanOrEqual(700);
  }
  // The paused preview never records encounters.
  expect(
    await page.evaluate(
      (key) =>
        JSON.parse(localStorage.getItem(key) ?? '{"entries":[]}').entries.some(
          (item: { id: string }) => item.id === "spectral-deer",
        ),
      JOURNAL_KEY,
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate((key) => {
        window.__INFINIBIKE_VISUAL_QA__!.advanceActors(0);
        return JSON.parse(
          localStorage.getItem(key) ?? '{"entries":[]}',
        ).entries.some((item: { id: string }) => item.id === "spectral-deer");
      }, JOURNAL_KEY),
    )
    .toBe(true);
  const entries = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).entries,
    JOURNAL_KEY,
  );
  expect(entries.every((item: { snapshot?: string }) => !item.snapshot)).toBe(
    true,
  );
  await page.screenshot({
    path: testInfo.outputPath("spectral-deer-rain.png"),
  });
  for (const kind of ["plane", "helicopter"] as const) {
    const discoveries = await page.evaluate((kind) => {
      const qa = window.__INFINIBIKE_VISUAL_QA__!;
      const anchor = qa.findMovingActor(kind);
      qa.setDistance(Math.max(0, anchor - (kind === "plane" ? 340 : 280)));
      return qa.discoveries();
    }, kind);
    expect(
      discoveries.some((item) => item.id === kind),
      kind,
    ).toBe(true);
  }
});
