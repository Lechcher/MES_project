# Spec Delta

## ADDED Requirements

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
