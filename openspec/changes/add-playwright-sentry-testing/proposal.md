# Proposal

## Why

The MES Prototype currently lacks automated browser testing and error monitoring capabilities. Manual testing is time-consuming and error-prone, especially for complex UI flows like ticket completion, planning calendars, and leave management. Sentry integration would provide real-time error tracking and performance monitoring in production.

## What Changes

- Add Playwright browser automation for end-to-end UI testing across the Jobs, Planning, Performance, Settings, and Audit Log modules
- Integrate Sentry MCP for error tracking and performance monitoring in development and production
- Create a test harness that can run Playwright tests against the local development environment (Next.js frontend + Bun/Elysia backend)
- Add Sentry SDK configuration for both frontend and backend with proper source map support
- Create reusable test utilities for common user flows (login, ticket creation, completion requests, leave registration)

## Capabilities

### New Capabilities

- `tooling/playwright-testing`: Browser automation for end-to-end UI testing of the MES application. Covers test setup, page object patterns, test fixtures, CI integration, and reusable test utilities for common user flows.
- `tooling/sentry-monitoring`: Sentry error tracking and performance monitoring for both frontend (Next.js) and backend (Bun/Elysia). Covers SDK initialization, source map upload, environment configuration, and alert routing.

### Modified Capabilities

- `tooling/lint-configuration`: Add linting rules for Playwright test files and Sentry configuration files to maintain code quality standards.

## Impact

**Frontend:**
- New test files under `frontend/tests/e2e/` for Playwright tests
- Sentry SDK integration in `frontend/src/lib/sentry/` (or similar)
- New npm scripts for running e2e tests (`test:e2e`, `test:e2e:headed`, `test:e2e:ci`)

**Backend:**
- Sentry SDK integration in `backend/src/lib/sentry/` (or similar)
- Configuration in `backend/.env.example` for Sentry DSN and environment
- Source map generation for production builds

**Infrastructure:**
- CI pipeline additions for running Playwright tests
- Sentry project setup (external, documented in setup guide)
- Documentation updates in `docs/` for testing and monitoring setup

**Dependencies:**
- Frontend: `@playwright/test`, `@sentry/nextjs`
- Backend: `@sentry/node` (or `@sentry/bun` if available), or manual integration
- Dev dependencies only - no runtime dependency changes for production