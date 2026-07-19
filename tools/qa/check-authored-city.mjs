/* global window */
import process from "node:process";
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const landscape = process.argv[2] === "countryside" ? "countryside" : "city";
const actor = process.argv[3];
try {
  const page = await browser.newPage({
    viewport: { width: 2560, height: 1440 },
  });
  await page.goto(`http://127.0.0.1:4173${actor ? "?visualQa=1" : ""}`);
  await page.getByRole("button", { name: "Ride with keys or touch" }).click();
  await page.locator("#seed").fill("windows-visual-qa");
  await page.locator("#landscape").selectOption(landscape);
  await page.locator("#graphics").selectOption("high");
  await page.getByRole("button", { name: "Start ride" }).click();
  await page.waitForFunction(
    () => window.__INFINIBIKE_DEBUG__?.assetLibrary === "ready",
    undefined,
    { timeout: 30_000 },
  );
  if (actor) {
    const actorDistance = await page.evaluate(
      (kind) => window.__INFINIBIKE_VISUAL_QA__?.findMovingActor(kind) ?? -1,
      actor,
    );
    await page.evaluate(
      (distance) => window.__INFINIBIKE_VISUAL_QA__?.setDistance(distance),
      Math.max(0, actorDistance - 18),
    );
    const modalLayer = page.locator(".modal-layer");
    if ((await modalLayer.count()) > 0)
      await modalLayer.evaluate((element) => {
        element.style.display = "none";
      });
    await page.waitForTimeout(700);
  } else {
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(2_500);
    await page.keyboard.up("ArrowUp");
  }
  const diagnostics = await page.evaluate(() => window.__INFINIBIKE_DEBUG__);
  await page.screenshot({
    path: `test-results/authored-${landscape}${actor ? `-${actor}` : ""}-1440p.png`,
    animations: "disabled",
  });
  process.stdout.write(`${JSON.stringify(diagnostics)}\n`);
} finally {
  await browser.close();
}
