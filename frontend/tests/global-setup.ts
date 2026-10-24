/**
 * Global test setup for Playwright e2e tests.
 *
 * Ensures the frontend and backend dev servers are reachable, saves
 * an authenticated storage state so tests can reuse a logged-in
 * session without re-logging in, and seeds minimal test data through
 * the API.
 */

import { chromium, expect } from "@playwright/test";

export default async function globalSetup(config) {
  const { baseURL, storageState } = config.use;

  // Verify both dev servers are reachable before any test runs.
  const frontendHealth = await fetch(`${baseURL ?? "http://localhost:3000"}`);
  expect(frontendHealth.ok).toBe(true);

  const backendHealth = await fetch("http://localhost:3001/health");
  expect(backendHealth.ok).toBe(true);

  // Save an authenticated storage state for tests that need a logged-in
  // session without re-logging in on every test.
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(`${baseURL ?? "http://localhost:3000"}/signin`);

    // Fill in demo credentials and submit.
    await page.getByTestId("username").fill("demo@mes.local");
    await page.getByTestId("password").fill("demo-password");
    await page.getByTestId("signin-button").click();

    // Wait for navigation away from the signin page.
    await page.waitForURL(`${baseURL ?? "http://localhost:3000"}/**`, {
      timeout: 10_000,
    });

    // Save storage state so individual tests can start authenticated.
    await page.context().storageState({ path: storageState as string });
  } finally {
    await browser.close();
  }
}
