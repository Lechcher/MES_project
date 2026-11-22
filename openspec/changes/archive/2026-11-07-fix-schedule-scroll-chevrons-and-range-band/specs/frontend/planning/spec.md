# Spec Delta

## ADDED Requirements

### Requirement: Schedule grid fits the viewport and scrolls horizontally
The schedule grid SHALL fit within the available viewport width rather than
stretching the page, and SHALL scroll its time axis horizontally inside the
grid so every time column and ticket bar is reachable. The page itself SHALL
NOT scroll horizontally because of the schedule.

#### Scenario: Timeline wider than the viewport
- **WHEN** the schedule's time columns exceed the viewport width (for example the DAY scale's 24 hour columns in a narrow window)
- **THEN** the grid body scrolls horizontally so every column and ticket bar can be brought into view, and the page's own horizontal scroll does not extend beyond the viewport

#### Scenario: Employee column stays pinned while the timeline scrolls
- **WHEN** the grid body is scrolled horizontally
- **THEN** the employee column stays fixed at the left edge of the grid and remains readable, and the column headers stay aligned with the rows

#### Scenario: Timeline narrower than the viewport
- **WHEN** the schedule's time columns fit within the available width (for example the MONTH scale's five day columns)
- **THEN** the grid renders at the available width without an unnecessary horizontal scroll area

### Requirement: Ticket bar continuation chevrons stand clear of bar content
A ticket bar's continues-before and continues-after chevrons SHALL render at
the bar's edges with spacing that keeps them clear of the bar's content — the
category icon, task code, and trailing labels — so a continuation hint never
overlaps the ticket text. The chevrons SHALL stay visible and edge-anchored at
every bar width.

#### Scenario: Chevron does not overlap the ticket's content
- **WHEN** a bar whose ticket starts before the visible range (or ends after it) renders its continuation chevron
- **THEN** the chevron's box does not intersect the bar's content boxes and a visible gap separates the chevron from the nearest icon or label

#### Scenario: Chevron stays readable on a narrow bar
- **WHEN** a bar is too narrow to show its text labels
- **THEN** its continuation chevron still renders at the bar's edge without being clipped by the bar's content

### Requirement: Calendar range band is visible in every theme
In the date-range calendar, the days between the selected from and to dates
SHALL render on a band surface that is visibly distinct from the calendar's
background in every active theme, the band SHALL read as continuous between
the two endpoint days, and the endpoint days SHALL keep reading as the
selected bounds.

#### Scenario: In-between days show a band in the dark theme
- **WHEN** a range spanning several days is shown and the app renders in the dark theme
- **THEN** the days between the from and to dates show a band whose color differs from the calendar's background, continuous from the start day to the end day

#### Scenario: In-between days show a band in the light theme
- **WHEN** the same range is shown and the app renders in the light theme
- **THEN** the in-between days show a band distinct from the calendar's background, preserving the light theme's existing appearance
