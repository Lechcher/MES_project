# Spec Delta

## MODIFIED Requirements

### Requirement: Generated and vendor output is excluded
Linting SHALL ignore generated build output, installed dependencies, **and Playwright test artifacts (traces, videos, screenshots)**, so that a repository-wide lint neither reports findings from files the repository does not author nor fails on them.

#### Scenario: Build output and dependencies are ignored
- **WHEN** the linter runs over the whole repository
- **THEN** it reports no findings from build output or installed dependencies

#### Scenario: Generated artifacts do not fail a repository-wide lint
- **WHEN** a repository-wide lint runs while generated artifacts are present
- **THEN** the run's pass or fail status is decided by authored sources, not by those artifacts

#### Scenario: Playwright test artifacts are ignored
- **WHEN** the linter runs over the whole repository
- **THEN** it reports no findings from `test-results/`, `playwright-report/`, or `.sentry/` directories

#### Scenario: Playwright generated artifacts do not fail a repository-wide lint
- **WHEN** a repository-wide lint runs while Playwright test artifacts are present
- **THEN** the run's pass or fail status is decided by authored sources, not by those artifacts

## ADDED Requirements

### Requirement: Playwright test files follow linting standards
The system SHALL lint Playwright test files (`**/*.spec.ts`, `**/*.test.ts`, `**/*.e2e.ts`) with the same Biome configuration as application code, ensuring consistent style and catching common test code issues.

#### Scenario: Playwright tests are linted on `bun run lint`
- **WHEN** the linter runs from the repository root
- **THEN** it processes Playwright test files under `frontend/tests/` and reports findings using the root configuration

#### Scenario: Test-specific lint rules are applied
- **WHEN** Playwright test files are linted
- **THEN** they are checked for common test anti-patterns (e.g., `test.only`, `expect(true).toBe(true)`) without failing the build on warnings

### Requirement: Sentry configuration files are validated
The system SHALL validate Sentry configuration files (`sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `sentry.properties`) for correct syntax and required fields.

#### Scenario: Sentry client config is linted
- **WHEN** the linter runs over frontend Sentry configuration files
- **THEN** they are checked for TypeScript syntax and required Sentry options (dsn, environment, tracesSampleRate)

#### Scenario: Sentry server config is linted
- **WHEN** the linter runs over backend Sentry configuration files
- **THEN** they are checked for TypeScript syntax and required Sentry options

### Requirement: Playwright config file is validated
The system SHALL validate the Playwright configuration file (`playwright.config.ts`) for correct syntax and required options.

#### Scenario: Playwright config is linted
- **WHEN** the linter runs over `playwright.config.ts`
- **THEN** it is checked for TypeScript syntax and required options (projects, use.baseURL, testDir, webServer)