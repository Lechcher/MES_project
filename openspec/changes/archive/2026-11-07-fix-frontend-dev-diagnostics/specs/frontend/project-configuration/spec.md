# Spec Delta

## Purpose

Defines where the frontend application declares its project root, and which
origins may request its development server, so the development experience runs
without framework diagnostics caused by the surrounding repository layout.

## ADDED Requirements

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
