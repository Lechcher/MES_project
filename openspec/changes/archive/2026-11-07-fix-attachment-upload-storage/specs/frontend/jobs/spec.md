# Spec Delta

## ADDED Requirements

### Requirement: Each picked attachment reports its own outcome
The system SHALL show every file the viewer picked to attach to a completion
request with its own state — pending, uploading, stored, or failed — and SHALL
show a failed file's reported failure message on its row.

#### Scenario: A file the store refuses
- **WHEN** the viewer uploads a picked file and the storage backend refuses to
  store it
- **THEN** that file's row reports the failed state with the failure message
  naming the file, while the other rows keep their own states

#### Scenario: Successful upload
- **WHEN** the viewer uploads a picked file and it is stored
- **THEN** the file's row reports the stored state

### Requirement: A failed attachment can be retried without picking it again
The system SHALL let the viewer re-queue a file whose upload failed and retry
it without picking the file again, keeping the file's reported failure visible
until it is retried.

#### Scenario: Retry after a storage failure
- **WHEN** the viewer retries a file whose row reports the failed state
- **THEN** the same file is uploaded again, the row leaves the failed state, and
  its outcome is reported anew

### Requirement: A completion request cannot be submitted with unresolved attachments
The system SHALL refuse to submit a completion request while any picked file is
still uploading or has failed to store, and SHALL name the unresolved file in
the refusal.

#### Scenario: Submit while a file failed
- **WHEN** the viewer submits a completion request and one picked file failed to
  store
- **THEN** the submission is refused with a message naming that file, and no
  completion request is created

#### Scenario: Submit once every file is stored
- **WHEN** the viewer submits a completion request and every picked file is
  stored
- **THEN** the request is submitted with the stored files attached
