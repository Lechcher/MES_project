# Spec Delta

## Purpose

Provides browser automation for end-to-end UI testing of the MES application, covering test setup, page object patterns, test fixtures, CI integration, and reusable test utilities for common user flows across Jobs, Planning, Performance, Settings, and Audit Log modules.

## ADDED Requirements

### Requirement: Playwright test environment is configured
The system SHALL provide a configured Playwright test environment that can run against the local development stack (Next.js frontend on port 3000, Bun/Elysia backend on port 3001).

#### Scenario: Test environment starts correctly
- **WHEN** a developer runs `bun run test:e2e` from the frontend directory
- **THEN** Playwright launches browsers and connects to the running dev servers

#### Scenario: Test environment uses correct base URLs
- **WHEN** Playwright tests navigate to the frontend
- **THEN** they use `http://localhost:3000` for the frontend and `http://localhost:3001` for the backend API

### Requirement: Reusable page objects for core UI flows
The system SHALL provide page object classes for the main application screens to enable maintainable test code.

#### Scenario: Login page object
- **WHEN** a test uses the LoginPage object
- **THEN** it can fill credentials, submit, and verify successful authentication

#### Scenario: Jobs ticket list page object
- **WHEN** a test uses the JobsTicketListPage object
- **THEN** it can filter, sort, create tickets, and navigate to ticket details

#### Scenario: Planning calendar page object
- **WHEN** a test uses the PlanningCalendarPage object
- **THEN** it can navigate weeks, view scheduled tasks, and open the leave board

#### Scenario: Settings page object
- **WHEN** a test uses the SettingsPage object
- **THEN** it can navigate tabs, modify settings, and verify changes persist

### Requirement: Test fixtures for common test data
The system SHALL provide test fixtures that create and clean up test data (users, tickets, projects, departments) for reliable test isolation.

#### Scenario: Authenticated test fixture
- **WHEN** a test uses the authenticated fixture
- **THEN** it runs with a logged-in user session and the session is cleaned up after

#### Scenario: Ticket test fixture
- **WHEN** a test uses the ticket fixture
- **THEN** it creates a ticket with specified properties and deletes it after the test

### Requirement: CI integration for automated test runs
The system SHALL support running Playwright tests in CI with headless browsers, parallel execution, and artifact collection (screenshots, videos, traces on failure).

#### Scenario: CI test run completes
- **WHEN** the CI pipeline runs `bun run test:e2e:ci`
- **THEN** tests execute in headless mode, parallel workers, and produce JUnit XML reports

#### Scenario: Failure artifacts are collected
- **WHEN** a test fails in CI
- **THEN** screenshot, video, and trace are uploaded as build artifacts