# core/report-exports Specification

## Purpose

Produces usable print and spreadsheet reports for the MES modules rather than mock result descriptors. Every report uses the caller's authorized scope and the format defined by the system contract.

## Requirements

### Requirement: Generate Jobs reports
The system SHALL generate a PDF assignment or acceptance slip with the task time log and comments, and SHALL export filtered task lists as XLSX or CSV.

#### Scenario: Export employee task list
- **WHEN** an `EMPLOYEE` exports tasks
- **THEN** the generated file contains only that employee's authorized task records

### Requirement: Generate Planning reports
The system SHALL generate A4 leave-request PDFs, A4 landscape attendance-calendar PDFs, and XLSX attendance and leave-balance reports.

#### Scenario: Print monthly calendar
- **WHEN** an authorized user prints an attendance calendar
- **THEN** a readable A4 landscape PDF is produced with rows and days from the requested scope

### Requirement: Generate Performance reports
The system SHALL generate A4 personal KPI reports and an XLSX workbook with the documented audit levels and performance ranking.

#### Scenario: Export department performance
- **WHEN** a `DEPT_HEAD` exports performance data
- **THEN** the workbook contains only the Head's authorized department-level employee data

### Requirement: Generate Audit Log exports
The system SHALL export the currently filtered Audit Log events as XLSX or CSV for authorized technical roles.

#### Scenario: Export filtered audit events
- **WHEN** a `TECH_LEAD` exports filtered audit events as CSV
- **THEN** the file contains exactly the matching events within the caller's authorized scope
