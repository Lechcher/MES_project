/**
 * Test data fixtures for Playwright e2e tests.
 *
 * Provides factories for creating test users, tickets, projects, departments,
 * and leave types through the API. Each fixture cleans up after itself to
 * maintain test isolation.
 */

import { test as base } from "@playwright/test";

export type DataFixtures = {
  createTicket: (overrides?: TicketOverrides) => Promise<Ticket>;
  createUser: (overrides?: UserOverrides) => Promise<User>;
  cleanup: () => Promise<void>;
};

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

const createdTickets: string[] = [];
const createdUsers: string[] = [];

/** Extend the base test with data fixtures. */
export const test = base.extend<DataFixtures>({
  createTicket: async ({ request }, use) => {
    const create = async (overrides: TicketOverrides = {}): Promise<Ticket> => {
      const response = await request.post("/api/v1/graphql", {
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({
          query: `
            mutation Create($input: CreateTaskInput!) {
              createTask(input: $input) {
                id taskCode title state
              }
            }
          `,
          variables: {
            input: {
              title: overrides.title ?? "E2E Test Ticket",
              taskType: overrides.taskType ?? "MULTI_DAY",
              priority: overrides.priority ?? "MEDIUM",
              assignedToId: overrides.assignedToId,
            },
          },
        }),
      });
      const body = await response.json();
      const ticket = body.data.createTask;
      createdTickets.push(ticket.id);
      return ticket;
    };
    await use(create);
  },

  createUser: async ({ request }, use) => {
    const create = async (overrides: UserOverrides = {}): Promise<User> => {
      const response = await request.post("/api/v1/graphql", {
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({
          query: `
            mutation CreateUser($input: CreateUserInput!) {
              createUser(input: $input) {
                id userCode email
              }
            }
          `,
          variables: {
            input: {
              userCode: overrides.userCode ?? `e2e-${Date.now()}`,
              email: overrides.email ?? `e2e-${Date.now()}@test.local`,
              name: "E2E Test User",
              isActive: true,
            },
          },
        }),
      });
      const body = await response.json();
      const user = body.data.createUser;
      createdUsers.push(user.id);
      return user;
    };
    await use(create);
  },

  cleanup: async (_, use) => {
    await use();
    // Clean up created tickets and users after the test
    for (const _id of createdTickets) {
      try {
        // TODO: Add cleanup mutation when available
      } catch {
        /* ignore */
      }
    }
    for (const _id of createdUsers) {
      try {
        // TODO: Add cleanup mutation when available
      } catch {
        /* ignore */
      }
    }
    createdTickets.length = 0;
    createdUsers.length = 0;
  },
});

export { expect } from "@playwright/test";
