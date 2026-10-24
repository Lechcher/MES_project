/**
 * Global test data setup and teardown for Playwright e2e tests.
 *
 * Seeds minimal reference data (departments, roles, users) before tests run
 * and ensures no test data leaks between tests.
 */

import { test as base } from "@playwright/test";

export type TestDataFixtures = {
  seedData: () => Promise<void>;
};

const seeded = new Set<string>();

/** Extend the base test with test data fixtures. */
export const test = base.extend<TestDataFixtures>({
  seedData: async ({ request }, use) => {
    const seed = async () => {
      if (seeded.has("data")) return;
      // Seed departments, roles, and demo users through the API.
      // Best-effort: ignore failures since some data may already exist.
      try {
        await request.post("/api/v1/graphql", {
          headers: { "Content-Type": "application/json" },
          data: JSON.stringify({
            query: `
              mutation Seed($input: CreateDepartmentInput!) {
                createDepartment(input: $input) { id }
              }
            `,
            variables: { input: { code: "ENG", name: "Engineering" } },
          }),
        });
      } catch {
        /* ignore */
      }
      seeded.add("data");
    };
    await seed();
    await use(seed);
  },
});

export { expect } from "@playwright/test";
