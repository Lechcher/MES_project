# core/audit-notifications Specification

## Purpose

Provides traceability for system changes and delivers configured Telegram notifications for documented workflow events. Audit records remain append-only and notification outcomes are observable.

## Requirements

### Requirement: Append-only system audit events
The system SHALL record administrative and state-changing actions with the actor, action, resource, field changes, timestamp, IP address, and module when available, and SHALL expose no operation that edits or deletes an event.

#### Scenario: Audit a user update
- **WHEN** an authorized administrator changes a user's department
- **THEN** the system records the actor, resource, changed values, timestamp, IP address, and `settings` module

#### Scenario: Preserve an audit event
- **WHEN** a user queries or exports an audit event
- **THEN** the event remains unchanged and no edit or delete action is available

### Requirement: Deliver configured Telegram notifications
The system SHALL use the saved Telegram bot, alert group, webhook URL, and enabled state to send notifications for documented task-state and approval events, and SHALL record each delivery outcome.

#### Scenario: Notify an approval
- **WHEN** a task report is approved and Telegram notifications are enabled
- **THEN** a notification is sent using the configured destination and its outcome is recorded

#### Scenario: Keep delivery failure visible
- **WHEN** a Telegram delivery fails
- **THEN** the failed outcome is recorded and is not represented as a successful delivery
