import { expect, test, type Page } from "@playwright/test";

async function briefing(
  page: Page,
  mode: "observe" | "participate" | "watch",
): Promise<void> {
  await page.goto("/?e2e=1");
  await page.getByRole("button", { name: "Scenarios", exact: true }).click();
  await page.getByRole("button", { name: "Explore Agincourt" }).click();
  await page.locator("#scenario-mode").selectOption(mode);
  await page.locator("#scenario-duration").selectOption("15");
}
async function start(
  page: Page,
  mode: "observe" | "participate" | "watch",
): Promise<void> {
  await briefing(page, mode);
  if (mode !== "watch")
    await page.getByRole("button", { name: "Use demo controls" }).click();
  await page
    .getByRole("button", {
      name: mode === "watch" ? "Start watching" : "Start scenario",
      exact: true,
    })
    .click();
  await expect(page.locator("#scenario-phase")).toHaveText("Between the woods");
}

for (const mobile of [false, true]) {
  const label = mobile ? "@mobile" : "desktop";
  test(`scenario guided tour, pause, rendering, replay and cleanup ${label}`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await start(page, "watch");
    await expect(page.locator(".hud")).toHaveCount(0);
    await expect(page.locator(".connection-badge")).toContainText(
      "no exercise recorded",
    );
    await expect
      .poll(() => page.evaluate(() => window.__INFINIBIKE_DEBUG__?.scenario))
      .toBe("agincourt");
    const initial = await page.evaluate(() => window.__INFINIBIKE_DEBUG__!);
    expect(Number(initial.calls)).toBeLessThan(1700);
    expect(Number(initial.triangles)).toBeLessThan(10_000_000);
    expect(Number(initial.geometries)).toBeLessThan(700);
    await page.getByRole("button", { name: "Pause ride" }).click();
    const paused = await page.evaluate(
      () => window.__INFINIBIKE_SCENARIO_QA__!.state().elapsedMs,
    );
    await page.evaluate(() =>
      window.__INFINIBIKE_SCENARIO_QA__!.advance(100, 0),
    );
    expect(
      await page.evaluate(
        () => window.__INFINIBIKE_SCENARIO_QA__!.state().elapsedMs,
      ),
    ).toBe(paused);
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await page.evaluate(() =>
      window.__INFINIBIKE_SCENARIO_QA__!.advance(470, 500),
    );
    await expect(page.locator("#scenario-phase")).toHaveText(
      "The press of battle",
    );
    const bounds = await page.locator(".scenario-caption").boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    await page.screenshot({ path: testInfo.outputPath("agincourt.png") });
    // Read the framebuffer synchronously just after a rendered frame.
    const colors = await page.evaluate(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const source = document.querySelector<HTMLCanvasElement>("#world")!;
      const target = document.createElement("canvas");
      target.width = 64;
      target.height = 64;
      const ctx = target.getContext("2d")!;
      ctx.drawImage(source, 0, 0, 64, 64);
      const data = ctx.getImageData(0, 0, 64, 64).data;
      const set = new Set<string>();
      for (let i = 0; i < data.length; i += 4)
        set.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      return set.size;
    });
    expect(colors).toBeGreaterThan(20);
    await page.evaluate(() =>
      window.__INFINIBIKE_SCENARIO_QA__!.advance(900, 100),
    );
    await expect(
      page.getByRole("heading", { name: "Tour complete" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("infinibike.rideHistory.v1") ?? "[]"),
      ),
    ).toHaveLength(0);
    await page.getByRole("button", { name: "Watch again" }).click();
    await expect(page.locator("#scenario-mode")).toHaveValue("watch");
    await page.getByRole("button", { name: "Start watching" }).click();
    await expect(page.locator("#scenario-phase")).toHaveText(
      "Between the woods",
    );
    await expect
      .poll(() =>
        page.evaluate(() =>
          Number(window.__INFINIBIKE_DEBUG__?.scenarioElapsedMs),
        ),
      )
      .toBeLessThan(5000);
    const repeated = await page.evaluate(() => window.__INFINIBIKE_DEBUG__!);
    expect(Number(repeated.geometries)).toBeLessThanOrEqual(
      Number(initial.geometries) + 5,
    );
    expect(Number(repeated.textures)).toBeLessThanOrEqual(
      Number(initial.textures) + 3,
    );
    await page.getByRole("button", { name: "Pause ride" }).click();
    await page.getByRole("button", { name: "End ride", exact: true }).click();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Infinibike" }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });

  test(`scenario rider lifecycle and connection pause ${label}`, async ({
    page,
  }) => {
    await start(page, "participate");
    await expect(page.locator("#scenario-cargo")).toContainText(
      "Carrying arrows",
    );
    await page.evaluate(() =>
      window.__INFINIBIKE_SCENARIO_QA__!.advance(60, 500),
    );
    await expect(page.locator("#scenario-cargo")).toContainText("1 deliveries");
    await page.evaluate(() =>
      window.__INFINIBIKE_SCENARIO_QA__!.status("stale"),
    );
    await expect(
      page.getByRole("heading", { name: "Waiting for trainer" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await page.evaluate(() =>
      window.__INFINIBIKE_SCENARIO_QA__!.status("disconnected"),
    );
    await expect(
      page.getByRole("heading", { name: "Trainer disconnected" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "End ride", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Scenario incomplete" }),
    ).toBeVisible();
    const result = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("infinibike.rideHistory.v1")!)[0]
          .scenario,
    );
    expect(result.completed).toBe(false);
    expect(result.outcome).toBeUndefined();
    expect(result.config.mode).toBe("participate");
    await page.getByRole("button", { name: "Ride again", exact: true }).click();
    await expect(page.locator("#scenario-mode")).toHaveValue("participate");
    await expect(page.locator("#scenario-duration")).toHaveValue("15");
    // Unknown content versions survive loading and require an explicit new start.
    await page.evaluate(() => {
      const history = JSON.parse(
        localStorage.getItem("infinibike.rideHistory.v1")!,
      );
      history[0].scenario.config.version = 99;
      localStorage.setItem(
        "infinibike.rideHistory.v1",
        JSON.stringify(history),
      );
    });
    await page.goto("/?e2e=1");
    await page
      .getByRole("button", { name: "Ride history", exact: true })
      .click();
    await page.getByRole("button", { name: "Ride again: Agincourt" }).click();
    await expect(page.getByRole("status")).toContainText(
      "saved scenario version is unavailable",
    );
    await expect(page.locator("#pause")).toHaveCount(0);
  });

  test(`scenario asset failure can retry before riding ${label}`, async ({
    page,
  }) => {
    await briefing(page, "watch");
    await page.route("**/assets/scenarios/agincourt/palette.json", (route) =>
      route.fulfill({ status: 503, body: "unavailable" }),
    );
    await page.getByRole("button", { name: "Start watching" }).click();
    await expect(page.getByRole("alert")).toContainText("could not be loaded");
    await expect(page.locator("#pause")).toHaveCount(0);
    await page.unroute("**/assets/scenarios/agincourt/palette.json");
    await page.getByRole("button", { name: "Explore Agincourt" }).click();
    await page.locator("#scenario-mode").selectOption("watch");
    await page.getByRole("button", { name: "Start watching" }).click();
    await expect(page.locator("#scenario-phase")).toHaveText(
      "Between the woods",
    );
  });
}

for (const mobile of [false, true])
  test(`scenario all authored endings and historical observation ${mobile ? "@mobile" : "desktop"}`, async ({
    page,
  }) => {
    for (const [distance, heading] of [
      [0, "Alternate history: English defeat"],
      [4200, "Alternate history: costly English victory"],
      [18000, "English victory"],
    ] as const) {
      await start(page, "participate");
      await page.evaluate(
        (d) => window.__INFINIBIKE_SCENARIO_QA__!.advance(900, d),
        distance,
      );
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
    }
    await start(page, "observe");
    await page.evaluate(() =>
      window.__INFINIBIKE_SCENARIO_QA__!.advance(900, 0),
    );
    await expect(
      page.getByRole("heading", { name: "English victory", exact: true }),
    ).toBeVisible();
  });
