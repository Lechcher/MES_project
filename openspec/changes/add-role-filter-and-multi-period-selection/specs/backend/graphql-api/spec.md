# Spec Delta

## ADDED Requirements

### Requirement: Performance period selection inputs
The Performance operations SHALL take a period selection expressed as a list of months rather than a single month, and the audit levels' filter SHALL name the months it selects. The personal dashboard SHALL report the selected months, the total for each of them, and one aggregate over them.

#### Scenario: Audit filter names several months
- **WHEN** an authorized client queries an audit level with a filter naming three months
- **THEN** the response carries the authorized rows of those three months

#### Scenario: Audit filter names one month
- **WHEN** an authorized client queries an audit level with a filter naming a single month
- **THEN** the response carries that month's authorized rows

#### Scenario: Personal dashboard reports the selected period
- **WHEN** a client requests the personal dashboard for three months
- **THEN** the response reports the three selected months, each month's total KPI score, and one aggregate over them

#### Scenario: Aggregate totals sum the selected months
- **WHEN** the personal dashboard aggregates several months
- **THEN** its total KPI score and its task, on-time, overdue, returned, extension, unapproved-leave, and perfect-attendance counters are the sums of the months that reported a summary

#### Scenario: Aggregate rate averages the reporting months
- **WHEN** the personal dashboard aggregates several months and only some of them report an attendance rate
- **THEN** the reported attendance rate is the mean of the months that reported one

#### Scenario: Empty selection is rejected
- **WHEN** a client requests a Performance operation with an empty month list
- **THEN** the operation fails with a validation error and returns no data
