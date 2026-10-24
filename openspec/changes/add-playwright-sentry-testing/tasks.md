# Tasks

## 1. Playwright Foundation

- [ ] 1.1 Add Playwright dependencies to `frontend/package.json` (`@playwright/test` as devDependency) and verify `bun install` succeeds
- [ ] 1.2 Create `frontend/playwright.config.ts` with webServer for frontend (port 3000) and backend (port 3001), baseURL, projects (Chromium, Firefox, WebKit), retries, and artifact settings; verify config loads without error
- [ ] 1.3 Create `frontend/tests/playwright.config.ts` extending root config with test-specific settings (testDir, globalSetup, globalTeardown) and verify `bunx playwright test --list` lists expected tests
- [ ] 1.4 Create `frontend/tests/global-setup.ts` that starts dev servers, waits for readiness, and saves auth storage state; verify it completes without timeout
- [ ] 1.5 Create `frontend/tests/global-teardown.ts` for cleanup and verify it runs after test suite
- [ ] 1.6 Add npm scripts to `frontend/package.json`: `test:e2e`, `test:e2e:headed`, `test:e2e:ci`, `test:e2e:ui`, `test:e2e:install`; verify each script runs without error
- [ ] 1.7 Add Playwright test files to Biome `includes` in root `biome.json` and create `frontend/tests/biome.json` with test-specific rules; verify `bun run lint` passes on test files

## 2. Page Objects and Fixtures

- [ ] 2.1 Create `frontend/tests/pages/base.ts` with common utilities (waitForNetworkIdle, fillForm, clickAndWait, getByTestId) and verify it exports a usable base class
- [ ] 2.2 Create `frontend/tests/pages/login.ts` with login form interaction and verify a test can log in successfully
- [ ] 2.3 Create `frontend/tests/pages/jobs/ticket-list.ts` with filtering, sorting, creation, and navigation; verify a test can create and find a ticket
- [ ] 2.4 Create `frontend/tests/pages/jobs/ticket-detail.ts` with progress log, state transitions, and completion dialog; verify a test can submit a completion request
- [ ] 2.5 Create `frontend/tests/pages/jobs/ticket-completion.ts` with completion dialog and review flow; verify a test can approve/reject a completion request
- [ ] 2.6 Create `frontend/tests/pages/planning/calendar.ts` with week navigation, task viewing, and leave board; verify a test can navigate weeks and view tasks
- [ ] 2.7 Create `frontend/tests/pages/planning/leave-board.ts` with leave request creation and approval; verify a test can register and approve leave
- [ ] 2.8 Create `frontend/tests/pages/performance/dashboard.ts` with KPI viewing and audit tables; verify a test can navigate and read KPI data
- [ ] 2.9 Create `frontend/tests/pages/settings/settings.ts` with tab navigation and settings modification; verify a test can change and persist a setting
- [ ] 2.10 Create `frontend/tests/pages/audit-log/audit-log.ts` with log viewing and export; verify a test can view and export audit logs
- [ ] 2.11 Create `frontend/tests/fixtures/auth.ts` with authenticated test fixture (login, storage state) and verify a test runs with authenticated context
- [ ] 2.12 Create `frontend/tests/fixtures/data.ts` with test data factories (users, tickets, projects, departments, leave types) and verify a test can create and clean up data
- [ ] 2.13 Create `frontend/tests/fixtures/test-data.ts` with global test data setup/teardown and verify test isolation (no data leakage between tests)

## 3. Playwright Test Suites

- [ ] 3.1 Create `frontend/tests/tests/auth.spec.ts` with login/logout/session tests; verify all tests pass
- [ ] 3.2 Create `frontend/tests/tests/jobs/ticket-lifecycle.spec.ts` with create → accept → progress → complete → approve flow; verify all tests pass
- [ ] 3.3 Create `frontend/tests/tests/jobs/completion-request.spec.ts` with milestone and full-job completion, rejection, and resubmission; verify all tests pass
- [ ] 3.4 Create `frontend/tests/tests/planning/calendar.spec.ts` with week navigation, task creation, and scheduling; verify all tests pass
- [ ] 3.5 Create `frontend/tests/tests/planning/leave.spec.ts` with leave registration, approval, and balance; verify all tests pass
- [ ] 3.6 Create `frontend/tests/tests/performance/kpi.spec.ts` with KPI dashboard viewing and personal dashboard; verify all tests pass
- [ ] 3.7 Create `frontend/tests/tests/settings/settings.spec.ts` with settings modification and persistence; verify all tests pass
- [ ] 3.8 Create `frontend/tests/tests/audit-log/audit-log.spec.ts` with audit log viewing, filtering, and export; verify all tests pass

