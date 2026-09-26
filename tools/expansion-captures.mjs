import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";
/* global window */

const label = process.argv[2] ?? "review";
const baseURL = process.argv[3] ?? "http://127.0.0.1:4173";
const full = process.argv.includes("--full");
const directory = `test-results/expansion-${label}`;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch();
const records = [];
try {
  for (const landscape of ["countryside", "city"]) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    page.setDefaultTimeout(180_000);
    await page.goto(`${baseURL}/?visualQa=1`);
    await page.getByRole("button", { name: "Ride with keys or touch" }).click();
    await page.locator("#seed").fill("windows-visual-qa");
    await page.locator("#landscape").selectOption(landscape);
    await page.locator("#graphics").selectOption("medium");
    await page.getByRole("button", { name: "Start ride" }).click();
    await page.getByRole("button", { name: "Pause ride" }).click();
    await page.waitForFunction(
      () => window.__INFINIBIKE_DEBUG__?.assetLibrary === "ready",
    );
    await page.evaluate(() => window.__INFINIBIKE_VISUAL_QA__.freeze());
    await page.locator(".modal-layer").evaluate((element) => {
      element.style.display = "none";
    });
    const fixtures = await page.evaluate((kind) => {
      const qa = window.__INFINIBIKE_VISUAL_QA__;
      return kind === "city"
        ? {
            turn: qa.findCityTurnDistance(),
            elevated: qa.findCityHillDistance(),
          }
        : {
            fork: qa.findCountrysideRouteEvent("fork"),
            bend: qa.findCountrysideRouteEvent("bend"),
            lakeshore: qa.findRegionDistance("lakeside"),
            elevated: qa.findRegionDistance("highland"),
          };
    }, landscape);
    for (const [fixture, distance] of Object.entries(fixtures)) {
      if (distance < 0) throw new Error(`Missing ${fixture}`);
      for (const offset of full ? [-35, 0, 55] : [0]) {
        for (const mode of full ? ["close", "wide", "handlebar"] : ["wide"]) {
          for (const angle of full ? ["left", "center", "right"] : ["center"]) {
            await page
              .locator("#pause-angle")
              .selectOption(angle, { force: true });
            await page.evaluate(
              ({ distance, mode, angle }) => {
                const qa = window.__INFINIBIKE_VISUAL_QA__;
                qa.setCamera(mode, angle);
                qa.setDistance(distance);
                qa.settleExpansion?.();
              },
              { distance: Math.max(0, distance + offset), mode, angle },
            );
            const name = `${landscape}-${fixture}-${offset}-${mode}-${angle}`;
            await page.screenshot({ path: `${directory}/${name}.png` });
            records.push({
              name,
              distance: distance + offset,
              diagnostics: await page.evaluate(
                () => window.__INFINIBIKE_DEBUG__,
              ),
            });
          }
        }
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
  await writeFile(
    `${directory}/fixtures.json`,
    JSON.stringify(records, null, 2),
  );
}
