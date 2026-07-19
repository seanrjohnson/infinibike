import { expect, test } from "@playwright/test";

const visualQaEnabled = process.env.INFINIBIKE_VISUAL_QA === "1";

for (const landscape of ["countryside", "city"] as const) {
  for (const graphics of ["medium", "high"] as const) {
    test(`captures ${landscape} at 1440p in ${graphics} quality`, async ({
      page,
    }, testInfo) => {
      test.skip(
        !visualQaEnabled,
        "Set INFINIBIKE_VISUAL_QA=1 to capture QA images.",
      );
      test.skip(testInfo.project.name !== "desktop", "Desktop QA matrix only.");
      await page.setViewportSize({ width: 2560, height: 1440 });
      await page.goto("/");
      await page
        .getByRole("button", { name: "Ride with keys or touch" })
        .click();
      await page.locator("#seed").fill("windows-visual-qa");
      await page.locator("#landscape").selectOption(landscape);
      await page.locator("#graphics").selectOption(graphics);
      await page.getByRole("button", { name: "Start ride" }).click();
      await expect(
        page.getByRole("button", { name: "Pause ride" }),
      ).toBeVisible();
      await page.keyboard.down("ArrowUp");
      await page.waitForTimeout(2_500);
      await page.keyboard.up("ArrowUp");
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.__INFINIBIKE_DEBUG__))?.quality,
        )
        .toBe(graphics);
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.__INFINIBIKE_DEBUG__))
              ?.postProcessing,
        )
        .toBe("off");
      const diagnostics = await page.evaluate(
        () => window.__INFINIBIKE_DEBUG__,
      );
      expect(Number(diagnostics?.calls)).toBeLessThanOrEqual(750);
      expect(Number(diagnostics?.triangles)).toBeLessThanOrEqual(350_000);
      expect(Number(diagnostics?.geometries)).toBeLessThanOrEqual(500);
      expect(Number(diagnostics?.textures)).toBeLessThanOrEqual(30);
      expect(Number(diagnostics?.contextLosses)).toBe(0);
      expect(Number(diagnostics?.renderWidth)).toBeGreaterThan(0);
      expect(Number(diagnostics?.renderHeight)).toBeGreaterThan(0);
      expect(Number(diagnostics?.postWidth)).toBe(0);
      expect(Number(diagnostics?.postHeight)).toBe(0);
      await page.screenshot({
        path: `test-results/visual-qa/${landscape}-${graphics}-1440p.png`,
        animations: "disabled",
      });
    });
  }
}

test("keeps streamed graphics bounded through seams, rebasing, and quality changes", async ({
  page,
}, testInfo) => {
  test.skip(
    !visualQaEnabled,
    "Set INFINIBIKE_VISUAL_QA=1 to run streaming visual QA.",
  );
  test.skip(testInfo.project.name !== "desktop", "Desktop QA matrix only.");
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("/?visualQa=1");
  await page.getByRole("button", { name: "Ride with keys or touch" }).click();
  await page.locator("#seed").fill("windows-visual-qa");
  await page.locator("#landscape").selectOption("countryside");
  await page.locator("#graphics").selectOption("high");
  await page.getByRole("button", { name: "Start ride" }).click();
  await page.getByRole("button", { name: "Pause ride" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__INFINIBIKE_VISUAL_QA__ !== undefined),
    )
    .toBe(true);

  for (const distanceM of [249, 251]) {
    await page.evaluate(
      (distance) => window.__INFINIBIKE_VISUAL_QA__!.setDistance(distance),
      distanceM,
    );
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.__INFINIBIKE_DEBUG__))?.distanceM,
      )
      .toBe(distanceM);
  }
  const baseline = await page.evaluate(() => window.__INFINIBIKE_DEBUG__!);

  await page.evaluate(() =>
    window.__INFINIBIKE_VISUAL_QA__!.setGraphics("medium"),
  );
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INFINIBIKE_DEBUG__))?.quality,
    )
    .toBe("medium");
  await page.evaluate(() =>
    window.__INFINIBIKE_VISUAL_QA__!.setGraphics("high"),
  );
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INFINIBIKE_DEBUG__))?.quality,
    )
    .toBe("high");
  const restored = await page.evaluate(() => window.__INFINIBIKE_DEBUG__!);
  expect(Number(restored.geometries)).toBeLessThanOrEqual(
    Number(baseline.geometries) + 8,
  );
  expect(Number(restored.textures)).toBeLessThanOrEqual(
    Number(baseline.textures) + 2,
  );

  for (const distanceM of [1_999, 2_001]) {
    await page.evaluate(
      (distance) => window.__INFINIBIKE_VISUAL_QA__!.setDistance(distance),
      distanceM,
    );
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.__INFINIBIKE_DEBUG__))?.distanceM,
      )
      .toBe(distanceM);
  }
  const rebased = await page.evaluate(() => window.__INFINIBIKE_DEBUG__!);
  expect(Number(rebased.originDistanceM)).toBe(2_001);
  expect(Number(rebased.chunks)).toBeLessThanOrEqual(11);
  expect(Number(rebased.cameraRiderDistance)).toBeLessThan(35);

  const lakesideDistance = await page.evaluate(() =>
    window.__INFINIBIKE_VISUAL_QA__!.findRegionDistance("lakeside"),
  );
  await page.evaluate(
    (distance) => window.__INFINIBIKE_VISUAL_QA__!.setDistance(distance),
    lakesideDistance,
  );
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INFINIBIKE_DEBUG__))?.distanceM,
    )
    .toBe(lakesideDistance);
  await expect
    .poll(async () =>
      Number(
        (await page.evaluate(() => window.__INFINIBIKE_DEBUG__))?.waterChunks,
      ),
    )
    .toBeGreaterThan(0);
  const diagnostics = await page.evaluate(() => window.__INFINIBIKE_DEBUG__!);
  expect(Number(diagnostics.calls)).toBeLessThanOrEqual(750);
  expect(Number(diagnostics.triangles)).toBeLessThanOrEqual(350_000);
  expect(Number(diagnostics.geometries)).toBeLessThanOrEqual(500);
  expect(Number(diagnostics.contextLosses)).toBe(0);
  await page.locator(".modal-layer").evaluate((element) => {
    (element as HTMLElement).style.display = "none";
  });
  await page.screenshot({
    path: "test-results/visual-qa/countryside-lakeside-high.png",
    animations: "disabled",
  });
});

