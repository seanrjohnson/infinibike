import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  // Graphics cases share the host GPU; concurrent contexts distort budgets.
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  webServer: {
    command: process.env.CI
      ? "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173"
      : "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "desktop",
      grepInvert: /@mobile/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      grep: /@mobile/,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "android-tablet",
      grep: /@mobile/,
      use: {
        ...devices["Galaxy Tab S9 landscape"],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1.5,
      },
    },
  ],
});
