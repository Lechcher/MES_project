/**
 * Global test data setup and teardown for Playwright e2e tests.
 *
 * Seeds the shared reference data the app's screens read (departments, roles,
 * users) once per run through the app's own GraphQL proxy, and clears the
 * memo that recorded the seeding afterwards.
 *
 * Test isolation: the shared rows are idempotently seeded and read by
 * everyone, while the per-test factories in `./data` key every row they
 * create uniquely and remove what they made — so a test only ever reads its
 * own rows, and none of them leak into the next test.
 */

import { test as base } from "@playwright/test";

export type TestDataFixtures = {
  seedData: () => Promise<void>;
  /** Drop the memo that recorded the seeding. */
  clearSeedState: () => void;
};

/**
 * The fixture declarations Playwright's `extend` accepts for these types — see
 * `./data.ts` for why they are exported as a typed object.
 */
type TestDataFixtureFns = Parameters<typeof base.extend<TestDataFixtures>>[0];

/** The app's same-origin GraphQL proxy — see `./data.ts`. */
const GRAPHQL_PATH = "/api/mes/graphql";

const seeded = new Set<string>();

export const testDataFixtures: TestDataFixtureFns = {
  seedData: async ({ page }, use) => {
    const post = async (query: string, variables: Record<string, unknown>) => {
      await page.request.post(GRAPHQL_PATH, {
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({ query, variables }),
      });
    };

    const seed = async () => {
      if (seeded.has("data")) return;
      // Seed departments, roles, and demo users through the API.
      // Best-effort: ignore failures since some data may already exist.
      try {
        await post(
          `
            mutation Seed($input: CreateDepartmentInput!) {
              createDepartment(input: $input) { id }
            }
          `,
          {
            input: {
              code: "ENG",
              name: "Engineering",
              departmentType: "DEPARTMENT",
            },
          },
        );
      } catch {
        /* the row is already there, or the API refused it */
      }
      seeded.add("data");
    };

    await seed();
    await use(seed);
  },

  clearSeedState: async (_) => {
    seeded.clear();
  },
};

/** Extend the base test with test data fixtures. */
export const test = base.extend<TestDataFixtures>(testDataFixtures);

export { expect } from "@playwright/test";
