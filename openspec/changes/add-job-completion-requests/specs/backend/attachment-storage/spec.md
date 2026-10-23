# Spec Delta

## Purpose

Lets files attached to job tickets be uploaded in bulk into the Garage S3 bucket and read back through an authenticated route, so the browser never holds storage credentials and no attachment is served without a valid session.

## ADDED Requirements

### Requirement: Bulk authenticated file upload
The system SHALL accept many files in one multipart request at a dedicated authenticated endpoint, store each accepted file in the configured bucket under `tasks/<taskId>/<uuid>-<sanitized filename>`, record an attachment row per file carrying the object key as its URL and its byte size, and return the created records. Each rejected file SHALL be reported individually so the accepted files still succeed.

#### Scenario: Upload several formats at once
- **WHEN** an authorized caller posts an image, a PDF, an XLSX and a CSV in one request
- **THEN** all four are stored in the bucket, four attachment rows are created, and the response lists all four records with their sizes

#### Scenario: One bad file does not block the rest
- **WHEN** a request carries one oversized file alongside two valid files
- **THEN** the two valid files are stored and returned, and the oversized file is reported as a failure

#### Scenario: Unauthenticated upload
- **WHEN** a request reaches the upload endpoint without a valid session token
- **THEN** the request is rejected before any file is stored

### Requirement: Reject unsafe or unusable files
The system SHALL reject a file whose extension is on the executable denylist, whose declared MIME type and extension are inconsistent, whose size exceeds the per-file limit, that is empty, or that exceeds the per-request file-count limit. Formats outside the denylist SHALL be accepted without conversion; office documents SHALL be download-only.

#### Scenario: Executable is rejected
- **WHEN** a caller uploads `payload.exe` or `run.bat`
- **THEN** the file is rejected and no attachment row is created for it

#### Scenario: MIME and extension disagree
- **WHEN** a caller uploads `photo.png` declared as `application/zip`
- **THEN** the file is rejected

#### Scenario: Empty file is rejected
- **WHEN** a caller uploads a zero-byte file
- **THEN** the file is rejected and reported as a failure

#### Scenario: Too many files in one request
- **WHEN** a single request carries more files than the per-request limit
- **THEN** the excess files are rejected and reported individually

### Requirement: Authenticated attachment download
The system SHALL serve stored attachments through an authenticated route that requires a valid session token, streams the object through the backend, sends `Content-Disposition: attachment` when `download=1` is requested, and otherwise serves the file for inline display. The route SHALL attempt to pass through a `Range` header so media can be seeked.

#### Scenario: Inline preview
- **WHEN** an authorized caller requests an image without `download=1`
- **THEN** the image is returned with a content type that lets the browser display it

#### Scenario: Forced download
- **WHEN** an authorized caller requests a spreadsheet with `download=1`
- **THEN** the response carries `Content-Disposition: attachment` for that file

#### Scenario: Download requires a session
- **WHEN** a caller requests an attachment without a valid session token
- **THEN** the request is rejected and the object is not returned

#### Scenario: Range request
- **WHEN** an authorized caller requests a byte range of a video
- **THEN** the route attempts the range against storage and serves the requested range

### Requirement: Upload limits are configuration
The per-file size limit and the per-request file count limit SHALL come from configuration with documented defaults, and the bucket, endpoint, region and credentials SHALL come from configuration rather than from hardcoded values.

#### Scenario: Configured limits apply
- **WHEN** the per-file limit is configured above a file's size
- **THEN** that file is accepted, and a file above the configured limit is rejected
