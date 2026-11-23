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

`BasePage` (`frontend/tests/pages/base.ts`) supplies the shared helpers every
page object builds on: `waitForNetworkIdle`, `fillByLabel`,
`fillByPlaceholder`, `clickByTestId`, `fillByTestId`, and the common
locator/expect helpers.

### Fixtures

Use the `loginPage` fixture to sign in, and rely on the default storage state
(`frontend/tests/.auth/user.json`) so a test starts authenticated:

```ts
import { expect, test } from "../fixtures";

test("open a ticket", async ({ page, loginPage }) => {
  await loginPage.login("demo@mes.local", "demo-password");
  await page.goto("/jobs");
  // ...
});
```

### Test Data

Use the `createTicket` and `createUser` fixtures to create test data
through the API, plus `cleanup` to remove records that outlive a test:

```ts
import { test } from "../fixtures/data";

test("create a ticket", async ({ createTicket }) => {
  const ticket = await createTicket({ title: "Test ticket" });
  expect(ticket.title).toBe("Test ticket");
});
```

## Debugging

Run a single test in a visible browser so the failing step can be inspected:

```bash
# One file, headed, with the Playwright inspector
bun run test:e2e tests/tests/auth.spec.ts --headed --debug

# One test by title
bun run test:e2e -g "logs in with valid credentials"
```

File arguments are relative to `frontend/` and must include the configured
`testDir` (`tests/tests`), as above. Both commands must run from inside
`frontend/`.

Options that make failures diagnosable:

- `--headed` — watch the browser while the test runs.
- `--debug` — step through the test with the inspector.
- `--trace on` — record a trace (DOM snapshots, network, actions) for every
  test instead of only failures.
- `--reporter=line` — terse output while iterating.

Artifacts for a failed test are written to the configured output directory,
`frontend/tests/e2e/playwright-report/`, alongside the HTML report:

```bash
# Open the last HTML report (needs --reporter=html or the default local reporter)
cd frontend
bunx playwright show-report
```

Common causes of a failure:

- The dev server was not ready when the test ran — make sure ports 3000 and
  3001 are free, or let `webServer` start them.
- A selector changed — use `data-testid` attributes (see the page objects) so
  the tests do not depend on styling classes.
- The test ran before an async update settled — prefer `waitFor` on a visible
  state over `waitForTimeout`.

## Linting

Test files are linted with Biome:

```bash
cd frontend
bun run lint
```

Test-specific lint rules are in `frontend/tests/biome.json`.

## CI

Playwright tests run in GitHub Actions (`.github/workflows/e2e.yml`) on
push to `main` and pull requests, across all three browser projects. Results
are uploaded as artifacts: the JUnit XML report, the HTML report with failure
screenshots, videos, and traces (`playwright-report`, `junit-report`).