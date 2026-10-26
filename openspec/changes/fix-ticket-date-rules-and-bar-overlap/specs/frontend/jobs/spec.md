# Spec Delta

## ADDED Requirements

### Requirement: Ticket categories constrain the date shape

The category a ticket is created with SHALL decide the shape of its dates, on
every surface that creates or edits a ticket. A create or edit form SHALL refuse
to save an interval that does not fit the chosen category, or an end that is not
after its start. Every ticket SHALL be saved with both a start and an end,
whatever its category.

#### Scenario: A daily ticket covers exactly one day
- **WHEN** a `TECH_LEAD` creates a `DAILY` ticket
- **THEN** the ticket is saved with a start and an end on that one day

#### Scenario: An hourly ticket stays inside one day
- **WHEN** a `TECH_LEAD` creates an `HOURLY` ticket
- **THEN** the ticket is saved with a start hour and an end hour inside that single day, and the form offers no end hour that falls on the next day

#### Scenario: Only a multi-day ticket may span days
- **WHEN** a `TECH_LEAD` creates a `MULTI_DAY` ticket from 20/10 to 31/10
- **THEN** the ticket is saved so that it covers every day from 20/10 through 31/10 inclusive, and no day in that span is lost to a stored timezone offset

#### Scenario: An invalid interval is refused
- **WHEN** the chosen end is not after the start, or the interval does not fit the chosen category
- **THEN** the form refuses to save and reports that the end must come after the start

#### Scenario: Every category carries a start
- **WHEN** any ticket is created, regardless of category
- **THEN** the saved ticket has a start date as well as an end date, so it can be placed on the schedule

## MODIFIED Requirements

### Requirement: Task type rules and Auto-forking

The create form SHALL set a deadline and a start by task type: `HOURLY` uses the
slots 10:30, 14:00, 16:30 as its start hour with the end hour one hour later on
the same day; `DAILY` defaults to 17:00/18:00 the same day, with the start at
the beginning of that day; `MULTI_DAY` takes a start day and an end day. The
Auto-forking option SHALL replicate the ticket to the selected department's
active members.

#### Scenario: Hourly task
- **WHEN** a `TECH_LEAD` creates an hourly task with the 14:00 slot
- **THEN** the ticket is created in `REQ` with its start at 14:00 and its deadline at 15:00 the same day

#### Scenario: Daily task
- **WHEN** a `TECH_LEAD` creates a `DAILY` ticket
- **THEN** the ticket is created in `REQ` with a start on that day and its deadline at the chosen slot on that same day

#### Scenario: Auto-forking
- **WHEN** Auto-forking is enabled while creating a ticket for a department with 3 active members
- **THEN** a `REQ` ticket is created for each of the 3 members
