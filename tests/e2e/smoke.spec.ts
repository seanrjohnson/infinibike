import { expect, test } from "@playwright/test";

test("starts a rendered demo ride without browser errors", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/?e2e=1");
  await expect(page.getByRole("heading", { name: "Infinibike" })).toBeVisible();
  await page.getByRole("button", { name: "Ride with keys or touch" }).click();
  await page.locator("#graphics").selectOption("low");
  await page.getByRole("button", { name: "Start ride" }).click();

  await expect(page.getByRole("button", { name: "Pause ride" })).toBeVisible();
  await expect
    .poll(async () =>
      Number((await page.evaluate(() => window.__INFINIBIKE_DEBUG__))?.calls),
    )
    .toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
  expect(
    await page
      .getByLabel("Procedural cycling world")
      .evaluate(
        (canvas) => (canvas as HTMLCanvasElement).toDataURL("image/png").length,
      ),
  ).toBeGreaterThan(1_000);
});

test(
  "configuration fits a mobile viewport",
  { tag: "@mobile" },
  async ({ page }) => {
    await page.goto("/?e2e=1");
    await page.getByRole("button", { name: "Ride with keys or touch" }).click();
    const heading = page.getByRole("heading", { name: "Shape your ride" });
    await expect(heading).toBeVisible();
    const box = await heading.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(
      await page.evaluate(() => innerWidth),
    );
  },
);
