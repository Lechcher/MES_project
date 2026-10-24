/**
 * Playwright configuration for MES Prototype end-to-end testing.
 *
 * Starts the local development stack (Next.js frontend on port 3000,
 * Bun/Elysia backend on port 3001) before tests run and stops them afterward.
 * Defines browser projects for cross-browser testing in CI.
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e/tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? undefined : 1,
  reporter: process.env.CI ? "junit" : "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },

  webServer: [
    {
      name: "frontend",
      command: "bun run dev",
      cwd: "./frontend",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      name: "backend",
      command: "bun run dev",
      cwd: "./backend",
      url: "http://localhost:3001/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],

  outputDir: "./tests/e2e/playwright-report",
});
