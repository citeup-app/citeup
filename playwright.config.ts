import { defineConfig, devices } from "@playwright/test";
import { port } from "./test/helpers/launchBrowser";

export default defineConfig({
  globalSetup: "test/helpers/global.setup.ts",
  maxFailures: 1,
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  reporter: process.env.CI ? "github" : "list",
  retries: process.env.CI ? 2 : 0,
  testDir: "test/e2e",
  testMatch: /.*\.test\.ts$/,
  use: {
    baseURL: `http://localhost:${port}`,
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 720 },
  },
});
