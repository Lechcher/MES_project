# Spec Delta

## Purpose

Keeps the project's reference documents discoverable from the agent guidelines and consistent with the behavior recorded in the OpenSpec specs.

## ADDED Requirements

### Requirement: Agent guidelines index every reference document
`AGENTS.md` SHALL link each project reference document (`AGENTS_GIT.md`, `API_CONTACT_SPECIFICATION.md`, `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql`, `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED_DIAGRAM.md`, `SYSTEM_ARCHITECTURE.md`, `SYSTEM_ARCHITECTURE_DIAGRAM.md`, `SYSTEM_PROCESS_FLOW-en.md`) with a one-line statement of what it covers.

#### Scenario: All seven documents are linked
- **WHEN** `AGENTS.md` is read
- **THEN** it contains a working relative link to each of the seven reference documents, each with a purpose line

#### Scenario: Diagram companions are identified
- **WHEN** an agent looks up a source document that has a diagram companion
- **THEN** `AGENTS.md` names the companion (`SYSTEM_ARCHITECTURE_DIAGRAM.md` for `SYSTEM_ARCHITECTURE.md`, `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED_DIAGRAM.md` for `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql`)

### Requirement: Spec changes update the matching reference documents
Agent guidelines SHALL require that a change which adds, modifies, or removes spec requirements also updates every reference document describing that behavior, within the same change, and SHALL state which spec areas map to which documents.

#### Scenario: Rule is stated in the guidelines
- **WHEN** `AGENTS.md` is read
- **THEN** it states the update rule and a mapping from spec areas (`backend/*`, `core/*`, `frontend/*`, `tooling/*`) to the documents they affect

#### Scenario: Behavior change without a doc update
- **WHEN** a change modifies a requirement whose behavior is described in a reference document
- **THEN** the change's tasks include updating that document, or the change records why the document is unaffected

### Requirement: Source documents and diagrams stay in step
When a reference document with a diagram companion changes in a way the diagram depicts, the companion SHALL be updated in the same change.

#### Scenario: Schema table added
- **WHEN** a table or column is added to `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql`
- **THEN** `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED_DIAGRAM.md` shows the same table or column

### Requirement: Reference documents reflect current specs
Reference documents SHALL NOT contradict the current main specs in `openspec/specs/`, and SHALL describe each spec'd capability that falls within their scope.

#### Scenario: Shipped capability is documented
- **WHEN** a capability exists in `openspec/specs/` (for example live updates, email delivery, password reset)
- **THEN** each reference document whose scope covers it describes it consistently with the spec
