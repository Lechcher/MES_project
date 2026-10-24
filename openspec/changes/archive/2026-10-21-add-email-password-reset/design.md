# Design

## Context

See `proposal.md` — Why for motivation. Current state that shapes the approach:

- `MES_SMTP_URL` and `MES_RESET_EMAIL_FROM` are parsed in `backend/src/config.ts`, but the only consumer is a presence check in `backend/src/auth/index.ts` (`requestPasswordReset`). No mail library is installed and no mail dependency is present transitively, so the transport does not exist at all.
- `createAuth` configures `emailAndPassword` and the bearer plugin but **no `sendResetPassword` hook**. Better Auth's request endpoint rejects such a request with `RESET_PASSWORD_DISABLED` (`node_modules/better-auth/dist/api/routes/password.mjs:51`), so today the flow fails even when the endpoint is configured.
- Better Auth generates the reset link as `${baseURL}/reset-password/${token}` (`password.mjs:81`), where `baseURL` is the API origin (`BETTER_AUTH_URL`) — not the web origin where a reset page would live. No frontend `/reset-password` route exists.
- The hook is invoked through `runInBackgroundOrAwait` (`create-context.mjs:215`), which **swallows** a rejection and only logs it. With no `advanced.backgroundTasks.handler` configured the promise is awaited, so the hook does complete before the endpoint returns — but a failure never reaches the caller, and the endpoint still responds with the neutral success message.
- Token mechanics (`password.mjs:71-86`): a 24-character token is generated and stored as `createVerificationValue({ value: user.id, identifier: 'reset-password:<token>', expiresAt })`, expiring after 3600 seconds by default. The hook receives `{ user, url, token }`, so it can build its own link. The consume endpoint looks the value up by that same identifier.
- The frontend `/api/mes/graphql` proxy attaches `Authorization` only when a session cookie is present, so a public mutation already works without a session.
- `domain/settings.ts` already takes injected ports (`CreateCredentialAccount`, `SetUserPassword`) so it stays testable without touching real infrastructure.

## Goals / Non-Goals

**Goals:**

- Make the reset loop work end to end against real Zoho SMTP, and keep the later move to a local SMTP server a configuration-only change.
- Never present an undelivered message as a success, and never disclose whether an address has an account.
- Keep the automated test suite off the network.

**Non-Goals:**

- Generalizing email into a second notification channel for workflow events (those stay on the Telegram engine).
- Retry queues, delivery scheduling, bounce handling, or read receipts.
- Changing the reset-token lifetime, or the single-URL configuration shape.
- Rate limiting the public reset request (see Open Questions).

## Decisions

1. **Keep one URL, and let the URL select the transport mode.** `nodemailer.createTransport(url)` already interprets the three modes the two phases need, so no configuration redesign is required:

   | `MES_SMTP_URL` | Mode | Phase |
   | --- | --- | --- |
   | `smtps://user:pass@smtp.zoho.com:465` | Implicit TLS | Zoho now |
   | `smtp://user:pass@smtp.zoho.com:587` | STARTTLS | Zoho alternative |
   | `smtp://localhost:1025` | Plain, no auth | Local server later |

   Alternatives considered: discrete `MES_SMTP_HOST/PORT/USER/PASSWORD` variables (more validation surface and more churn for no functional gain, since a URL already expresses every supported combination), and hand-rolling the client on `node:tls` (fits the "prefer the standard library" guidance, but puts EHLO, STARTTLS upgrade, `AUTH LOGIN`/`PLAIN`, and dot-stuffing on us across three modes, and Zoho is strict about the handshake — the failure mode of getting it subtly wrong is precisely the silent one this change exists to remove).

2. **Make the transport an injected port.** A `MailSender` port (`send(message): Promise<void>`) is passed to `createAuth`, with a nodemailer implementation in the application and an in-memory recording fake in tests. This mirrors the ports already used in the Settings domain and keeps Zoho out of the automated suite. It is also what makes phase 2 free: no code path learns which provider is in use.

3. **Compose the reset link ourselves, against the web origin.** The hook receives the token, so the message links to `${MES_WEB_ORIGIN}/reset-password?token=<token>` rather than Better Auth's API-origin URL. A trusted-origin `redirectTo` is still passed to the request call because the endpoint runs an origin check against it. The library's `url` argument is ignored for the link.

