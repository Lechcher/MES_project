# Spec Delta

## ADDED Requirements

### Requirement: Consistent migration set
The system SHALL apply its SQLite schema through a versioned migration set whose journal and files agree: every journal entry names an existing migration file, every migration file is named by exactly one journal entry, entry tags are unique, and journal timestamps strictly increase in entry order. Applying the set to a database that has already applied it SHALL execute no statement and SHALL NOT fail.

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
