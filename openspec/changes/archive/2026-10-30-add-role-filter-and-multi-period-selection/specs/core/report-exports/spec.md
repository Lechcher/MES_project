# Spec Delta

## MODIFIED Requirements

### Requirement: Generate Performance reports
The system SHALL generate A4 personal KPI reports and an XLSX workbook with the documented audit levels and performance ranking, and both SHALL cover every month of the period the request selects.

#### Scenario: Export department performance
- **WHEN** a `DEPT_HEAD` exports performance data
- **THEN** the workbook contains only the Head's authorized department-level employee data

#### Scenario: Export several months
- **WHEN** an authorized viewer exports the audit workbook for three selected months
- **THEN** the workbook's audit tables and performance ranking cover all three months

#### Scenario: Print several months
- **WHEN** a viewer prints their personal KPI report for three selected months
- **THEN** the PDF reports the totals, the counters, and the score events of all three months
