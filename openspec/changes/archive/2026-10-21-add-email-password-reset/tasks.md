# Tasks

## 1. Dependency, configuration, and documentation

- [x] 1.1 Confirm `nodemailer`'s current version and its documented transport API (URL parsing, TLS selection, authentication), then add it to `backend/package.json`; verify `bun install --frozen-lockfile` succeeds in `backend/` and that the lockfile records the package.
- [x] 1.2 Add the mail dependency to the Stack table in `AGENTS.md`; verify the table names it alongside the existing report-generation row.
- [x] 1.3 Validate `MES_SMTP_URL` at startup — accepted scheme, present host, usable port — and report a malformed value explicitly instead of accepting any non-empty string; verify with configuration tests covering a valid Zoho URL, a valid local URL, a missing host, an unsupported scheme, and a nonsense value. Document the two phases (hosted provider now, local server later) in `backend/.env.example` and `docs/DEVELOPMENT.md`, and verify the documented examples are accepted by the validator.

## 2. Mail transport, message composition, and delivery outcomes

- [x] 2.1 Define the mail-sender port and its SMTP implementation, selecting implicit TLS, STARTTLS, or unauthenticated plain delivery from the configured URL; verify with unit tests that each of the three URL forms selects the expected security and authentication settings, using the injected fake so no socket is opened.
- [x] 2.2 Compose the reset message from the configured sender identity with a link built from the web origin and the issued token; verify a composed message's sender equals the configured identity and its link host is the web origin rather than the API origin, and that the link carries the token.
- [x] 2.3 Record every delivery attempt in the existing notification log with its outcome and, on failure, the reported reason; verify a successful send records a delivered outcome and a rejected send records a failed outcome with a non-empty reason, with no schema change required.
- [x] 2.4 Ensure the mail credential never reaches logs, recorded reasons, or API responses; verify by triggering an authentication failure against the fake transport and asserting the recorded reason and the surfaced error contain no part of the configured password.

## 3. Reset hook and honest API outcome

- [x] 3.1 Wire the send-reset hook into the auth instance through the injected port and the request-scoped outcome channel, leaving background delivery unconfigured so the hook completes before the request returns; verify a test fails if the hook is not awaited (assert the outcome is available immediately after the request call).
- [x] 3.2 Make the reset request reject when the recorded outcome is a failure, while an address with no account still returns the neutral success result and sends nothing; verify both paths with tests, including that the unknown-address path never invokes the port.
- [x] 3.3 Convert an invalid or expired reset token into a validation failure carrying a `reason` detail, instead of an internal failure; verify a consumed-once or expired token produces that validation failure with the reason present.
- [x] 3.4 Verify the pre-existing behavior is preserved: with no mail endpoint configured the reset request still fails explicitly with the unavailable-mail-sender message and no delivery is attempted (existing configuration and auth tests must remain green).

## 4. Frontend reset surface

- [x] 4.1 Add a public reset route outside the authenticated app shell, reading the token from the link and enforcing the same minimum password length the administrative reset enforces; verify an anonymous visitor is not redirected to sign-in, a password below the policy is rejected inline, and a valid token change leads to sign-in.
- [x] 4.2 Render a distinct invalid-or-expired token state with a way to request a new message, driven by the validation failure's `reason` detail rather than a generic error; verify the state appears for an invalid token and offers the retry affordance.
- [x] 4.3 Add the request affordance to the sign-in screen with a neutral confirmation and an explicit failure when delivery fails; verify the neutral text is shown on acceptance and the failure text replaces it when the request fails.
- [x] 4.4 Verify the new password is masked while entering and never written to browser storage, and that the reset route renders without a session.

## 5. Integrated verification

- [ ] 5.1 Verify the loop once by hand against the hosted provider: a reset message is delivered to the configured mailbox, its link opens the web application's reset route, the password change succeeds, and signing in with the new password works. Record what was observed, including whether the message was filed as spam.
- [x] 5.2 Verify the transport swap needs configuration only: run a local SMTP sink, point the mail URL at it with no credentials, and confirm a reset message is delivered without any code change. Record the exact local value in the developer documentation.
- [x] 5.3 Run the full backend and frontend checks — tests, type checks, Biome, and production builds — and confirm the automated suite performs no network delivery; record the successful commands and any remaining prerequisites.

## Workflow follow-up

- Archive the change after human review and approval, and verify the archived specifications.
- Reconcile the email and reset requirements with the `backend/graphql-api` capability once `implement-mes-prototype` is archived, since that capability is not yet deployed.
