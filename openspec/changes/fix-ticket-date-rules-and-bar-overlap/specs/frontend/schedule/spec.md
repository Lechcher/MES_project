# Spec Delta

## Purpose

The Planning Schedule's grid must place every ticket bar so that employees and
planners can read who is working on what and when: bars that share a period
stack instead of colliding, a bar's width always matches its ticket's real
interval, and no ticket that is due inside the visible window is ever left off
the grid.

## ADDED Requirements

### Requirement: Overlapping tickets stack into lanes

Bars in one employee row SHALL be packed into lanes so that no two bars ever
occupy the same grid row: a lane is reused only once the bar before it has
finished. The row SHALL grow to hold every lane it needs, and the employee cell
SHALL report how many bars the row holds when it holds more than one.

#### Scenario: Two tickets share a day
- **WHEN** an employee holds a multi-day ticket covering Monday–Wednesday and a second ticket covering Tuesday–Sunday
- **THEN** the second ticket is drawn in a different lane from the first, and the two bars do not overlap

#### Scenario: A row with several overlapping tickets
- **WHEN** an employee holds six tickets, three of which overlap each other
- **THEN** the row is tall enough to hold every lane, each bar sits fully inside its own lane, and the employee cell reports the bar count

#### Scenario: Single-ticket rows are unchanged
- **WHEN** an employee holds one ticket, or none
- **THEN** the row keeps its normal single-lane height and the employee cell shows no count

### Requirement: A bar's width follows its category

A bar SHALL span exactly the columns its ticket covers, clipped to the visible
window: a `DAILY` ticket one day, a `HOURLY` ticket its own hours on the Day
scale and one day on the other scales, and a `MULTI_DAY` ticket its inclusive
start day through end day. No bar SHALL be wider than the interval it stands
for, and no bar SHALL be stretched past the end it was given.

#### Scenario: Daily ticket is one column wide
- **WHEN** a `DAILY` ticket is viewed on the Week scale
- **THEN** its bar covers exactly one day column

#### Scenario: Multi-day ticket covers every day it spans
- **WHEN** a `MULTI_DAY` ticket due 31/10 is viewed on the Week scale for 19/10–25/10
- **THEN** its bar spans every visible day from its start day onward and is marked as continuing after the window

#### Scenario: Hourly ticket keeps its hours on the Day scale
- **WHEN** an `HOURLY` ticket from 10:30 to 11:30 is viewed on the Day scale
- **THEN** its bar covers the hour columns between 10:30 and 11:30 and no others

### Requirement: No ticket due inside the window is left off the grid

Every ticket whose interval touches the visible window SHALL draw a bar, on
every scale and for a custom range. A ticket whose stored dates do not fit its
category — a `DAILY` or `HOURLY` ticket stored with a multi-day span — SHALL be
clamped to the single day it covers rather than dropped, so the schedule never
silently hides work.

#### Scenario: A daily ticket stored with a long span
- **WHEN** a `DAILY` ticket stored from 27/07 to 24/10 is viewed on the Week scale for 19/10–25/10
- **THEN** one bar is drawn on 24/10, the day the ticket is due, instead of no bar at all

#### Scenario: The guarantee holds on every scale
- **WHEN** the same department's tickets are viewed on the Day, Week, Month, and Year scales and on a custom range
- **THEN** every ticket whose interval touches the window draws a bar, and no two bars in a row overlap

### Requirement: Vertical drags count lanes, not pixels

Dropping a bar SHALL land on the row that owns the lane it was dropped onto,
because rows have different heights once they hold different numbers of lanes. A
vertical drop of one lane SHALL move the bar one lane, and a horizontal drop
SHALL move it by whole columns of the active scale.

#### Scenario: Dropping onto a taller row
- **WHEN** a writer drags a bar down across a row that holds three lanes and drops it
- **THEN** the ticket is reassigned to the employee of the row that owns the lane under the pointer

#### Scenario: A horizontal drop of two days
- **WHEN** a writer drags a bar two columns to the right on the Week scale
- **THEN** the ticket's dates move by two days and the bar is re-placed in its new column without overlapping the bars already there
