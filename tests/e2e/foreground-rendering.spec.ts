import { expect, test } from "@playwright/test";

for (const suffix of ["desktop", "@mobile"]) {
  test(`renders regular ride foreground without shader failures ${suffix}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text().slice(0, 500));
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/?visualQa=1&e2e=1");
    await page.getByRole("button", { name: "Ride with keys or touch" }).click();
    await page.locator("#landscape").selectOption("city");
    await page.locator("#seed").fill("windows-visual-qa");
    await page.locator("#graphics").selectOption("medium");
    await page.getByRole("button", { name: "Start ride" }).click();
    await page.getByRole("button", { name: "Pause ride" }).click();
    await expect
      .poll(() =>
        page.evaluate(() => window.__INFINIBIKE_DEBUG__?.assetLibrary),
      )
      .toBe("ready");
    await page.evaluate(() => window.__INFINIBIKE_VISUAL_QA__!.freeze());
    await page.locator(".modal-layer").evaluate((element) => {
      (element as HTMLElement).style.display = "none";
    });
    for (const quality of ["medium", "low", "high"] as const) {
      await page.evaluate((q) => {
        window.__INFINIBIKE_VISUAL_QA__!.setGraphics(q);
        window.__INFINIBIKE_VISUAL_QA__!.setDistance(100);
      }, quality);
      const debug = await page.evaluate(() => window.__INFINIBIKE_DEBUG__!);
      expect(Number(debug.calls)).toBeGreaterThan(0);
      expect(Number(debug.calls)).toBeLessThanOrEqual(1700);
      expect(Number(debug.geometries)).toBeLessThanOrEqual(700);
      expect(Number(debug.contextLosses)).toBe(0);
      const colors = await page.evaluate(() => {
        window.__INFINIBIKE_VISUAL_QA__!.setDistance(100);
        const target = document.createElement("canvas");
        target.width = target.height = 64;
        const context = target.getContext("2d")!;
        context.drawImage(
          document.querySelector<HTMLCanvasElement>("#world")!,
          0,
          0,
          64,
          64,
        );
        const pixels = context.getImageData(0, 0, 64, 64).data;
        const unique = new Set<string>();
        for (let i = 0; i < pixels.length; i += 4)
          unique.add(`${pixels[i]}:${pixels[i + 1]}:${pixels[i + 2]}`);
        return unique.size;
      });
      expect(colors).toBeGreaterThan(20);
      await page.screenshot({
        path: testInfo.outputPath(`foreground-${quality}.png`),
      });
      expect(errors).toEqual([]);
    }
  });
}
