# Spec Delta

## Purpose

Provides Sentry error tracking and performance monitoring for both frontend (Next.js) and backend (Bun/Elysia), covering SDK initialization, source map upload, environment configuration, and alert routing to enable real-time production observability.

## ADDED Requirements

### Requirement: Frontend Sentry SDK initialization
The system SHALL initialize the Sentry Next.js SDK in the frontend application with environment-specific configuration, source map upload, and automatic error capture.

#### Scenario: Sentry initializes on frontend startup
- **WHEN** the Next.js application starts in development or production
- **THEN** Sentry SDK initializes with the correct DSN and environment from environment variables

#### Scenario: Source maps are uploaded in production
- **WHEN** the frontend is built for production
- **THEN** source maps are generated and uploaded to Sentry automatically

#### Scenario: Frontend errors are captured with context
- **WHEN** an unhandled error occurs in the browser
- **THEN** Sentry captures the error with user context, breadcrumbs, and component stack traces

### Requirement: Backend Sentry SDK initialization
The system SHALL initialize Sentry error tracking in the Bun/Elysia backend with request context, performance monitoring, and integration with the existing error handling.

#### Scenario: Sentry initializes on backend startup
- **WHEN** the Elysia application starts
- **THEN** Sentry SDK initializes with the correct DSN and environment

#### Scenario: Backend errors are captured with request context
- **WHEN** an unhandled error occurs in a GraphQL resolver or REST endpoint
- **THEN** Sentry captures the error with request ID, user ID, IP, and GraphQL operation context

#### Scenario: Performance monitoring tracks request duration
- **WHEN** a request is processed by the backend
- **THEN** Sentry records the transaction duration and spans for database queries, external calls, and business logic

### Requirement: Environment-specific configuration
The system SHALL support separate Sentry projects/environments for development, staging, and production with appropriate sampling rates and alert rules.

#### Scenario: Development environment uses development Sentry project
- **WHEN** `NODE_ENV=development` and Sentry DSN is configured
- **THEN** events are sent to the development Sentry project with 100% sampling

#### Scenario: Production environment uses production Sentry project
- **WHEN** `NODE_ENV=production` and Sentry DSN is configured
- **THEN** events are sent to the production Sentry project with configured sampling rate

### Requirement: Alert routing and notification rules
The system SHALL define Sentry alert rules for critical error rates, performance degradation, and new issue detection.

#### Scenario: Critical error rate alert fires
- **WHEN** error rate exceeds 5% over 5 minutes in production
- **THEN** an alert is sent to the configured notification channels (email, Slack, etc.)

#### Scenario: Performance regression alert fires
- **WHEN** p95 transaction duration increases by 50% compared to baseline
- **THEN** an alert is sent to the configured notification channels

### Requirement: Sensitive data filtering
The system SHALL filter sensitive data (auth tokens, PII, credentials) from Sentry events before transmission.

#### Scenario: Authorization headers are scrubbed
- **WHEN** a request with Authorization header is captured
- **THEN** the header value is replaced with `[Filtered]` in Sentry

#### Scenario: Database credentials are not captured
- **WHEN** a database error occurs with connection string in stack trace
- **THEN** credentials are redacted from the event payload