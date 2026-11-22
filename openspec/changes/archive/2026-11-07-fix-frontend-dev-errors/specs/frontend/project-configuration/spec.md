# Spec Delta

## Purpose

Defines where the frontend application declares its project root, so the
development server and the production build resolve the application's own
modules and trace output from the application directory instead of guessing from
the surrounding repository layout.

## ADDED Requirements

### Requirement: Declared project root for the frontend application

The frontend application SHALL declare its project root explicitly as the
application directory. Module resolution, file watching, and output tracing
SHALL run from that directory rather than from a directory inferred by walking
up the repository, and the development server and the production build SHALL
report no ambiguity about the inferred workspace root.

#### Scenario: Development server starts without an inferred-root warning

- **WHEN** the development server starts from the application directory
- **THEN** it reports that the application is ready and reports no warning that
  it inferred the workspace root or detected multiple lockfiles

#### Scenario: Production build and server report no inferred-root warning

- **WHEN** the application is built and then started
- **THEN** neither step reports a warning that it inferred the workspace root or
  detected multiple lockfiles

#### Scenario: The application resolves its own modules

- **WHEN** the application builds and serves any screen after the project root is
  declared
- **THEN** every module the application imports resolves and the screens render
  as they did before the root was declared

#### Scenario: The declared root is the application directory

- **WHEN** the declared project root is inspected
- **THEN** it is the directory that contains the application's own package
  manifest and configuration, not the enclosing repository directory
