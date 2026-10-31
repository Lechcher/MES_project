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

### Requirement: Generate Audit Log exports
The system SHALL export the currently filtered Audit Log events as XLSX or CSV for authorized technical roles.

#### Scenario: Export filtered audit events
- **WHEN** a `TECH_LEAD` exports filtered audit events as CSV
- **THEN** the file contains exactly the matching events within the caller's authorized scope

### Requirement: Deliver generated artifacts to the browser
The system SHALL hand every generated artifact (report export, print, and import template) to the authorized viewer through a URL the browser can actually open on the frontend origin. The download SHALL re-authenticate the viewer's session — the same session that authorized generation — instead of relying on credentials a browser navigation cannot send. A viewer without a valid session SHALL be rejected rather than served the file.

#### Scenario: Download a generated export
- **WHEN** an authorized viewer triggers an export or print and opens the returned URL
- **THEN** the artifact downloads (correct file name, bytes, and content type) instead of an error page

#### Scenario: Download the import template
- **WHEN** an authorized viewer downloads the task-import template
- **THEN** the template file downloads through the same working download path as every other generated artifact

#### Scenario: Unauthenticated download attempt
- **WHEN** a download URL is requested without a valid session
- **THEN** the system rejects the request and does not serve the artifact

#### Scenario: URL stays valid across restarts of the browser tab
- **WHEN** the returned URL is opened in a new tab on the same origin
- **THEN** the download succeeds without re-running the generating operation (the artifact is a previously persisted file)
