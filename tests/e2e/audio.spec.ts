import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createServer, type ViteDevServer } from "vite";
import type {} from "./fixtures/audio";

let server: ViteDevServer;
let audioUrl: string;
let appUrl: string;
test.beforeAll(async () => {
  server = await createServer({
    base: "/infinibike/",
    server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
    logLevel: "error",
  });
  await server.listen();
  appUrl = server.resolvedUrls!.local[0]!;
  audioUrl = `${appUrl}tests/e2e/fixtures/audio.html`;
});
test.afterAll(async () => {
  await server?.close();
});

for (const mobile of [false, true]) {
  test(`hybrid soundtrack controls persist and expose credits ${mobile ? "@mobile" : "desktop"}`, async ({
    page,
  }, testInfo) => {
    await page.goto(`${appUrl}?e2e=1`);
    await page.getByRole("button", { name: "Ride with keys or touch" }).click();
    await page.locator("#graphics").selectOption("low");
    await page.locator("#music-style").selectOption("american-folk");
    await page.locator("#music-volume").fill("43");
    await page.locator("#terrain-volume").fill("0");
    await page.reload();
    await page.getByRole("button", { name: "Ride with keys or touch" }).click();
    await expect(page.locator("#music-style")).toHaveValue("american-folk");
    await expect(page.locator("#music-volume")).toHaveValue("43");
    await expect(page.locator("#terrain-volume")).toHaveValue("0");
    await page.getByText("Audio credits", { exact: true }).click();
    await expect(page.getByText(/Salamander Grand Piano v3/)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "CC BY 3.0", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("audio-settings.png"),
      fullPage: true,
    });
    await page.locator("#ambient-audio").check();
    await expect(page.locator(".audio-status")).not.toHaveText("Sound off");
    await page.getByRole("button", { name: "Start ride", exact: true }).click();
    await page.locator("#pause").click();
    await expect(page.locator("#music-style")).toHaveValue("american-folk");
    await page.locator("#music-style").selectOption("jazz");
    await page.locator("#music-volume").fill("62");
    await page.locator("#resume").click();
    await page.locator("#audio").click();
    await expect(page.locator("#audio")).toHaveAttribute(
      "title",
      "Enable music and terrain sounds",
    );
    await page.locator("#audio").click();
    await expect(page.locator("#audio")).toHaveAttribute(
      "title",
      "Mute music and terrain sounds",
    );
    await page.locator("#pause").click();
    await expect(page.locator("#music-style")).toHaveValue("jazz");
    await expect(page.locator("#music-volume")).toHaveValue("62");
    await page.screenshot({
      path: testInfo.outputPath("audio-pause-settings.png"),
      fullPage: true,
    });
  });

  test(`real audio lifecycle, downloads and next-bar style changes ${mobile ? "@mobile" : "desktop"}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(audioUrl);
    await page.locator("#start").click();
    await expect
      .poll(() => page.evaluate(() => window.audioQA.ride.diagnostics.running))
      .toBe(true);
    await expect
      .poll(
        () => page.evaluate(() => window.audioQA.ride.diagnostics.pending),
        { timeout: 30000 },
      )
      .toBe(0);
    expect(
      await page.evaluate(() => window.audioQA.ride.diagnostics.failed),
    ).toBe(0);
    await expect
      .poll(
        () => page.evaluate(() => window.audioQA.ride.diagnostics.sampledNotes),
        { timeout: 20000 },
      )
      .toBeGreaterThan(0);
    await page.evaluate(async () => {
      await Promise.all([
        window.audioQA.ride.start(),
        window.audioQA.ride.start(),
      ]);
    });
    expect(
      await page.evaluate(() => window.audioQA.ride.diagnostics.timerCount),
    ).toBe(1);
    await page.evaluate(() =>
      window.audioQA.ride.configure({
        musicStyle: "jazz",
        musicVolume: 0.7,
        terrainVolume: 0,
      }),
    );
    await expect
      .poll(() => page.evaluate(() => window.audioQA.ride.diagnostics.style))
      .toBe("jazz");
    await page.locator("#pause").click();
    await expect
      .poll(() => page.evaluate(() => window.audioQA.ride.diagnostics.voices))
      .toBe(0);
    expect(
      await page.evaluate(() => window.audioQA.ride.diagnostics.running),
    ).toBe(false);
    await page.locator("#resume").click();
    await expect
      .poll(() => page.evaluate(() => window.audioQA.ride.diagnostics.running))
      .toBe(true);
    await page.locator("#mute").click();
    await expect
      .poll(() => page.evaluate(() => window.audioQA.ride.diagnostics.voices))
      .toBe(0);
    await page.locator("#enable").click();
    await expect
      .poll(() => page.evaluate(() => window.audioQA.ride.diagnostics.running))
      .toBe(true);
    const diagnostic = await page.evaluate(
      () => window.audioQA.ride.diagnostics,
    );
    expect(diagnostic.peakVoices).toBeLessThanOrEqual(32);
    expect(diagnostic.decodedBytes).toBeLessThanOrEqual(96 * 1024 * 1024);
    await page.evaluate(() => window.audioQA.ride.dispose());
    expect(
      await page.evaluate(() => window.audioQA.ride.diagnostics.timerCount),
    ).toBe(0);
    expect(errors).toEqual([]);
  });
}

test("sample decoding, rendered headroom, release tails and voice cap", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.goto(audioUrl);
  await page.waitForFunction(() => Boolean(window.audioQA));
  const decoded = await page.evaluate(() => window.audioQA.decodeBank());
  expect(decoded.count).toBe(92);
  expect(decoded.silent).toEqual([]);
  expect(decoded.bytes).toBeLessThanOrEqual(96 * 1024 * 1024);
  for (const style of [
    "neo-classical",
    "jazz",
    "blues",
    "american-folk",
  ] as const) {
    for (const sampled of [false, true]) {
      const result = await page.evaluate(
        ({ style, sampled }) => window.audioQA.render(style, 55, 18, sampled),
        { style, sampled },
      );
      expect(result.nonfinite).toBe(0);
      if (sampled) {
        expect(result.decodedBytes).toBeGreaterThan(1_000_000);
        expect(result.sampledNotes).toBeGreaterThan(0);
      }
      expect(result.rms).toBeGreaterThan(0.0001);
      expect(result.peak).toBeLessThan(0.98);
      expect(result.tail).toBeLessThan(0.001);
    }
  }
  expect(
    await page.evaluate(() => window.audioQA.stressVoices()),
  ).toBeLessThanOrEqual(32);
});

test("slow downloads keep playback moving and adopt samples at a phrase boundary", async ({
  page,
}) => {
  await page.route("**/assets/audio/**/*.mp3", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await route.continue();
  });
  await page.goto(audioUrl);
  await page.locator("#start").click();
  await expect
    .poll(() =>
      page.evaluate(() => window.audioQA.ride.diagnostics.synthesizedNotes),
    )
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(() => window.audioQA.ride.diagnostics.sampledNotes),
  ).toBe(0);
  expect(await page.evaluate(() => window.audioQA.ride.status)).toContain(
    "Loading",
  );
  await expect
    .poll(
      () => page.evaluate(() => window.audioQA.ride.diagnostics.sampledNotes),
      { timeout: 25000 },
    )
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(() => window.audioQA.ride.diagnostics.running),
  ).toBe(true);
  await page.evaluate(() => window.audioQA.ride.dispose());
});

test("unavailable audio leaves the ride usable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "AudioContext", {
      value: class {
        constructor() {
          throw new Error("Audio unavailable");
        }
      },
    });
  });
  await page.goto(`${appUrl}?e2e=1`);
  await page.getByRole("button", { name: "Ride with keys or touch" }).click();
  await page.locator("#graphics").selectOption("low");
  await page.locator("#ambient-audio").check();
  await expect(page.locator(".audio-status")).toContainText(
    "Audio unavailable",
  );
  await page.getByRole("button", { name: "Start ride", exact: true }).click();
  await expect(page.locator("#pause")).toBeVisible();
});

test("render three two-minute audition seeds per style", async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.AUDIO_RENDERS !== "1",
    "Run explicitly with AUDIO_RENDERS=1",
  );
  test.setTimeout(10 * 60 * 1000);
  await page.goto(audioUrl);
  await page.waitForFunction(() => Boolean(window.audioQA));
  const measurements = [];
  for (const style of [
    "neo-classical",
    "jazz",
    "blues",
    "american-folk",
  ] as const) {
    for (const seed of [55, 1977, 771]) {
      const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
      const measurement = await page.evaluate(
        ({ style, seed }) =>
          window.audioQA.render(style, seed, 120, true, true),
        { style, seed },
      );
      const download = await downloadPromise;
      await download.saveAs(testInfo.outputPath(`${style}-${seed}.wav`));
      expect(measurement.nonfinite).toBe(0);
      expect(measurement.peak).toBeLessThan(0.98);
      expect(measurement.rms).toBeGreaterThan(0.0001);
      expect(measurement.sampledNotes).toBeGreaterThan(0);
      measurements.push({ style, seed, ...measurement });
    }
  }
  const report = testInfo.outputPath("measurements.json");
  await writeFile(report, JSON.stringify(measurements, null, 2));
  await testInfo.attach("render-measurements", {
    path: report,
    contentType: "application/json",
  });
});

test("failed samples fall back, then retry on explicit enable", async ({
  page,
}) => {
  await page.route("**/assets/audio/**/*.mp3", (route) => route.abort());
  await page.goto(audioUrl);
  await page.locator("#start").click();
  await expect
    .poll(() => page.evaluate(() => window.audioQA.ride.diagnostics.failed))
    .toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(() => window.audioQA.ride.diagnostics.peakVoices))
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => window.audioQA.ride.status)).toContain(
    "synthesized",
  );
  await page.locator("#mute").click();
  await page.unroute("**/assets/audio/**/*.mp3");
  await page.locator("#enable").click();
  await expect
    .poll(() => page.evaluate(() => window.audioQA.ride.diagnostics.pending))
    .toBe(0);
  expect(
    await page.evaluate(() => window.audioQA.ride.diagnostics.failed),
  ).toBe(0);
  await page.evaluate(() => window.audioQA.ride.dispose());
});

test("30-minute audio soak", async ({ page }) => {
  test.skip(process.env.AUDIO_SOAK !== "1", "Run explicitly with AUDIO_SOAK=1");
  test.setTimeout(32 * 60 * 1000);
  await page.goto(audioUrl);
  await page.locator("#start").click();
  await page.evaluate(() =>
    window.audioQA.ride.configure({
      musicStyle: "mix",
      musicVolume: 0.7,
      terrainVolume: 0.5,
    }),
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (let minute = 0; minute < 30; minute++) {
    await page.waitForTimeout(60_000);
    const diagnostic = await page.evaluate(
      () => window.audioQA.ride.diagnostics,
    );
    expect(diagnostic.running).toBe(true);
    expect(diagnostic.timerCount).toBe(1);
    expect(diagnostic.voices).toBeLessThanOrEqual(32);
    expect(diagnostic.peakVoices).toBeLessThanOrEqual(32);
    expect(diagnostic.decodedBytes).toBeLessThanOrEqual(96 * 1024 * 1024);
    expect(diagnostic.failed).toBe(0);
    console.log(
      `Audio soak minute ${minute + 1}: ${JSON.stringify(diagnostic)}`,
    );
  }
  await page.evaluate(() => window.audioQA.ride.dispose());
  expect(errors).toEqual([]);
});
