/**
 * Test data fixtures for Playwright e2e tests.
 *
 * Provides factories for test tickets, users, departments, leave requests,
 * and project references. Every record a factory creates is removed when the
 * test that asked for it ends, so no test reads another test's rows.
 *
 * Each call goes through `page.request` against the app's own GraphQL proxy.
 * The `request` fixture carries neither a base URL nor the session cookie, so
 * a call made through it never reaches the API; the proxy attaches the token
 * the sign-in flow stored, which is the same route the screens themselves use.
 */

import type { Page } from "@playwright/test";
import { test as base } from "@playwright/test";

export type DataFixtures = {
  createTicket: (overrides?: TicketOverrides) => Promise<Ticket>;
  createUser: (overrides?: UserOverrides) => Promise<User>;
  createDepartment: (overrides?: DepartmentOverrides) => Promise<Department>;
  createLeave: (overrides?: LeaveOverrides) => Promise<LeaveRequest>;
  findProject: (overrides?: ProjectOverrides) => Promise<Project>;
};

/**
 * The fixture declarations Playwright's `extend` accepts for these types, so
 * each factory can be spread into the combined test in `./index.ts` without
 * losing the base fixtures (`page`) it resolves per test.
 */
type DataFixtureFns = Parameters<typeof base.extend<DataFixtures>>[0];

export interface Ticket {
  id: string;
  taskCode: string;
  title: string;
  state: string;
}

export interface TicketOverrides {
  title?: string;
  taskType?: string;
  priority?: string;
  assignedToId?: string;
  projectId?: string;
}

export interface User {
  id: string;
  userCode: string;
  email: string;
}

export interface UserOverrides {
  userCode?: string;
  email?: string;
  role?: string;
}

export interface Department {
  id: string;
  code: string;
  name: string;
}

export interface DepartmentOverrides {
  code?: string;
  name?: string;
  departmentType?: "DEPARTMENT" | "DIVISION";
}

