# Design

## Context

The MES Prototype is a full-stack TypeScript application with a Next.js 16 frontend (App Router) and a Bun/Elysia backend with GraphQL. The project uses Biome for linting/formatting and has an existing test setup with bun:test for unit/integration tests. There is currently no end-to-end browser testing or error monitoring infrastructure.

The proposal adds two new capabilities:
- `tooling/playwright-testing`: Browser automation for e2e UI testing
- `tooling/sentry-monitoring`: Sentry error tracking and performance monitoring

Both capabilities are cross-cutting and affect the frontend and backend.

## Goals / Non-Goals

**Goals:**
- Add Playwright test infrastructure with page objects, fixtures, and CI integration
- Add Sentry SDK integration for both frontend (Next.js) and backend (Bun/Elysia)
- Provide reusable test utilities for common user flows
- Configure linting for new test and configuration files
- Document setup and usage in `docs/`

**Non-Goals:**
- Visual regression testing (can be added later)
- Load/stress testing
- Mobile app testing (web only)
- Sentry session replay (can be added later)
- Custom Sentry integrations beyond standard Next.js/Bun setup

## Decisions

### 1. Playwright Test Location and Structure

**Decision:** Place Playwright tests in `frontend/tests/e2e/` with the following structure:
```
frontend/tests/
├── e2e/
│   ├── fixtures/
│   │   ├── auth.ts          # Auth fixtures (login, sessions)
│   │   ├── data.ts          # Test data factories (users, tickets, projects)
│   │   └── test-data.ts     # Global test data setup/teardown
│   ├── pages/
│   │   ├── base.ts          # Base page object with common utilities
│   │   ├── login.ts         # Login page object
│   │   ├── jobs/
│   │   │   ├── ticket-list.ts
│   │   │   ├── ticket-detail.ts
│   │   │   └── ticket-completion.ts
│   │   ├── planning/
│   │   │   ├── calendar.ts
│   │   │   └── leave-board.ts
│   │   ├── performance/
│   │   │   └── dashboard.ts
│   │   ├── settings/
│   │   │   └── settings.ts
│   │   └── audit-log/
│   │       └── audit-log.ts
│   ├── tests/
│   │   ├── auth.spec.ts
│   │   ├── jobs/
│   │   │   ├── ticket-lifecycle.spec.ts
│   │   │   └── completion-request.spec.ts
│   │   ├── planning/
│   │   │   ├── calendar.spec.ts
│   │   │   └── leave.spec.ts
│   │   ├── performance/
│   │   │   └── kpi.spec.ts
│   │   ├── settings/
│   │   │   └── settings.spec.ts
│   │   └── audit-log/
│   │       └── audit-log.spec.ts
│   └── utils/
│       ├── helpers.ts       # Common test utilities
│       └── test-ids.ts      # Data-testid constants
├── playwright.config.ts     # Playwright configuration
└── global-setup.ts          # Global test setup (start dev servers)
```

**Rationale:** Colocating tests with the frontend package keeps the test code close to the application code it tests. The page object pattern provides maintainability. The `tests/` subdirectory separates test specs from support code.

**Alternatives considered:**
- `tests/e2e/` at repo root: Would require more complex path configuration for imports
- Tests inside each feature package: The MES project doesn't have feature packages yet

### 2. Playwright Configuration

**Decision:** Use `playwright.config.ts` with:
- `testDir: './tests/e2e/tests'`
- `webServer` configuration to start both frontend (port 3000) and backend (port 3001) dev servers
- `baseURL: 'http://localhost:3000'`
- Projects for Chromium, Firefox, WebKit (CI), and Chromium only (local dev)
- Retries: 2 in CI, 0 locally
- Artifacts: screenshot/video/trace on failure
- Reporters: HTML for local, JUnit for CI

**Rationale:** The `webServer` option ensures tests always run against a fresh dev environment. Multiple browser projects provide cross-browser coverage in CI.

### 3. Frontend Sentry Integration

**Decision:** Use `@sentry/nextjs` with the following setup:
- `sentry.client.config.ts` - Client-side initialization
- `sentry.server.config.ts` - Server-side initialization (for SSR/API routes)
- `sentry.edge.config.ts` - Edge runtime initialization (for middleware)
- `next.config.js` with `withSentryConfig` wrapper for source map upload
- Environment variables: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`

**Rationale:** `@sentry/nextjs` is the official integration and handles Next.js App Router specifics (server components, middleware, edge runtime). Source map upload requires the build-time wrapper.

### 4. Backend Sentry Integration

**Decision:** Use `@sentry/node` with manual integration since there's no official `@sentry/bun` or `@sentry/elysia` package yet:
- `backend/src/lib/sentry.ts` - Initialization and utilities
- Custom Elysia plugin for request context capture
- Environment variables: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`
- Performance monitoring via manual transaction wrapping for GraphQL resolvers and REST endpoints

