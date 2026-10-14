# Proposal

## Why

`SYSTEM_PROCESS_FLOW-vi.md` is the canonical process-flow reference for the MES prototype: it defines the Odoo-like modular app architecture, the shared ticket and leave state codes, the two-layer RBAC rendering model, the four custom apps, and the future expansion plan. It is currently written entirely in Vietnamese, which keeps this system-level guidance out of reach for English-speaking contributors and agents that need it as working context. An empty English placeholder, `SYSTEM_PROCESS_FLOW-en.md`, already exists at the repo root, so today the English path is a dead end that promises an English flow document and delivers nothing.

## What Changes

- Translate the full content of `SYSTEM_PROCESS_FLOW-vi.md` (262 lines) from Vietnamese to English and write the result into `SYSTEM_PROCESS_FLOW-en.md`, which currently exists but is empty.
- Preserve the document structure exactly: heading levels and order, the ASCII "CORE BASE MODULE" architecture diagram, the state-transition math blocks (LaTeX), every Markdown table, emoji section markers, and all bold/italic/inline-code formatting. Do not add, remove, reorder, or merge sections.
- Preserve every coded token and identifier verbatim. Ticket state codes and badges (`REQ`, `ACT`, `PEN`, `APP`, `REJ`, `CAN`, `OVERDUE`, and the `ACT - ...` badges); leave codes (`AL`, `UAL`, `SL`, `USL`, `PL`, `ML`, `CL`, `EL`, `LWP`, `TOIL`, `VTO`); app names (`Jobs`, `Planning`, `Performance`, `Settings`, and the parenthetical aliases); and sample identifiers (`NV001`, `B-SX`, `AL Balance`, `TOIL Balance`).
- Keep all numeric values, KPI point values, percentage thresholds, deadline times, and table example data identical to the source.
- Leave `SYSTEM_PROCESS_FLOW-vi.md` unchanged; this is an additive translation, not an in-place replacement.
- Translate faithfully rather than "improve": reproduce any source formatting quirks (for example the multi-line `ACT` row in the ticket state table) as they are instead of repairing them.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a pure documentation change with no spec-level system behavior change, so `.openspec.yaml` declares `skip_specs: true`.

## Impact

- **Files:** Adds English content to `SYSTEM_PROCESS_FLOW-en.md` (repo root). `SYSTEM_PROCESS_FLOW-vi.md` is left byte-for-byte unchanged. No other source file is touched.
- **Consumers:** No code, config, or build file references either `SYSTEM_PROCESS_FLOW-vi.md` or `SYSTEM_PROCESS_FLOW-en.md` by path (verified by repository-wide search), so filling in the English file breaks nothing. The document is consumed by humans and coding agents as system/process guidance.
- **Out of scope:** Translating any other project documents (`DESIGN.md`, `SYSTEM_ARCHITECTURE.md`, `API_CONTACT_SPECIFICATION.md`, `AGENTS*.md`, READMEs), editing the Vietnamese source, and changing any of the behaviors, codes, or values the document describes.
