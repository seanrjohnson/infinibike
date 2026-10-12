import { expect, test } from "@playwright/test";

interface AppManifest {
  id: string;
  name: string;
  start_url: string;
  scope: string;
  display: string;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
}

for (const viewport of ["desktop", "@mobile"]) {
  test(`provides installable metadata and icons ${viewport}`, async ({
    page,
    request,
  }) => {
    await page.goto("/?e2e=1");
    const manifestUrl = await page
      .locator('link[rel="manifest"]')
      .evaluate((link) => (link as HTMLLinkElement).href);
    const response = await request.get(manifestUrl);
    expect(response.ok()).toBe(true);
    const manifest = (await response.json()) as AppManifest;
    expect(manifest.name).toBe("Infinibike");
    expect(manifest.display).toBe("fullscreen");
    const launchUrl = new URL(manifest.start_url, manifestUrl).href;
    expect(new URL(manifest.scope, manifestUrl).href).toBe(launchUrl);
    expect(new URL(manifest.id, manifestUrl).href).toBe(launchUrl);
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual([
      "192x192",
      "512x512",
    ]);
    for (const icon of manifest.icons) {
      expect(icon.type).toBe("image/png");
      expect(icon.purpose.split(" ")).toContain("maskable");
      const size = await page.evaluate(async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        return `${image.naturalWidth}x${image.naturalHeight}`;
      }, new URL(icon.src, manifestUrl).href);
      expect(size).toBe(icon.sizes);
    }
    await expect(
      page.locator('meta[name="apple-mobile-web-app-capable"]'),
    ).toHaveAttribute("content", "yes");
    const touchIcon = await page
      .locator('link[rel="apple-touch-icon"]')
      .evaluate((link) => (link as HTMLLinkElement).href);
    expect(
      await page.evaluate(async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        return [image.naturalWidth, image.naturalHeight];
      }, touchIcon),
    ).toEqual([180, 180]);
    await page.goto(launchUrl);
    await expect(
      page.getByRole("heading", { name: "Infinibike" }),
    ).toBeVisible();
  });

  test(`fits a ride after viewport rotation ${viewport}`, async ({ page }) => {
    await page.goto("/?e2e=1");
    await page.getByRole("button", { name: "Ride with keys or touch" }).click();
    await page.locator("#graphics").selectOption("low");
    await page.getByRole("button", { name: "Start ride" }).click();
    await expect(
      page.getByRole("button", { name: "Pause ride" }),
    ).toBeVisible();
    for (const size of [
      { width: 393, height: 727 },
      { width: 851, height: 393 },
    ]) {
      await page.setViewportSize(size);
      for (const selector of ["#world", ".ride-controls", ".hud"]) {
        const element = page.locator(selector);
        await expect(element).toBeVisible();
        await expect
          .poll(async () => {
            const box = await element.boundingBox();
            return (
              !!box &&
              box.x >= 0 &&
              box.y >= 0 &&
              box.x + box.width <= size.width + 1 &&
              box.y + box.height <= size.height + 1
            );
          })
          .toBe(true);
      }
    }
    await expect
      .poll(() => page.evaluate(() => window.__INFINIBIKE_DEBUG__?.calls ?? 0))
      .toBeGreaterThan(0);
    const diagnostics = await page.evaluate(() => window.__INFINIBIKE_DEBUG__!);
    expect(Number(diagnostics.calls)).toBeLessThanOrEqual(1700);
    expect(Number(diagnostics.contextLosses)).toBe(0);
    expect(
      await page
        .locator("#world")
        .evaluate(
          (canvas) =>
            (canvas as HTMLCanvasElement).toDataURL("image/png").length,
        ),
    ).toBeGreaterThan(1000);
  });
}