**Rationale:** Bun/Elysia is not officially supported by Sentry yet. Manual integration gives us control and works reliably. We can wrap the Elysia `onError` hook and add request context to events.

### 5. Sentry Environment Configuration

**Decision:** Three environments with separate Sentry projects:
- `development` - 100% sampling, all developers
- `staging` - 10% sampling, QA team
- `production` - 1% sampling (errors 100%), whole team

Environment determined by `NODE_ENV` (or `SENTRY_ENVIRONMENT` override).

**Rationale:** Separate projects prevent noise in production. Different sampling rates control costs while maintaining visibility.

### 6. Sensitive Data Filtering

**Decision:** Use Sentry's `beforeSend` hook to filter:
- Authorization headers → `[Filtered]`
- Cookie headers → `[Filtered]`
- Password fields in request bodies
- Database connection strings in stack traces
- JWT tokens in any context

**Rationale:** Required for security compliance. Sentry's built-in PII filtering is not sufficient for our auth patterns.

### 7. Linting for New Files

**Decision:** Extend the existing Biome configuration:
- Add `frontend/tests/**` to `files.includes` in root `biome.json`
- Add `**/playwright.config.ts` and `**/sentry.*.config.ts` to includes
- Create `frontend/tests/biome.json` extending root with test-specific rules (e.g., allow `test.only` as warning)

**Rationale:** Maintains single root configuration while allowing test-specific overrides.

### 8. CI Integration

**Decision:** Add GitHub Actions workflow `.github/workflows/e2e.yml`:
- Runs on PR and push to main
- Uses `actions/setup-node` and `microsoft/playwright-github-action`
- Caches `~/.cache/ms-playwright`
- Runs `bun run test:e2e:ci` in frontend
- Uploads JUnit report, HTML report, and failure artifacts

**Rationale:** GitHub Actions is the project's CI platform. The official Playwright action handles browser installation and caching.

### 9. Package.json Scripts

**Decision:** Add to `frontend/package.json`:
```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:ci": "playwright test --reporter=junit",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:install": "playwright install --with-deps",
    "lint": "biome check .",
    "lint:fix": "biome check --write ."
  }
}
```

And to `backend/package.json`:
```json
{
  "scripts": {
    "lint": "biome check",
    "lint:fix": "biome format --write"
  }
}
```

**Rationale:** Consistent naming with existing scripts. The `test:e2e:install` script helps new contributors.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Playwright tests are flaky | Use robust selectors (`data-testid`), wait for network idle, retry on CI |
| Sentry DSN exposure in frontend | DSN is public by design; use separate projects per environment |
| Backend Sentry integration is manual | Wrap in a well-tested utility module; add integration tests |
| Source map upload fails in CI | Use Sentry CLI with `SENTRY_AUTH_TOKEN`; fail build on upload error |
| Dev server startup in CI is slow | Cache `node_modules`; use `webServer.reuseExistingServer` for local runs |
| Test data pollution between tests | Use fixtures with automatic cleanup; isolate with unique IDs |
| Cross-browser differences | Primary Chromium; Firefox/WebKit only in CI for critical paths |
| Sentry cost at scale | Use sampling rates; monitor quota; adjust per environment |

## Migration Plan

1. **Phase 1 - Playwright Foundation** (Week 1)
   - Add Playwright dependencies and config
   - Create base page objects and fixtures
   - Add CI workflow
   - Verify with a simple smoke test (login → dashboard)

2. **Phase 2 - Frontend Sentry** (Week 1-2)
   - Add `@sentry/nextjs` and configuration files
   - Update `next.config.js` with Sentry wrapper
   - Verify error capture in development

3. **Phase 3 - Backend Sentry** (Week 2)
   - Add `@sentry/node` and custom integration
   - Add Elysia plugin for request context
   - Verify error capture and performance monitoring

4. **Phase 4 - Test Coverage** (Week 2-3)
   - Implement page objects for all modules
   - Write test suites for critical user flows
   - Add to CI pipeline

5. **Phase 5 - Documentation & Polish** (Week 3)
   - Write `docs/testing.md` and `docs/sentry.md`
   - Update `README.md` with test commands
   - Team walkthrough

**Rollback:** Each phase is independently revertible via git. Sentry can be disabled by unsetting DSN env vars.

## Open Questions

1. **Sentry organization/project names** - Need to decide on naming convention (e.g., `mes-prototype-frontend-dev`, `mes-prototype-backend-prod`). Can be answered during Phase 2/3 setup.

2. **Playwright authentication strategy** - Whether to use global setup with saved storage state or login per test. Recommendation: global setup with storage state for speed, with fallback to per-test login for auth-specific tests.

3. **Test data strategy** - Whether to seed database via API or direct DB access. Recommendation: API for realism, direct DB for speed in CI (use separate test database).

4. **Sentry alert thresholds** - Exact error rate and performance thresholds need team input based on baseline metrics. Can start with defaults and tune.