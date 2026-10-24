# frontend/realtime-updates Specification

## Purpose

Keeps open screens in sync with the backend: an authenticated live change channel plus per-event refresh, so displayed data reflects committed backend changes without a manual reload.

## Requirements

### Requirement: Authenticated live change channel
The system SHALL expose a live streaming endpoint that delivers backend change events to signed-in users. The browser SHALL reach it through a same-origin handler, so the session token never reaches client script. A request without a valid session SHALL be refused.

#### Scenario: Signed-in viewer receives stream events
- **WHEN** a signed-in user has a module view open and data changes on the backend
- **THEN** a change event arrives on that viewer's open live connection

#### Scenario: Unauthenticated connection refused
- **WHEN** a client opens the live channel without a valid session
- **THEN** the connection is refused with an unauthorized response and no events are delivered

### Requirement: Mutations publish change events
Every successful data mutation through the versioned GraphQL contract SHALL publish a change event naming the affected area to open connections. A failed or rolled-back mutation SHALL NOT publish an event.

#### Scenario: Approval is announced
- **WHEN** an approver approves a `PEN` ticket or a leave request
- **THEN** a change event naming the affected area is published to open connections

#### Scenario: Failed mutation stays silent
- **WHEN** a mutation fails
- **THEN** no change event is published

### Requirement: Events are area-level invalidation signals
Each change event SHALL name the affected domain area (tickets, leave, performance, users/settings, audit) and SHALL NOT carry record-level payloads; current data is read through the versioned GraphQL contract under normal authorization, so live refresh never widens what a role may see.

#### Scenario: Event names an area only
- **WHEN** a ticket is created
- **THEN** the event names the tickets area without exposing the ticket's contents

#### Scenario: Authorization is unchanged by live refresh
- **WHEN** a viewer whose role may not see another department's tickets refetches after a tickets event
- **THEN** only records the viewer's role is permitted to see are returned

### Requirement: Open views refresh in place
The frontend SHALL refetch the queries behind the viewer's open module views when an event for their area arrives, replacing the displayed content in place without a manual reload, without full-page navigation, and without losing unrelated view state such as filters, day context, or scroll position.

#### Scenario: Another user's approval appears without reload
- **WHEN** one viewer approves a ticket while another viewer has the ticket list open on the same data
- **THEN** the second viewer's list shows the new state without a manual reload

#### Scenario: Filter and scroll survive a live refetch
- **WHEN** an event triggers a refetch of a filtered, scrolled list
- **THEN** the viewer's active filters and scroll position are preserved after the new content renders

### Requirement: Connection lifecycle and catch-up
The frontend SHALL maintain a single live connection per browser tab, re-establish it automatically after a drop, and — because events missed while disconnected cannot be replayed — refetch the open views' queries when the connection is re-established.

#### Scenario: Reconnect after network drop
- **WHEN** the network drops and returns while a viewer is signed in
- **THEN** the frontend re-establishes the connection and refreshes the open views' queries

#### Scenario: One connection per tab
- **WHEN** a signed-in viewer uses two browser tabs
- **THEN** each tab holds its own live connection and no tab opens duplicates

### Requirement: Live status is visible and manual refresh always works
The viewer SHALL be able to tell whether the live channel is connected. While the channel is disconnected, the app SHALL keep serving the last-known data, SHALL show a disconnected status, and SHALL keep manual refresh available as a fallback.

#### Scenario: Disconnected status shown
- **WHEN** the live channel cannot be established or drops
- **THEN** a disconnected status is shown while the last-known data stays readable and the viewer can still refresh manually

### Requirement: Live updates complement Partial Prerendering
Static shell content SHALL continue to render instantly; live updates SHALL apply inside dynamic content areas, SHALL NOT make the shell dynamic, and SHALL NOT delay first paint.

#### Scenario: Shell stays instant with live updates on
- **WHEN** a viewer cold-navigates to a module view with the live channel enabled
- **THEN** the static shell renders immediately and live updates continue applying to the dynamic content afterwards
