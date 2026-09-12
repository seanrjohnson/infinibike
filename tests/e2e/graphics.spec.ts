import { expect, test } from "@playwright/test";

test.use({ video: { mode: "on", size: { width: 960, height: 600 } } });

for (const mobile of [false, true])
  for (const landscape of ["city", "countryside"]) {
    test(`keeps ${landscape} scenery stable through streaming ${mobile ? "@mobile" : "desktop"}`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(420_000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("/?visualQa=1");
      await page
        .getByRole("button", { name: "Ride with keys or touch" })
        .click();
      await page.locator("#seed").fill("windows-visual-qa");
      await page.locator("#landscape").selectOption(landscape);
      await page.locator("#graphics").selectOption("medium");
      await page.getByRole("button", { name: "Start ride" }).click();
      await page.getByRole("button", { name: "Pause ride" }).click();
      await expect
        .poll(() =>
          page.evaluate(() => window.__INFINIBIKE_DEBUG__?.assetLibrary),
        )
        .toBe("ready");
      await page.evaluate(() => window.__INFINIBIKE_VISUAL_QA__!.freeze());
      const idleFrames = await page.evaluate(async () => {
        // Let the requested freeze frame settle, then observe actual idle frames.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        const before = window.__INFINIBIKE_DEBUG__!.renderedFrames;
        await new Promise((resolve) => setTimeout(resolve, 350));
        return [before, window.__INFINIBIKE_DEBUG__!.renderedFrames];
      });
      expect(idleFrames[1]).toBe(idleFrames[0]);
      await page
        .locator(".modal-layer")
        .evaluate(
          (element) => ((element as HTMLElement).style.display = "none"),
        );
      const before = await page.evaluate(() =>
        window.__INFINIBIKE_VISUAL_QA__!.scenery(3),
      );
      expect(before.length).toBeGreaterThan(0);
      for (const distance of [
        245, 249, 251, 255, 495, 501, 749, 751, 1999, 2001,
      ]) {
        await page.evaluate(
          (d) => window.__INFINIBIKE_VISUAL_QA__!.setDistance(d),
          distance,
        );
        const diagnostics = await page.evaluate(
          () => window.__INFINIBIKE_DEBUG__!,
        );
        expect(Number(diagnostics.chunks)).toBeLessThanOrEqual(11);
        expect(Number(diagnostics.calls)).toBeLessThanOrEqual(1700);
        expect(Number(diagnostics.triangles)).toBeLessThanOrEqual(10_000_000);
        expect(Number(diagnostics.geometries)).toBeLessThanOrEqual(700);
        expect(Number(diagnostics.contextLosses)).toBe(0);
        expect(Number(diagnostics.cameraRiderDistance)).toBeLessThan(35);
      }
      for (const quality of ["low", "high", "medium"] as const)
        await page.evaluate(
          (q) => window.__INFINIBIKE_VISUAL_QA__!.setGraphics(q),
          quality,
        );
      const after = await page.evaluate(() =>
        window.__INFINIBIKE_VISUAL_QA__!.scenery(3),
      );
      expect(after).toEqual(before);
      // Render every intermediate position, including the chunk boundary, so
      // the retained video records approach and streaming instead of teleports.
      await page.evaluate(async () => {
        for (let distance = 240; distance <= 270; distance += 0.5) {
          window.__INFINIBIKE_VISUAL_QA__!.setDistance(distance);
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
        }
      });
      await page.evaluate(() =>
        window.__INFINIBIKE_VISUAL_QA__!.setDistance(250),
      );
      await page.screenshot({
        path: testInfo.outputPath(`${landscape}-seam.png`),
        animations: "disabled",
      });
      await testInfo.attach("renderer-diagnostics", {
        body: JSON.stringify(
          await page.evaluate(() => window.__INFINIBIKE_DEBUG__),
        ),
        contentType: "application/json",
      });
      const pixels = await page
        .locator("canvas")
        .first()
        .evaluate((canvas) => {
          // WebGL discards its drawing buffer after presentation. Read immediately
          // after an explicit render, in this same browser task.
          window.__INFINIBIKE_VISUAL_QA__!.setDistance(250);
          const source = canvas as HTMLCanvasElement;
          const target = document.createElement("canvas");
          target.width = 32;
          target.height = 32;
          const context = target.getContext("2d")!;
          context.drawImage(source, 0, 0, 32, 32);
          const data = context.getImageData(0, 0, 32, 32).data;
          const colors = new Set<string>();
          for (let i = 0; i < data.length; i += 4)
            colors.add(`${data[i]}:${data[i + 1]}:${data[i + 2]}`);
          return colors.size;
        });
      expect(pixels).toBeGreaterThan(20);
      expect(errors).toEqual([]);
    });
  }

test("renders complete fallback scenery when authored assets fail", async ({
  page,
}) => {
  await page.route("**/infinibike-assets.glb", (route) => route.abort());
  await page.goto("/?visualQa=1");
  await page.getByRole("button", { name: "Ride with keys or touch" }).click();
  await page.locator("#landscape").selectOption("city");
  await page.locator("#graphics").selectOption("low");
  await page.getByRole("button", { name: "Start ride" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__INFINIBIKE_DEBUG__?.assetLibrary))
    .toBe("failed");
  expect(
    await page.evaluate(
      () => window.__INFINIBIKE_VISUAL_QA__!.scenery(0).length,
    ),
  ).toBeGreaterThan(0);
  expect(
    Number(await page.evaluate(() => window.__INFINIBIKE_DEBUG__?.triangles)),
  ).toBeGreaterThan(0);
});
