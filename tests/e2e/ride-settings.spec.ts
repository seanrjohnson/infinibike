import { expect, test } from "@playwright/test";

for (const mobile of [false, true]) {
  test(`persists calibration and edits paused ride settings ${mobile ? "@mobile" : "desktop"}`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      class Characteristic extends EventTarget {
        value = new DataView(new ArrayBuffer(8));
        timer?: number;
        constructor(readonly uuid: string) {
          super();
        }
        async readValue() {
          if (this.uuid.includes("2acc")) this.value.setUint32(4, 4, true);
          if (this.uuid.includes("2ad6")) {
            this.value.setInt16(2, 1000, true);
            this.value.setUint16(4, 10, true);
          }
          return this.value;
        }
        async startNotifications() {
          if (this.uuid.includes("2ad2"))
            this.timer = window.setInterval(() => {
              this.value.setUint16(0, 0x41, true);
              this.value.setInt16(2, 145, true);
              this.dispatchEvent(new Event("characteristicvaluechanged"));
            }, 100);
          return this;
        }
        async stopNotifications() {
          window.clearInterval(this.timer);
          return this;
        }
        async writeValueWithResponse(bytes: Uint8Array) {
          if (bytes[0] === 4) {
            const load =
              new DataView(bytes.buffer, bytes.byteOffset).getInt16(1, true) /
              10;
            localStorage.setItem(
              "test-load",
              JSON.stringify([
                ...JSON.parse(localStorage.getItem("test-load") ?? "[]"),
                load,
              ]),
            );
          }
          this.value = new DataView(
            new Uint8Array([0x80, bytes[0]!, 1]).buffer,
          );
          this.dispatchEvent(new Event("characteristicvaluechanged"));
        }
      }
      const service = {
        getCharacteristic: async (uuid: string) => new Characteristic(uuid),
      };
      const device = Object.assign(new EventTarget(), {
        id: "test-trainer",
        name: "Test trainer",
        gatt: {
          connected: true,
          connect: async () => ({ getPrimaryService: async () => service }),
          disconnect: () => {},
        },
      });
      Object.defineProperty(navigator, "bluetooth", {
        configurable: true,
        value: { requestDevice: async () => device },
      });
    });
    await page.goto("/?e2e=1");
    await page.getByRole("button", { name: "Connect smart trainer" }).click();
    await page.getByRole("button", { name: "Enter wattages" }).click();
    await page.locator("#cruise").fill("145");
    await page.locator("#hard").fill("290");
    await page.getByRole("button", { name: "Save profile" }).click();
    await page.reload();
    await expect(page.locator(".calibration-ready")).toContainText(
      "145 W cruise",
    );
    await page.getByRole("button", { name: "Connect smart trainer" }).click();
    await expect(page.locator(".calibration-ready")).toContainText(
      "145 W cruise",
    );
    await page.locator("#ride-mode").selectOption("endurance");
    await page.locator("#ride-goal").selectOption("15");
    await page.getByRole("button", { name: "Start ride" }).click();
    await page.getByRole("button", { name: "Pause ride" }).click();
    await page.locator("#pause-resistance").selectOption("0.45");
    await page.locator("#pause-base-load").fill("25");
    await page.locator("#pause-camera").selectOption("wide");
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("test-load")))
      .toContain("25");
    await page.getByRole("button", { name: "Pause ride" }).click();
    await expect(page.locator("#pause-resistance")).toHaveValue("0.45");
    await expect(page.locator("#pause-base-load")).toHaveValue("25");
    await expect(page.locator("#pause-camera")).toHaveValue("wide");
    await page.getByRole("button", { name: "End ride" }).click();
    await expect(page.locator(".seed-summary").last()).toContainText("15 min");
    await page.setViewportSize({ width: 390, height: 500 });
    const panel = page.locator(".summary-content");
    await panel.focus();
    await page.keyboard.press("Control+End");
    await expect(
      page.getByRole("button", { name: "Done", exact: true }),
    ).toBeInViewport();
    const before = await panel.evaluate((element) => element.scrollTop);
    await page.keyboard.press("ArrowUp");
    await expect
      .poll(() => panel.evaluate((element) => element.scrollTop))
      .toBeLessThan(before);
    await page.keyboard.press("Control+Home");
    await expect(page.locator("#summary-title")).toBeInViewport();
  });
}
