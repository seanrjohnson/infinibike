import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import process from "node:process";
/* global window, performance, requestAnimationFrame, console */
const label = process.argv[2];
const baseURL = process.argv[3];
const directory = `test-results/performance-${label}`;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch();
const results = [];
for (const landscape of ["city", "countryside"]) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1.5,
    recordVideo: { dir: directory, size: { width: 960, height: 600 } },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
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
  await page
    .locator(".modal-layer")
    .evaluate((e) => (e.style.display = "none"));
  await page.evaluate(() => window.__INFINIBIKE_VISUAL_QA__.setDistance(235));
  const measurements = await page.evaluate(async () => {
    const intervals = [],
      submissions = [];
    let previous = performance.now();
    for (let distance = 240; distance <= 270; distance += 0.75) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const now = performance.now();
      intervals.push(now - previous);
      const start = performance.now();
      window.__INFINIBIKE_VISUAL_QA__.setDistance(distance);
      submissions.push(performance.now() - start);
      previous = now;
    }
    const p = (list, percentile) =>
      list.sort((a, b) => a - b)[Math.floor((list.length - 1) * percentile)];
    return {
      frameMedianMs: p(intervals, 0.5),
      frameP95Ms: p(intervals, 0.95),
      submissionMedianMs: p(submissions, 0.5),
      submissionMaxMs: Math.max(...submissions),
      diagnostics: window.__INFINIBIKE_DEBUG__,
    };
  });
  await page.screenshot({ path: `${directory}/${landscape}.png` });
  results.push({ landscape, ...measurements });
  await context.close();
}
await browser.close();
await writeFile(
  `${directory}/measurements.json`,
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results, null, 2));
