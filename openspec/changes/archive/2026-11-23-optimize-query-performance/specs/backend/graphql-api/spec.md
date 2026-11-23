# Spec Delta

## MODIFIED Requirements

### Requirement: List pagination and filtering
The system SHALL return list results as `nodes` and `pageInfo` connections with offset, limit, total count, and next-page state, SHALL apply supplied filter fields together, and SHALL bound every list read: a default page size applies when no limit is supplied and a maximum page size caps any client-requested limit rather than returning an unbounded row set.

#### Scenario: Paginate a task list
- **WHEN** a paginated list query runs with an offset and limit
- **THEN** the response carries the requested page of `nodes`, the total count, and the next-page state

#### Scenario: Unbounded limit is capped
- **WHEN** a list query requests no limit, or a limit above the maximum
- **THEN** the read uses the default or the maximum page size rather than returning every matching row in one response

## ADDED Requirements

### Requirement: Bounded and batched query execution
The system SHALL resolve an object's nested relation collections with a bounded number of queries per response rather than one query per parent row, and SHALL NOT re-query data already loaded for the same request. A list page that includes nested collections SHALL issue a query count that stays proportional to the number of relations on the page, not to the product of rows and relations.

#### Scenario: A task page loads its collections once per relation
- **WHEN** a paginated task list is read with its progress logs, state transitions, requests, completion journey and attachments
- **THEN** each relation is loaded for the whole page in a bounded batch (for example one `IN (…)` query per relation) instead of one query per task, so the query count does not multiply by the page size

#### Scenario: Redundant selects are removed
- **WHEN** a task's derived badges are read
- **THEN** the resolver reuses the task row and request data already loaded for the request rather than issuing a fresh task select and a fresh request select

#### Scenario: Performance reads stay cheap
- **WHEN** a personal KPI dashboard or monthly summary set is read for the selected months
- **THEN** the read does not recompute or re-query the same derived rows more than once per request, and repeated derivations reuse the per-request cache
