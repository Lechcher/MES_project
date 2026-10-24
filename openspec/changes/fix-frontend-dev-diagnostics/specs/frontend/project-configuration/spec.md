# Spec Delta

## Purpose

Defines where the frontend application declares its project root, and which
origins may request its development server, so the development experience runs
without framework diagnostics caused by the surrounding repository layout.

## ADDED Requirements

### Requirement: Declared project root for the frontend application

The frontend application SHALL declare its project root explicitly as the
application directory. Module resolution, file watching, and output tracing
SHALL run from that directory rather than from a directory inferred by walking
up the repository, and the development server and the production build SHALL
report no ambiguity about the inferred workspace root.

#### Scenario: Development server starts without an inferred-root warning

- **WHEN** the development server starts from the application directory
- **THEN** it reports that the server is ready and reports no warning that it
  inferred the workspace root or detected multiple lockfiles

#### Scenario: Production build and server report no inferred-root warning

- **WHEN** the application is built and then started
- **THEN** neither step reports a warning that it inferred the workspace root or
  detected multiple lockfiles

#### Scenario: The application resolves its own modules

- **WHEN** the application builds and serves any screen after the project root
  is declared
- **THEN** every module the application imports resolves and the screens render
  as they did before the root was declared

#### Scenario: The declared root is the application directory

- **WHEN** the declared project root is inspected
- **THEN** it is the directory that contains the application's own package
  manifest and configuration, not the enclosing repository directory

### Requirement: Development server accepts its own network origin

The development server SHALL accept requests for its dev-only resources from the
network address it advertises, so that hot reload and other development
resources load when the application is opened through that address rather than
through the hostname the server was started with.

#### Scenario: Dev resources load from the advertised network address

- **WHEN** a developer opens the application at the network address the
  development server advertises
- **THEN** the development server's own resources are served for that origin and
  no cross-origin block is reported for them

#### Scenario: Requests from the loopback hostname are still accepted

- **WHEN** a developer opens the application at the hostname the development
  server was started with
- **THEN** the development resources load exactly as before

#### Scenario: The allowed origins are declared in configuration

- **WHEN** the development origin configuration is inspected
- **THEN** it names the advertised network address, without a scheme and without
  a port
