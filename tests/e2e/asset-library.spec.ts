import { expect, test } from "@playwright/test";

for (const landscape of ["countryside", "city"] as const) {
  test(`loads authored ${landscape} scenery and renders a nonblank canvas`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Ride with keys or touch" }).click();
    await page.locator("#seed").fill("authored-scenery");
    await page.locator("#landscape").selectOption(landscape);
    await page.locator("#graphics").selectOption("high");
    await page.getByRole("button", { name: "Start ride" }).click();

    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.__INFINIBIKE_DEBUG__))
            ?.assetLibrary,
      )
      .toBe("ready");
    await expect
      .poll(async () =>
        Number(
          (await page.evaluate(() => window.__INFINIBIKE_DEBUG__))
            ?.assetTemplates,
        ),
      )
      .toBeGreaterThanOrEqual(67);

    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(800);
    await page.keyboard.up("ArrowUp");
    const diagnostics = await page.evaluate(() => window.__INFINIBIKE_DEBUG__!);
    expect(Number(diagnostics.calls)).toBeGreaterThan(0);
    expect(Number(diagnostics.triangles)).toBeGreaterThan(0);
    expect(Number(diagnostics.geometries)).toBeLessThanOrEqual(600);
    expect(Number(diagnostics.contextLosses)).toBe(0);
    expect(
      await page
        .getByLabel("Procedural cycling world")
        .evaluate(
          (canvas) =>
            (canvas as HTMLCanvasElement).toDataURL("image/png").length,
        ),
    ).toBeGreaterThan(1_000);
  });
}
