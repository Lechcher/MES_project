/**
 * Global test setup for Playwright e2e tests.
 *
 * Ensures the frontend and backend dev servers are reachable, saves
 * an authenticated storage state so tests can reuse a logged-in
 * session without re-logging in, and seeds minimal test data through
 * the API.
 */

import { chromium, expect, type FullConfig } from "@playwright/test";
import { startMailSink } from "./fixtures/mail-sink";

export default async function globalSetup(config: FullConfig) {
  // This Playwright version populates `use` per project; the top-level object
  // is undefined, so the settings are resolved from the first project.
  const projectUse = config.projects?.[0]?.use ?? {};
  const baseURL: string = projectUse.baseURL ?? "http://localhost:3000";
  // The project's storage state may be a path or an inline object; this
  // setup saves a path, so an inline object falls back to the default path.
  const storageState: string =
    typeof projectUse.storageState === "string"
      ? projectUse.storageState
      : "./tests/.auth/user.json";

  // The mail sink must be listening before the backend can mail anything
  // through it, so it starts before the health checks below.
  await startMailSink();

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

    // Fill in the seeded super-admin credentials and submit. The form is
    // label-based (see `pages/login.ts`), so no test ids are needed.
    await page.getByLabel("email").fill("super.admin@mes.local");
    await page.getByLabel("password").fill("MES-dev-seed-2026!");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Wait for navigation away from the signin page. The matcher is the
    // resolved dashboard, not "any URL" — the session cookie is set by the
    // redirect target, so saving state too early captures no cookies.
    await page.waitForURL((url) => !url.pathname.startsWith("/signin"), {
      timeout: 30_000,
    });
    await page.waitForLoadState("networkidle");

    // Save storage state so individual tests can start authenticated.
    await page.context().storageState({ path: storageState as string });
  } finally {
    await browser.close();
  }
}
