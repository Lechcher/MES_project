# core/kpi-scoring Specification

## Purpose

Calculates auditable performance results from the fixed MES scoring rules. Every score can be traced to recorded task, attendance, leave, and extension events.

## Requirements

### Requirement: Apply documented KPI point rules
The system SHALL award `+10` for an on-time approved task, `+20` for an on-time urgent task, `+5` for immediate approval without edits, and `+50` for excellent monthly attendance; it SHALL deduct `-15` for overdue, `-5` for returned, `-2` for an extension request, and `-10` for each late, early-leave, or `UAL`/`USL` occurrence.

#### Scenario: Award on-time urgent points
- **WHEN** an urgent task is approved on time
- **THEN** the assignee receives the documented `+20` KPI event

#### Scenario: Deduct for returned work
- **WHEN** a task report is returned
- **THEN** the assignee receives a `-5` KPI event

#### Scenario: Deduct for unapproved absence
- **WHEN** `UAL` or `USL` is assigned to an attendance record
- **THEN** the affected user receives a `-10` KPI event for that occurrence

### Requirement: Keep KPI summaries reproducible
The system SHALL derive monthly user and department scores from the recorded score events and documented rules, so identical source events produce identical totals and audit-table values.

#### Scenario: Recompute a monthly score
- **WHEN** the same user's events are queried for the same month
- **THEN** the personal dashboard and authorized audit tables report the same total score

#### Scenario: Record an action-linked score event
- **WHEN** an action triggers a KPI rule
- **THEN** the resulting score event identifies its rule, point value, affected user, period, and related source event
