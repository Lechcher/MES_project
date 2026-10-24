/**
 * Test-specific Playwright configuration extending the root config.
 *
 * Sets test-specific paths for test directory, test match pattern,
 * and trace settings while inheriting webServer and browser projects
 * from `frontend/playwright.config.ts`.
 */

import { defineConfig } from "@playwright/test";
import baseConfig from "../playwright.config";

export default defineConfig({
  ...baseConfig,
  testDir: "./tests",
  testMatch: /.*\.spec\.ts$/,
  use: {
    ...baseConfig.use,
    trace: "retain-on-failure",
  },
  outputDir: "./tests/e2e/playwright-report",
});
