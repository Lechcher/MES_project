# Spec Delta

## Purpose

Defines how the repository declares its Biome configuration so that linting and
formatting work from the repository root and from each package, with one
authoritative root configuration and any package-specific settings layered on
top of it rather than competing with it.

## ADDED Requirements

### Requirement: A single root Biome configuration

The repository SHALL declare exactly one root Biome configuration, so that
running the linter from the repository root completes without reporting a
conflicting or nested root configuration.

#### Scenario: Root lint runs without a configuration error

- **WHEN** the linter is run from the repository root
- **THEN** it processes the repository's files and reports no error that a nested
  root configuration was found

#### Scenario: The root configuration is a single declared root

- **WHEN** the repository's Biome configuration is inspected
- **THEN** exactly one configuration file declares itself the root, and every
  other configuration in the repository is layered on top of it

#### Scenario: The root configuration lints its own file

- **WHEN** the linter runs over the root configuration file itself
- **THEN** that file satisfies the linter's own formatting rules

### Requirement: Both packages can be linted and formatted

Each of the two application packages SHALL expose a command that lints its own
sources, and a command that formats them, so that a developer can check either
package without leaving that package's directory.

#### Scenario: Backend gains lint and format commands

- **WHEN** the backend package's available scripts are inspected
- **THEN** it offers a command that lints its sources and a command that formats
  them, matching the names the frontend package already uses

#### Scenario: Linting one package does not depend on the other

- **WHEN** either package's lint command is run from that package's directory
- **THEN** it checks that package's sources and reports the result without needing
  to be run from the repository root

#### Scenario: The backend is governed by the shared configuration

- **WHEN** the backend's sources are linted without a backend-specific
  configuration file
- **THEN** they are checked against the repository's root configuration and the
  result matches that configuration's rules

### Requirement: Package-specific settings layer onto the root

A package MAY declare configuration that differs from the root — for example its
indentation style or its framework-specific lint domains — and that
configuration SHALL be layered on the root so the root's settings still apply
where the package does not override them.

#### Scenario: The frontend keeps its own formatting style

- **WHEN** the frontend's sources are linted
- **THEN** they are checked against the frontend's declared formatting style
  rather than the root's, because the frontend's sources are written in it

#### Scenario: Overriding does not discard the root's settings

- **WHEN** a package's linter configuration overrides a setting the root also
  declares
- **THEN** the root's other settings still apply to that package's sources

#### Scenario: Package settings target the current schema

- **WHEN** any Biome configuration in the repository is inspected
- **THEN** it targets the schema of the installed linter version and uses that
  version's configuration syntax, not a deprecated form

### Requirement: Generated and vendor output is excluded

Linting SHALL ignore generated build output and installed dependencies, so that
a repository-wide lint neither reports findings from files the repository does
not author nor fails on them.

#### Scenario: Build output and dependencies are ignored

- **WHEN** the linter runs over the whole repository
- **THEN** it reports no findings from build output or installed dependencies

#### Scenario: Generated artifacts do not fail a repository-wide lint

- **WHEN** a repository-wide lint runs while generated artifacts are present
- **THEN** the run's pass or fail status is decided by authored sources, not by
  those artifacts

### Requirement: Each package lints clean

Linting either package SHALL exit successfully for authored sources, so that a
green lint is a meaningful signal rather than a mixture of real findings and
known noise.

#### Scenario: Both packages report a successful lint

- **WHEN** each package's lint command is run in turn
- **THEN** both exit successfully, reporting no errors

#### Scenario: Pre-existing warnings remain visible

- **WHEN** a package's lint runs
- **THEN** any warnings it reports are still reported; only errors cause a
  non-zero exit

#### Scenario: A formatting defect is repaired before the lint is green

- **WHEN** the linter finds a formatting defect in an authored source file
- **THEN** that file is reformatted to satisfy the linter, and the package's
  lint then exits successfully