test("captures moving countryside wildlife", async ({ page }, testInfo) => {
  test.skip(
    !visualQaEnabled,
    "Set INFINIBIKE_VISUAL_QA=1 to capture moving wildlife.",
  );
  test.skip(testInfo.project.name !== "desktop", "Desktop QA only.");
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("/?visualQa=1");
  await page.getByRole("button", { name: "Ride with keys or touch" }).click();
  await page.locator("#seed").fill("living-countryside");
  await page.locator("#landscape").selectOption("countryside");
  await page.locator("#graphics").selectOption("high");
  await page.getByRole("button", { name: "Start ride" }).click();
  await page.getByRole("button", { name: "Pause ride" }).click();
  const dinosaurDistance = await page.evaluate(() =>
    window.__INFINIBIKE_VISUAL_QA__!.findMovingActor("dinosaur"),
  );
  expect(dinosaurDistance).toBeGreaterThan(0);
  await page.evaluate(
    (distance) => window.__INFINIBIKE_VISUAL_QA__!.setDistance(distance),
    dinosaurDistance - 45,
  );
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INFINIBIKE_DEBUG__))?.distanceM,
    )
    .toBe(dinosaurDistance - 45);
  await page.locator(".modal-layer").evaluate((element) => {
    (element as HTMLElement).style.display = "none";
  });
  await expect
    .poll(async () =>
      Number(
        (await page.evaluate(() => window.__INFINIBIKE_DEBUG__))
          ?.visibleMovingActors,
      ),
    )
    .toBeGreaterThan(0);
  const wildlifeDiagnostics = await page.evaluate(
    () => window.__INFINIBIKE_DEBUG__,
  );
  expect(Number(wildlifeDiagnostics?.cohesiveTakeoffFlocks)).toBeGreaterThan(0);
  expect(Number(wildlifeDiagnostics?.dispersingTakeoffFlocks)).toBeGreaterThan(
    0,
  );
  await page.screenshot({
    path: "test-results/visual-qa/countryside-moving-wildlife-high.png",
    animations: "disabled",
  });
});