4. **Carry the delivery outcome back to the caller with request-scoped storage.** Better Auth awaits the hook but discards its rejection, so the hook cannot signal a failure by throwing. Instead:

   - the hook performs the send and **records the attempt durably** in the existing `notifications` table (`channel: 'EMAIL'`, `template: 'PASSWORD_RESET'`, `recipient`, `status: 'SENT' | 'FAILED'`, `errorMessage`, `sent_at`) — no schema change is needed;
   - it also writes the outcome into an `AsyncLocalStorage` store established by the wrapper;
   - the wrapper reads the store after the call returns and rejects the operation when the outcome was a failure.

   Alternatives considered: generating the verification token ourselves and sending directly (full control and honest by construction, but couples us to Better Auth's `reset-password:<token>` identifier and `value = user.id` convention, and duplicates its expiry handling); correlating by `(recipient, timestamp)` against the notification log (works, but is looser than a request-scoped channel); and relying on the recorded row alone (we do not know the generated token, so we cannot look the row up by it).

   This decision depends on the hook staying on the awaited path, so `advanced.backgroundTasks.handler` is deliberately left unconfigured. A test asserts that a failing send surfaces as a failure, which fails loudly if that ever changes.

5. **Distinguish "not sent on purpose" from "failed to send".** When the address has no account, Better Auth returns the neutral response *without invoking the hook* (`password.mjs:64-70`, a timing-attack mitigation). So an absent outcome means "no send was attempted" and must stay a neutral success; only a recorded `FAILED` outcome becomes an error. Reporting an unknown address as a failure would turn the endpoint into an account-existence oracle.

6. **Map an invalid or expired reset token to `VALIDATION_FAILED` with a reason.** The contract's error catalog is fixed and has no token-specific code, and an invalid token is an input problem. The wrapper converts Better Auth's rejected reset call into `VALIDATION_FAILED` carrying `details.reason = "INVALID_TOKEN"`, so the reset page can render a distinct message and a retry affordance without inventing a code outside the catalog.

7. **Validate the mail URL at startup.** Any non-empty string currently passes. Configuration should fail fast on a malformed endpoint (bad scheme, missing host, unusable port) with the same style of explicit message the rest of the configuration uses, so a typo in a credential string is caught at boot rather than at the first forgot-password request.

8. **Reuse the notification log for email attempts.** The table's documented purpose is the outbound notification log, and its columns (`channel`, `template`, `recipient`, `status`, `attempts`, `error_message`, `sent_at`) already fit an email attempt. Reusing it avoids a migration and gives the audit trail for free; the alternative was a new `email_deliveries` table for a distinction the current behavior does not need.

## Risks / Trade-offs

- [A swallowed failure could still be reported as success if the hook moves off the awaited path] → Leave `backgroundTasks.handler` unconfigured, and assert the failure path in a test so a behavioral change in the dependency fails loudly rather than silently.
- [The credential travels inside a URL and is easy to leak] → Never log the URL, never return it, and keep `errorMessage` to the server's own rejection text. `.env.example` carries placeholders only; the real value stays in the gitignored `backend/.env`.
- [Sending real mail from the test suite is slow and rate-limited] → Tests use the fake port exclusively; Zoho is a manual verification step.
- [Zoho rejects the send despite correct-looking configuration] → Requires an app-specific password and IMAP/SMTP access enabled on the mailbox, and the From address must match the authenticated account. First self-addressed messages commonly land in Spam, so a missing message is not proof of a broken transport — check the Zoho sent folder before concluding.
- [Public reset requests can be abused to spam an inbox] → Not addressed here (see Open Questions); the endpoint already returns a neutral response, so it is not an enumeration oracle.
- [A local mail server in phase 2 accepts mail silently] → Correct for that phase: the honest-outcome requirement is about transport failures, and a local server that accepts the message legitimately records `SENT`.

## Migration Plan

1. Add the dependency, confirm its current version and official usage first, and record it in the Stack table.
2. Add the mail module and the port; wire it into `createAuth` behind the existing configuration, with no schema change.
3. Implement the hook, the link, the recorded outcome, and the honest-failure path; then the reset page and the sign-in affordance.
4. Verify locally with the fake port and the automated suite, then verify once against Zoho by hand (message arrives, link opens, password changes, sign-in works with the new password).
5. **Rollback is trivial and data-safe**: there is no schema change and no data migration. Unsetting `MES_SMTP_URL` returns the flow to an explicit, honest failure; reverting the release restores the previous behavior. Document the local-server value in `docs/DEVELOPMENT.md` so phase 2 needs no code change.

## Open Questions

None that block the specified behavior. Two deferred items, both out of the current scope and safe to decide later: whether the public reset request should be rate limited (the contract defines `RATE_LIMITED` but requires no limit), and whether email should later become a general notification channel alongside Telegram.