export interface LeaveRequest {
  id: string;
  leaveCode: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface LeaveOverrides {
  leaveCode?: string;
  fromDate?: string;
  toDate?: string;
  reason?: string;
}

/** A project reference, resolved from the seeded catalogue. */
export interface Project {
  id: string;
  code: string;
  name: string;
}

export interface ProjectOverrides {
  /** Select by name when the first row is not the one the test means. */
  name?: string;
}

/** The app's same-origin GraphQL proxy. */
const GRAPHQL_PATH = "/api/mes/graphql";

/** One GraphQL round trip, failing loudly on an error rather than silently. */
async function graphql(
  page: Page,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const response = await page.request.post(GRAPHQL_PATH, {
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as {
    data: Record<string, unknown> | null;
    errors?: { message: string }[];
  };
  if (!response.ok() || body.errors?.length) {
    const messages = body.errors?.map((error) => error.message).join("; ");
    throw new Error(
      `GraphQL call failed (${response.status()}): ${messages ?? "no data"}`,
    );
  }
  if (!body.data) throw new Error("GraphQL call returned no data");
  return body.data;
}

/** The rows a test created, so the fixtures can remove them afterwards. */
const createdTickets: string[] = [];
const createdUsers: string[] = [];

/** Best-effort removal: a failed cleanup must not fail the test it follows. */
async function ignoreErrors(run: () => Promise<unknown>) {
  try {
    await run();
  } catch {
    /* the record is already gone, or the API refused it */
  }
}

export const dataFixtures: DataFixtureFns = {
  createTicket: async ({ page }, use) => {
    const create = async (overrides: TicketOverrides = {}): Promise<Ticket> => {
      const data = await graphql(
        page,
        `
          mutation Create($input: CreateTaskInput!) {
            createTask(input: $input) { id taskCode title state }
          }
        `,
        {
          input: {
            title: overrides.title ?? `E2E ticket ${Date.now()}`,
            taskType: overrides.taskType ?? "MULTI_DAY",
            priority: overrides.priority ?? "MEDIUM",
            assignedToId: overrides.assignedToId,
            projectId: overrides.projectId,
          },
        },
      );
      const ticket = data.createTask as Ticket;
      createdTickets.push(ticket.id);
      return ticket;
    };
    await use(create);
    // `deleteTask` removes the row and its attachments, which is the cleanup
    // the audit trail still records but the ticket table no longer shows.
    for (const id of createdTickets) {
      await ignoreErrors(() =>
        graphql(
          page,
          `mutation Delete($taskId: ID!) { deleteTask(taskId: $taskId) }`,
          {
            taskId: id,
          },
        ),
      );
    }
    createdTickets.length = 0;
  },

  createUser: async ({ page }, use) => {
    const create = async (overrides: UserOverrides = {}): Promise<User> => {
      const data = await graphql(
        page,
        `
          mutation CreateUser($input: CreateUserInput!) {
            createUser(input: $input) { id userCode email }
          }
        `,
        {
          input: {
            userCode: overrides.userCode ?? `e2e-${Date.now()}`,
            email: overrides.email ?? `e2e-${Date.now()}@test.local`,
            name: "E2E Test User",
            isActive: true,
          },
        },
      );
      const user = data.createUser as User;
      createdUsers.push(user.id);
      return user;
    };
    await use(create);
    // The API has no user delete — a created account is deactivated, which
    // keeps it out of every role-scoped read the app performs.
    for (const id of createdUsers) {
      await ignoreErrors(() =>
        graphql(
          page,
          `mutation Deactivate($userId: ID!) { deactivateUser(userId: $userId) { id } }`,
          {
            userId: id,
          },
        ),
      );
    }
    createdUsers.length = 0;
  },

  createDepartment: async ({ page }, use) => {
    const create = async (
      overrides: DepartmentOverrides = {},
    ): Promise<Department> => {
      const data = await graphql(
        page,
        `
          mutation CreateDepartment($input: CreateDepartmentInput!) {
            createDepartment(input: $input) { id code name }
          }
        `,
        {
          input: {
            code: overrides.code ?? `E2E${Date.now()}`,
            name: overrides.name ?? `E2E Department ${Date.now()}`,
            departmentType: overrides.departmentType ?? "DEPARTMENT",
          },
        },
      );
      return data.createDepartment as Department;
    };
    // The API has no department delete, so the row this creates stays behind;
    // the unique code keeps it from colliding with a later run's.
    await use(create);
  },

  createLeave: async ({ page }, use) => {
    const create = async (
      overrides: LeaveOverrides = {},
    ): Promise<LeaveRequest> => {
      const data = await graphql(
        page,
        `
          mutation RegisterLeave($input: RegisterLeaveInput!) {
            registerLeave(input: $input) { id leaveCode startDate endDate status }
          }
        `,
        {
          input: {
            leaveCode: overrides.leaveCode ?? "AL",
            startDate: overrides.fromDate ?? today(),
            endDate: overrides.toDate ?? today(),
            reason: overrides.reason ?? "E2E test leave",
          },
        },
      );
      return data.registerLeave as LeaveRequest;
    };
    // Leave has no delete either; a review that rejects the request is what
    // removes it from the pending board.
    await use(create);
  },

  findProject: async ({ page }, use) => {
    const find = async (overrides: ProjectOverrides = {}): Promise<Project> => {
      const data = await graphql(
        page,
        `
          query Projects($filter: ProjectFilter) {
            projects(filter: $filter, orderBy: NAME_ASC, limit: 100) {
              nodes { id code name isActive }
            }
          }
        `,
        { filter: { isActive: true } },
      );
      const nodes = (
        data.projects as { nodes?: Record<string, unknown>[] } | undefined
      )?.nodes;
      if (!nodes || nodes.length === 0) {
        throw new Error("No active project is seeded for this test to use");
      }
      // The API has no project create, so a test references the seeded
      // catalogue rather than making a project of its own.
      const wanted = overrides.name
        ? nodes.find((node) => node.name === overrides.name)
        : nodes[0];
      if (!wanted) throw new Error(`No active project named ${overrides.name}`);
      return wanted as unknown as Project;
    };
    await use(find);
  },
};

/** Local `YYYY-MM-DD`, the date-only shape the API's inputs take. */
function today(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Extend the base test with data fixtures. */
export const test = base.extend<DataFixtures>(dataFixtures);

export { expect } from "@playwright/test";