## 4. CI Integration

- [ ] 4.1 Create `.github/workflows/e2e.yml` with Playwright GitHub Action, dependency caching, and test execution; verify workflow runs on PR
- [ ] 4.2 Configure workflow to upload JUnit XML report, HTML report, and failure artifacts (screenshot, video, trace); verify artifacts appear on failed run
- [ ] 4.3 Add workflow trigger for push to main and PR; verify it runs on both events
- [ ] 4.4 Configure Playwright browser installation caching; verify subsequent runs are faster

## 5. Frontend Sentry Integration

- [ ] 5.1 Add `@sentry/nextjs` to `frontend/package.json` and verify `bun install` succeeds
- [ ] 5.2 Create `frontend/sentry.client.config.ts` with client-side initialization (DSN, environment, tracesSampleRate, beforeSend for data filtering); verify it exports a valid config
- [ ] 5.3 Create `frontend/sentry.server.config.ts` with server-side initialization for SSR/API routes; verify it exports a valid config
- [ ] 5.4 Create `frontend/sentry.edge.config.ts` with edge runtime initialization for middleware; verify it exports a valid config
- [ ] 5.5 Update `frontend/next.config.js` with `withSentryConfig` wrapper for source map upload; verify production build uploads source maps
- [ ] 5.6 Add Sentry environment variables to `frontend/.env.example` (`NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`); verify they are documented
- [ ] 5.7 Verify error capture in development by throwing a test error and confirming it appears in Sentry development project

## 6. Backend Sentry Integration

- [ ] 6.1 Add `@sentry/node` to `backend/package.json` and verify `bun install` succeeds
- [ ] 6.2 Create `backend/src/lib/sentry.ts` with initialization, custom Elysia plugin for request context, and utility functions; verify it exports init and plugin
- [ ] 6.3 Add Sentry Elysia plugin to backend service creation in `backend/src/index.ts`; verify plugin registers without error
- [ ] 6.4 Add performance monitoring wrappers for GraphQL resolvers and REST endpoints; verify transactions appear in Sentry
- [ ] 6.5 Add Sentry environment variables to `backend/.env.example` (`SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`); verify they are documented
- [ ] 6.6 Verify error capture in development by triggering a test error and confirming it appears in Sentry development project

## 7. Sentry Environment Configuration

- [ ] 7.1 Document Sentry project naming convention and environment mapping in `docs/sentry.md` (dev/staging/prod); verify documentation is complete
- [ ] 7.2 Configure separate Sentry projects for development, staging, and production with appropriate sampling rates; verify events route to correct project
- [ ] 7.3 Implement `beforeSend` hook in both frontend and backend to filter sensitive data (auth headers, cookies, passwords, DB credentials, JWTs); verify filtered data does not appear in Sentry
- [ ] 7.4 Configure alert rules in Sentry for critical error rate (>5% over 5min) and performance regression (p95 +50%); verify alerts fire on test conditions

## 8. Documentation

- [ ] 8.1 Create `docs/testing.md` with Playwright setup, running tests locally, CI integration, page object patterns, fixture usage, and debugging tips; verify documented commands work
- [ ] 8.2 Create `docs/sentry.md` with Sentry setup, environment configuration, alert rules, data filtering, and troubleshooting; verify documented setup works
- [ ] 8.3 Update `frontend/README.md` (or root README) with test commands and Sentry configuration; verify new contributor can follow docs to run tests
- [ ] 8.4 Verify all documented environment variables are present in `.env.example` files

## 9. Integration Verification

- [x] 9.1 Run full test suite locally (`bun run test:e2e` in frontend) and verify all tests pass
- [x] 9.2 Run lint on all new files (`bun run lint` in frontend and backend) and verify no new errors
- [x] 9.3 Trigger a test error in both frontend and backend and verify both appear in Sentry with correct context
- [x] 9.4 Run CI workflow manually and verify it completes successfully with artifacts
- [x] 9.5 Verify cross-browser tests run in CI (Chromium, Firefox, WebKit)

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result.