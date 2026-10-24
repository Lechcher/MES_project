# Spec Delta

## MODIFIED Requirements

### Requirement: Planning print/export entry points
The app SHALL offer Print (a generated A4 leave request with signature placeholder and A4 landscape monthly attendance calendar) and Export (a generated `.xlsx` attendance summary and remaining-leave-fund table). Outputs SHALL be limited to the viewer's authorized scope (`DEPT_HEAD` department-only; `EMPLOYEE` own request only).

#### Scenario: Export attendance
- **WHEN** a reviewer presses Export on the attendance summary
- **THEN** a generated `.xlsx` file contains the scoped attendance and remaining-leave-fund data

#### Scenario: Employee prints leave request
- **WHEN** an `EMPLOYEE` prints a leave request
- **THEN** an A4 PDF is generated for that employee's own request