test("captures a deterministic countryside fork and long bend", async ({
  page,
}, testInfo) => {
  test.skip(
    !visualQaEnabled,
    "Set INFINIBIKE_VISUAL_QA=1 to run countryside-route visual QA.",
  );
  test.skip(testInfo.project.name !== "desktop", "Desktop QA matrix only.");
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("/?visualQa=1");
  await page.getByRole("button", { name: "Ride with keys or touch" }).click();
  await page.locator("#seed").fill("turning-road");
  await page.locator("#landscape").selectOption("countryside");
  await page.locator("#graphics").selectOption("high");
  await page.getByRole("button", { name: "Start ride" }).click();
  await page.getByRole("button", { name: "Pause ride" }).click();
  const forkDistance = await page.evaluate(() =>
    window.__INFINIBIKE_VISUAL_QA__!.findCountrysideRouteEvent("fork"),
  );
  const bendDistance = await page.evaluate(() =>
    window.__INFINIBIKE_VISUAL_QA__!.findCountrysideRouteEvent("bend", 0, 120),
  );
  expect(forkDistance).toBeGreaterThan(0);
  expect(bendDistance).toBeGreaterThan(0);
  await page.locator(".modal-layer").evaluate((element) => {
    (element as HTMLElement).style.display = "none";
  });

  for (const [distance, path] of [
    [forkDistance - 24, "test-results/visual-qa/countryside-fork-high.png"],
    [
      bendDistance + 372,
      "test-results/visual-qa/countryside-long-bend-high.png",
    ],
  ] as const) {
    await page.evaluate(
      (target) => window.__INFINIBIKE_VISUAL_QA__!.setDistance(target),
      distance,
    );
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.__INFINIBIKE_DEBUG__))?.distanceM,
      )
      .toBe(distance);
    const diagnostics = await page.evaluate(() => window.__INFINIBIKE_DEBUG__!);
    expect(Number(diagnostics.calls)).toBeLessThanOrEqual(750);
    expect(Number(diagnostics.triangles)).toBeLessThanOrEqual(350_000);
    expect(Number(diagnostics.geometries)).toBeLessThanOrEqual(500);
    expect(Number(diagnostics.contextLosses)).toBe(0);
    await page.screenshot({ path, animations: "disabled" });
  }
});

test("captures diverse left and right city route turns", async ({
  page,
}, testInfo) => {
  test.skip(
    !visualQaEnabled,
    "Set INFINIBIKE_VISUAL_QA=1 to run city-turn visual QA.",
  );
  test.skip(testInfo.project.name !== "desktop", "Desktop QA matrix only.");
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("/?visualQa=1");
  await page.getByRole("button", { name: "Ride with keys or touch" }).click();
  await page.locator("#seed").fill("windows-visual-qa");
  await page.locator("#landscape").selectOption("city");
  await page.locator("#graphics").selectOption("high");
  await page.getByRole("button", { name: "Start ride" }).click();
  await page.getByRole("button", { name: "Pause ride" }).click();
  const turns = await page.evaluate(() => ({
    left: window.__INFINIBIKE_VISUAL_QA__!.findCityTurnDistance(
      0,
      -1,
      "urban-core",
    ),
    right: window.__INFINIBIKE_VISUAL_QA__!.findCityTurnDistance(
      0,
      1,
      "urban-core",
    ),
    edge: window.__INFINIBIKE_VISUAL_QA__!.findCityTurnDistance(
      0,
      undefined,
      "edge",
    ),
  }));
  expect(turns.left).toBeGreaterThan(0);
  expect(turns.right).toBeGreaterThan(0);
  expect(turns.edge).toBeGreaterThan(0);
  await page.locator(".modal-layer").evaluate((element) => {
    (element as HTMLElement).style.display = "none";
  });
  for (const [direction, turnDistance, path] of [
    [
      "left",
      turns.left,
      "test-results/visual-qa/city-turn-left-urban-high.png",
    ],
    [
      "right",
      turns.right,
      "test-results/visual-qa/city-turn-right-urban-high.png",
    ],
    ["edge", turns.edge, "test-results/visual-qa/city-turn-edge-high.png"],
  ] as const) {
    const headings: number[] = [];
    for (const distance of [turnDistance - 8, turnDistance + 8]) {
      await page.evaluate(
        (target) => window.__INFINIBIKE_VISUAL_QA__!.setDistance(target),
        distance,
      );
      headings.push(
        Number(
          (await page.evaluate(() => window.__INFINIBIKE_DEBUG__))
            ?.routeHeading,
        ),
      );
    }
    const headingChange = Math.atan2(
      Math.sin(headings[1]! - headings[0]!),
      Math.cos(headings[1]! - headings[0]!),
    );
    expect(Math.abs(headingChange), direction).toBeCloseTo(Math.PI / 2, 4);
    await page.evaluate(
      (target) => window.__INFINIBIKE_VISUAL_QA__!.setDistance(target),
      turnDistance - 18,
    );
    const diagnostics = await page.evaluate(() => window.__INFINIBIKE_DEBUG__!);
    expect(Number(diagnostics.calls)).toBeLessThanOrEqual(750);
    expect(Number(diagnostics.triangles)).toBeLessThanOrEqual(380_000);
    expect(Number(diagnostics.geometries)).toBeLessThanOrEqual(500);
    expect(Number(diagnostics.contextLosses)).toBe(0);
    await page.screenshot({ path, animations: "disabled" });
  }
  const hillDistance = await page.evaluate(() =>
    window.__INFINIBIKE_VISUAL_QA__!.findCityHillDistance(),
  );
  expect(hillDistance).toBeGreaterThan(0);
  await page.evaluate(
    (target) => window.__INFINIBIKE_VISUAL_QA__!.setDistance(target),
    hillDistance,
  );
  await page.screenshot({
    path: "test-results/visual-qa/city-hill-sidewalks-high.png",
    animations: "disabled",
  });
});
