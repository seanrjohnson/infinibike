import { expect, test } from "@playwright/test";

for (const mobile of [false, true]) {
  test(`shows lane scenery and aircraft ahead ${mobile ? "@mobile" : "desktop"}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/?visualQa=1");
    await page.getByRole("button", { name: "Ride with keys or touch" }).click();
    await page.locator("#landscape").selectOption("city");
    await page.locator("#seed").fill("windows-visual-qa");
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
    for (let cameraIndex = 0; cameraIndex < 3; cameraIndex++) {
      for (const kind of ["plane", "helicopter"] as const) {
        const frames = await page.evaluate((type) => {
          const qa = window.__INFINIBIKE_VISUAL_QA__!;
          const anchor = qa.findMovingActor(type);
          qa.setDistance(Math.max(0, anchor - (type === "plane" ? 340 : 280)));
          return qa.actorFrames();
        }, kind);
        expect(
          frames.some(
            (actor) =>
              actor.kind === kind &&
              actor.visible &&
              Math.abs(actor.screen[0]!) < 1 &&
              Math.abs(actor.screen[1]!) < 1 &&
              actor.screen[2]! < 1,
          ),
        ).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`${kind}-${cameraIndex}.png`),
        });
      }
      await page.evaluate(
        (mode) => window.__INFINIBIKE_VISUAL_QA__!.setCamera(mode),
        (["wide", "handlebar", "close"] as const)[cameraIndex]!,
      );
    }
    const motion = await page.evaluate(() => {
      const qa = window.__INFINIBIKE_VISUAL_QA__!;
      qa.setDistance(100);
      const before = qa
        .actorFrames()
        .filter((actor) => actor.kind === "pedestrian");
      qa.advanceActors(0.12);
      const after = qa
        .actorFrames()
        .filter((actor) => actor.kind === "pedestrian");
      return { before, after };
    });
    expect(motion.before.length).toBeGreaterThan(0);
    expect(motion.before[0]!.joints).toHaveLength(8);
    expect(motion.after[0]!.joints).not.toEqual(motion.before[0]!.joints);
    expect(
      (await page.screenshot({ path: testInfo.outputPath("bike-lanes.png") }))
        .byteLength,
    ).toBeGreaterThan(10_000);
    expect(errors).toEqual([]);
  });

  test(`scrolls the entire ride summary ${mobile ? "@mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/?e2e=1");
    await page.getByRole("button", { name: "Ride with keys or touch" }).click();
    await page.getByRole("button", { name: "Start ride" }).click();
    await page.getByRole("button", { name: "Pause ride" }).click();
    await page.getByRole("button", { name: "End ride" }).click();
    const touch = mobile ? await page.context().newCDPSession(page) : undefined;
    for (const size of [
      { width: 390, height: 500 },
      { width: 800, height: 360 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(size);
      const panel = page.locator(".summary-content");
      const scroll = async (end: boolean) => {
        if (touch) {
          const bounds = (await panel.boundingBox())!;
          const x = bounds.x + bounds.width / 2;
          const height = Math.min(bounds.height, size.height);
          const distance = height * 0.6;
          const swipes =
            Math.ceil(
              (await panel.evaluate((element) => element.scrollHeight)) /
                distance,
            ) + 1;
          for (let swipe = 0; swipe < swipes; swipe++) {
            const start = bounds.y + height * (end ? 0.8 : 0.2);
            await touch.send("Input.dispatchTouchEvent", {
              type: "touchStart",
              touchPoints: [{ x, y: start }],
            });
            for (let step = 1; step <= 12; step++) {
              await touch.send("Input.dispatchTouchEvent", {
                type: "touchMove",
                touchPoints: [
                  { x, y: start + ((end ? -1 : 1) * distance * step) / 12 },
                ],
              });
              await page.waitForTimeout(20);
            }
            await touch.send("Input.dispatchTouchEvent", {
              type: "touchEnd",
              touchPoints: [],
            });
            await page.waitForTimeout(100);
          }
        } else {
          await panel.focus();
          await page.keyboard.press(end ? "Control+End" : "Control+Home");
        }
      };
      await scroll(false);
      await expect(page.locator("#summary-title")).toBeInViewport();
      await scroll(true);
      await expect(
        page.getByRole("button", { name: "Export CSV" }),
      ).toBeInViewport();
      await expect(page.getByRole("button", { name: "Done" })).toBeInViewport();
      const bounds = await panel.boundingBox();
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height + 1);
    }
    await touch?.detach();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(
      page.getByRole("heading", { name: "Infinibike" }),
    ).toBeVisible();
  });
}
