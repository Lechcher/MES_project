/**
 * Combined test fixtures for Playwright e2e tests.
 *
 * Merges the authentication, test data, and global seed fixtures into a
 * single test object every spec imports.
 */

import { test as authTest } from "./auth";
import { type DataFixtures, dataFixtures } from "./data";
import { type TestDataFixtures, testDataFixtures } from "./test-data";

export const test = authTest.extend<DataFixtures & TestDataFixtures>({
  ...dataFixtures,
  ...testDataFixtures,
});

export { expect } from "@playwright/test";
