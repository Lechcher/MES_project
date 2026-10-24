# E2E Testing with Playwright

The MES Prototype uses Playwright for end-to-end browser testing of the
frontend application against the local development stack.

## Test Structure

```
frontend/tests/
├── playwright.config.ts      # Root Playwright configuration
├── tests/playwright.config.ts # Test-specific config overrides
├── global-setup.ts           # Global setup (auth storage state)
├── global-teardown.ts        # Global teardown
├── pages/                    # Page objects
│   ├── base.ts               # Base page with common utilities
│   ├── login.ts              # Sign-in page
│   ├── jobs/
│   │   ├── ticket-list.ts
│   │   ├── ticket-detail.ts
│   │   └── ticket-completion.ts
│   ├── planning/
│   │   ├── calendar.ts
│   │   └── leave-board.ts
│   ├── performance/
│   │   └── dashboard.ts
│   ├── settings/
│   │   └── settings.ts
│   └── audit-log/
│       └── audit-log.ts
├── fixtures/                 # Test fixtures
│   ├── auth.ts               # Authentication fixtures
│   ├── data.ts               # Test data factories
│   └── test-data.ts          # Global test data setup
├── biome.json                # Lint configuration for tests
└── tests/                    # Test specifications
    ├── auth.spec.ts
    ├── jobs/
    │   ├── ticket-lifecycle.spec.ts
    │   └── completion-request.spec.ts
    ├── planning/
    │   ├── calendar.spec.ts
    │   └── leave.spec.ts
    ├── performance/
    │   └── kpi.spec.ts
    ├── settings/
    │   └── settings.spec.ts
    └── audit-log/
        └── audit-log.spec.ts
```

## Setup

Install dependencies and Playwright browsers:

```bash
cd frontend
bun install
bun run test:e2e:install
```

## Running Tests

### Locally (headed browser)

```bash
bun run test:e2e:headed
```

### Locally (headless)

```bash
bun run test:e2e
```

### UI mode (interactive)

```bash
bun run test:e2e:ui
```

### CI mode (JUnit reporter)

```bash
bun run test:e2e:ci
```

## Prerequisites

Both the frontend dev server (port 3000) and backend dev server (port 3001)
must be running. Playwright's `webServer` configuration starts them
automatically when tests run.

## Writing Tests

### Page Objects

Use the page object pattern for maintainable tests. Each page object extends
`BasePage` and exposes locators and helper methods:

```ts
import { TicketListPage } from "../pages/jobs/ticket-list";

const listPage = new TicketListPage(page);
await listPage.goto();
await listPage.filterByState("ACT");
await listPage.openTicket("My ticket");
```

### Fixtures

Use the `authenticatedPage` fixture for tests that require a logged-in
session:

```ts
import { test } from "../fixtures/auth";

test("view ticket list", async ({ authenticatedPage }) => {
  await authenticatedPage.goto("/jobs");
  // ...
});
```

### Test Data

Use the `createTicket` and `createUser` fixtures to create test data
through the API. Created records are cleaned up after each test:

```ts
import { test } from "../fixtures/data";

test("create a ticket", async ({ createTicket }) => {
  const ticket = await createTicket({ title: "Test ticket" });
  expect(ticket.title).toBe("Test ticket");
});
```

## Linting

Test files are linted with Biome:

```bash
cd frontend
bun run lint
```

Test-specific lint rules are in `frontend/tests/biome.json`.

## CI

Playwright tests run in GitHub Actions (`.github/workflows/e2e.yml`) on
push to `main` and pull requests. Results are uploaded as artifacts
(JUnit XML, HTML report, screenshots/videos on failure).