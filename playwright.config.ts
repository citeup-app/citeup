import { defineConfig, devices } from "@playwright/test";
import debug from "debug";

const PORT = 9222;

export default defineConfig({
  testDir: "./test/e2e",
  testMatch: /.*\.test\.ts$/,
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    port: PORT,
    env: {},
    reuseExistingServer: !process.env.CI,
    stdout: debug.enabled("server") ? "pipe" : "ignore",
    stderr: debug.enabled("server") ? "pipe" : "ignore",
  },
});
