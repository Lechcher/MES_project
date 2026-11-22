# Spec Delta

## MODIFIED Requirements

### Requirement: Consistent migration set

The system SHALL apply its PostgreSQL schema through a versioned migration set whose journal and files agree: every journal entry names an existing migration file, every migration file is named by exactly one journal entry, entry tags are unique, and journal timestamps strictly increase in entry order. Applying the set to a database that has already applied it SHALL execute no statement and SHALL NOT fail.

#### Scenario: Fresh database receives the whole set
- **WHEN** migrations are applied to a database with no recorded migrations
- **THEN** every journal entry's statements execute in journal order and each applied migration is recorded in the migrations table

#### Scenario: Re-applying the set is a no-op
- **WHEN** the same migration set is applied again to a database that already recorded it
- **THEN** no statement executes, no error is raised, and the resulting schema is unchanged

#### Scenario: A journal entry without its file fails fast
- **WHEN** a journal entry names a migration file that does not exist in the migrations folder
- **THEN** application fails with an actionable error before any statement of the set executes

#### Scenario: A migration file without its journal entry is detected
- **WHEN** a migration file exists in the migrations folder that no journal entry names
- **THEN** the set is inconsistent — the file is never applied — and the parity check reports it

#### Scenario: Out-of-order journal timestamps are detected
- **WHEN** a later journal entry carries a timestamp older than an earlier entry's
- **THEN** the parity check reports it, because the apply decision compares recorded timestamps against journal timestamps and a stale timestamp would replay an already-applied migration

## ADDED Requirements

### Requirement: PostgreSQL persistence engine

The system SHALL persist its records to a PostgreSQL database reached through a connection URL supplied as configuration, replacing the SQLite database file path. Record durability and the atomicity of state-changing operations SHALL be unchanged by the engine switch.

#### Scenario: Configured connection is used
- **WHEN** the service starts with a PostgreSQL connection URL
- **THEN** it applies its migration set and serves every read and write against that database

#### Scenario: Records survive restart
- **WHEN** a record is committed and the service restarts
- **THEN** the record is still available afterward

#### Scenario: Missing or malformed connection is rejected at startup
- **WHEN** the service starts without a usable connection URL
- **THEN** it exits with an actionable message naming the missing configuration before serving any request

### Requirement: Referential integrity is enforced by the database

Foreign keys, uniqueness, and value constraints SHALL be enforced by the PostgreSQL database itself rather than only by application validation, so a rejected write is a constraint violation that commits no partial record and that the application maps to its domain error.

#### Scenario: A cascading delete removes dependent records
- **WHEN** a parent record is deleted and its dependents declare a cascade
- **THEN** the dependent records are removed in the same change

#### Scenario: An invalid stored value is rejected
- **WHEN** a write carries a value outside a declared constraint
- **THEN** the database rejects the write and no partial record is committed