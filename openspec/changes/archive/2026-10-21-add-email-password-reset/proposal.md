# Proposal

## Why

A user who forgets their password cannot recover their account. The configuration exists and looks complete — `MES_SMTP_URL` and `MES_RESET_EMAIL_FROM` are parsed, and the API returns an explicit "no mail sender configured" failure while the first is empty — but nothing ever connects to an SMTP server, so setting it only swaps one failure for another. The deployment already has working Zoho SMTP credentials, so the immediate goal is a real, testable mail path; the next step after that is a local SMTP server, which must be a configuration change rather than a code change.

## What Changes

- Add a **real email transport**, configured by the existing single `MES_SMTP_URL` value, supporting all three modes that the phases require: implicit TLS (`smtps://…:465` — Zoho now), STARTTLS (`smtp://…:587`), and plain unauthenticated SMTP (`smtp://localhost:1025` — the local server later). The later swap is an environment edit only.
- Expose the transport as an **injectable port**, so automated tests never open a socket or send real mail, matching the injected-port pattern already used in the Settings domain.
- Implement Better Auth's `sendResetPassword` hook: compose the reset message and build the link from `MES_WEB_ORIGIN`, because the URL Better Auth generates points at the **backend** origin, where no reset page exists.
- **Record every delivery attempt and its outcome**, and report a transport failure to the caller instead of returning success. Today a failed send is logged and swallowed, so the API reports success while no mail was sent.
- Preserve the neutral response for an address that does not exist, so account existence is never disclosed — a transport failure is reported, a non-existent recipient is not.
- Add the self-service reset surface: request a reset email from sign-in, and a public reset page that consumes the token, applies a minimum password policy, and reports invalid or expired tokens clearly.
- Keep the existing explicit failure when `MES_SMTP_URL` is unset, and keep the mail sender scoped to password reset.
- **Out of scope:** email for anything other than password reset (workflow events stay on the Telegram notification engine); changing the reset-token lifetime; retry queues or delivery scheduling; replacing the single-URL configuration shape with discrete variables.

## Capabilities

### New Capabilities

- `core/email-delivery`: the outbound email mechanism — a configuration-selected SMTP transport covering implicit TLS, STARTTLS and plain unauthenticated modes; reset-message composition and link construction against the web origin; and a recorded, reported delivery outcome that never represents an unsent message as a success.
- `frontend/password-reset`: the self-service reset surface — requesting a reset email from sign-in, and a public reset page that consumes a token, enforces the password policy, and distinguishes a valid token from an invalid or expired one.

### Modified Capabilities

None.

The reset **API** behavior would naturally extend the `backend/graphql-api` capability, but that capability is not deployed: it exists only as an unarchived delta in `implement-mes-prototype`, and `openspec/specs/` still holds only the six `frontend/*` capabilities. Adding a MODIFIED delta against an undeployed capability would make archiving order-dependent and would compare against a spec that does not exist. This change therefore owns the email and reset behavior in the two new capabilities above, and the overlap should be reconciled when `implement-mes-prototype` is archived.

## Impact

- **Code**: the backend auth module (the `sendResetPassword` hook and the honest-outcome path), configuration validation, a new mail module, and the auth resolvers; the frontend sign-in page and a new public reset route. The authenticated GraphQL proxy already forwards the public `resetPassword` mutation without a session, so no proxy change is expected.
- **Dependencies**: one new package, `nodemailer` (registry reports `10.1.7`). Its current version and official usage must be confirmed before installing, and a row added to the Stack table in `AGENTS.md`.
- **Configuration**: `MES_SMTP_URL` becomes functional and `MES_RESET_EMAIL_FROM` starts being consumed by a sender. Zoho requires an app-specific password and IMAP/SMTP access enabled on the mailbox, and the From address must match the authenticated account. The real credential stays in `backend/.env` (gitignored); `.env.example` keeps placeholders only.
- **Security**: a live credential enters configuration. The transport URL embeds a password, so it must never be logged, returned in an API response, or copied into a committed file. A failed delivery must not leak account existence.
- **Testing**: the automated suite must not depend on Zoho — a real inbox is slow, rate-limited, and non-deterministic. Zoho is verified manually; tests use the injected fake port.
- **Docs**: `docs/DEVELOPMENT.md` gains the SMTP configuration for both phases, including the local-server value.
