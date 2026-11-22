# Spec Delta

## Purpose

Keeps the evidence attached to a ticket durable and reachable: files a viewer
may attach to a ticket are stored in object storage, reported back per file,
and streamed to viewers on demand — whatever storage implementation backs it.

## ADDED Requirements

### Requirement: Upload requires a ticket the viewer may read
The system SHALL reject an attachment upload whose ticket does not exist or
which the viewer may not read, before any file byte is written.

#### Scenario: Upload to an unknown ticket
- **WHEN** a caller posts files with a ticket id that does not exist
- **THEN** the upload is refused with a not-available error and no file is
  stored

#### Scenario: Upload to a ticket outside the viewer's scope
- **WHEN** a viewer whose data scope excludes a ticket posts files for it
- **THEN** the upload is refused and no file is stored

### Requirement: Each file is validated before the store is touched
The system SHALL validate every file against the upload rules — non-empty, at
or below the configured size ceiling, a permitted format, and a declared type
consistent with its format — and SHALL reject only the offending file.

#### Scenario: One rejected file does not cost the others
- **WHEN** a request carries one valid file and one file over the size ceiling
- **THEN** the valid file is stored and the oversized file is reported as a
  rejected failure in the same response

#### Scenario: No files in the request
- **WHEN** a caller posts an upload request with no files
- **THEN** the request is refused with a validation error

### Requirement: Every stored file is reported with its outcome
The system SHALL report each uploaded file with its identifier, storage key,
file name, content type, and byte size, and SHALL report each rejected or
unstorable file with a stable failure code and a message naming the file.

#### Scenario: Mixed outcomes in one request
- **WHEN** a request carries two valid files and one file in a blocked format
- **THEN** the response reports the two stored records and one failure carrying
  the blocked-format code

### Requirement: A store failure is diagnosable and retryable
The system SHALL report a file the store refuses as a failure carrying a stable
storage-failure code, SHALL record the store's underlying error outside the
user-facing response so an operator can act on it, and SHALL leave the request's
other files unaffected.

#### Scenario: Store refuses a write
- **WHEN** the store rejects or cannot complete the write of one file in a
  request that also carries a valid file
- **THEN** the refused file is reported with the storage-failure code, the
  other file is stored, and the store's error is recorded for operators with
  no credential exposed

#### Scenario: Storage is not configured
- **WHEN** no object storage is configured for the deployment
- **THEN** uploads are refused with a message that names the storage settings
  to configure rather than reporting a per-file storage failure

### Requirement: Attachments stream back to authorized viewers
The system SHALL serve a stored attachment inline to a viewer entitled to the
ticket it belongs to, SHALL offer a forced-download form, and SHALL answer a
missing object with not-found.

#### Scenario: Preview an image inline
- **WHEN** an authorized viewer opens a stored attachment's URL
- **THEN** the object streams with its recorded content type for inline display

#### Scenario: Force a download
- **WHEN** an authorized viewer opens the same URL with the download flag
- **THEN** the object streams with a content disposition that downloads it

#### Scenario: Object is gone
- **WHEN** a viewer opens a URL whose object no longer exists in storage
- **THEN** the request is answered not-found rather than streaming empty bytes

### Requirement: Attachment URLs are reachable from the browser
The system SHALL expose stored attachments at URLs a browser can request,
including keys whose names themselves contain path separators, so every
attachment is reachable from the screen that lists it.

#### Scenario: A key whose name contains slashes
- **WHEN** a viewer requests the attachment URL for a stored object whose key
  contains slashes (`tasks/<taskId>/<key>`)
- **THEN** the request reaches the attachment service and streams the object

#### Scenario: Attachment listed on a ticket
- **WHEN** a ticket's attachments are listed to a viewer
- **THEN** the URLs the list renders each resolve to the object they name
