import { expect, test } from "@playwright/test";

test("completes a demo ride and stores its summary", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/?e2e=1");
  await expect(page.getByRole("heading", { name: "Infinibike" })).toBeVisible();
  const canvasImage = await page.screenshot();
  expect(canvasImage.byteLength).toBeGreaterThan(10_000);

  await page.getByRole("button", { name: "Ride with keys or touch" }).click();
  await expect(
    page.getByRole("heading", { name: "Shape your ride" }),
  ).toBeVisible();
  await expect(page.locator("#ambient-audio")).not.toBeChecked();
  await page.locator("#seed").fill("e2e-road");
  await page.locator("#landscape").selectOption("city");
  await page.getByRole("button", { name: "Start ride" }).click();
  await expect(page.getByRole("button", { name: "Pause ride" })).toBeVisible();
  await expect(
    page.getByLabel("Elevation profile for the next 1.5 kilometers"),
  ).toBeVisible();
  await expect(page.locator(".route-preview-scale")).toContainText("0");
  await expect(page.locator(".route-preview-scale")).toContainText("0.75");
  await expect(page.locator(".route-preview-scale")).toContainText("1.5 km");
  await expect(page.locator("#route-preview-mid")).toHaveText(/-?\d+ m/);
  await expect(page.locator("#hud-climbing")).toHaveText(/\d+ m/);
  const objectiveBounds = await page.locator(".ride-objective").boundingBox();
  const viewport = page.viewportSize()!;
  expect(objectiveBounds).not.toBeNull();
  expect(objectiveBounds!.x).toBeGreaterThanOrEqual(0);
  expect(objectiveBounds!.x + objectiveBounds!.width).toBeLessThanOrEqual(
    viewport.width,
  );
  if (viewport.width > 760) expect(objectiveBounds!.y).toBeLessThan(40);
  await page.getByRole("button", { name: "Minimize route preview" }).click();
  await expect(
    page.getByLabel("Elevation profile for the next 1.5 kilometers"),
  ).toBeHidden();
  await page.getByRole("button", { name: "Expand route preview" }).click();
  await expect(
    page.getByLabel("Elevation profile for the next 1.5 kilometers"),
  ).toBeVisible();
  const demoPower = page.getByRole("slider", { name: "Demo power" });
  await expect(demoPower).toHaveValue("120");
  await demoPower.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "180";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#demo-power-value")).toHaveText("180 W");
  await expect(page.locator("#hud-power")).toHaveText("180");
  await expect(
    page.getByRole("button", { name: "Change camera" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Change camera" }).click();
  await expect(page.getByText("Wide chase camera")).toBeVisible();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__INFINIBIKE_DEBUG__))?.cameraMode,
    )
    .toBe("wide");
  const audioButton = page.getByRole("button", {
    name: "Enable music and terrain sounds",
  });
  await audioButton.click();
  await expect(
    page.getByRole("button", { name: "Mute music and terrain sounds" }),
  ).toBeVisible();
  const gradePreview = page.locator("#grade-preview");
  expect(await gradePreview.getAttribute("width")).not.toBe("0");
  expect(await gradePreview.getAttribute("height")).not.toBe("0");
  await expect(page.locator("#route-preview-high")).toHaveText(/-?\d+ m/);

  await expect
    .poll(async () =>
      Number(
        (await page.evaluate(() => window.__INFINIBIKE_DEBUG__))?.distanceM,
      ),
    )
    .toBeGreaterThan(1);

  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(1_500);
  await page.keyboard.up("ArrowUp");
  expect(pageErrors).toEqual([]);
  await expect
    .poll(async () =>
      Number(
        (await page.evaluate(() => window.__INFINIBIKE_DEBUG__))?.distanceM,
      ),
    )
    .toBeGreaterThan(1);
  const diagnostics = await page.evaluate(() => window.__INFINIBIKE_DEBUG__);
  expect(Number(diagnostics?.chunks)).toBeLessThanOrEqual(11);
  expect(Number(diagnostics?.nearChunks)).toBeLessThanOrEqual(5);
  expect(Number(diagnostics?.calls)).toBeGreaterThan(0);
  expect(diagnostics?.landscape).toBe("city");
  expect(Number(diagnostics?.urbanChunks)).toBeGreaterThan(0);
  expect(Number(diagnostics?.movingActors)).toBeGreaterThanOrEqual(17);
  expect(Number(diagnostics?.visibleMovingActors)).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Pause ride" }).click();
  await expect(
    page.getByRole("heading", { name: "Ride paused" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await page.getByRole("button", { name: "Pause ride" }).click();
  await page.getByRole("button", { name: "End ride" }).click();
  await expect(page.getByRole("heading", { name: /km$/ })).toBeVisible();
  await expect(page.getByText("e2e-road")).toBeVisible();
  await expect(page.getByText("City", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ride analysis" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();

  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Ride history" }).click();
  await expect(page.getByText("e2e-road")).toBeVisible();
  await expect(page.getByText("Last 7 days")).toBeVisible();
});
