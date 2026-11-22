# Spec Delta

## ADDED Requirements

### Requirement: Disconnects end the stream without reporting an error
The live channel SHALL treat a stream ending on either side as normal lifecycle, not as a failure: an upstream disconnection mid-connection SHALL end the viewer's stream cleanly, and a viewer going away SHALL release the upstream connection. Neither event SHALL surface as an unhandled error to the operator.

#### Scenario: Upstream stream dies mid-connection
- **WHEN** the backend's event stream closes while a viewer's live connection is open
- **THEN** the proxy ends the viewer's stream without reporting an unhandled error, and the viewer's browser reconnects under the existing connection-lifecycle contract

#### Scenario: Viewer goes away
- **WHEN** the viewer closes the tab or navigates away from the app
- **THEN** the proxy tears down the upstream connection instead of leaving it open

#### Scenario: Failed establishment is still an error answer
- **WHEN** the connection cannot be established at all (the backend is unreachable or refuses the session)
- **THEN** the failure is still answered with an error response, not a stream that ends silently

### Requirement: Keep-alive frames hold the connection open through idle gaps
The live channel SHALL send keep-alive frames while no change event occurs, often enough that no hop on the connection's path closes it for idleness. Keep-alive frames SHALL carry no event semantics: they are invisible to the viewer and trigger no refetch.

#### Scenario: Connection survives a change-free period
- **WHEN** no change event is published for longer than any hop on the path tolerates before closing an idle connection
- **THEN** the connection stays open on keep-alive frames alone and no reconnect is needed

#### Scenario: Keep-alive frames are invisible
- **WHEN** a keep-alive frame arrives at a viewer with open views
- **THEN** no refetch is triggered and no visible change occurs
