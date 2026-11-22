# Design

## Context

The SDL in `backend/src/graphql/schema.ts` is the sole API contract; the
`telegramBotSettings` resolver returns the domain view
(`TelegramBotSettingsView` in `backend/src/domain/settings.ts`) verbatim, so
GraphQL.js resolves whichever fields the SDL declares straight off the view
object. The view carries eight fields — `isEnabled`, `botToken` (masked),
`botTokenSet`, `aiBaseUrl`, `aiApiKey` (masked), `aiApiKeySet`,
`aiDefaultModel`, `pushAlertsEnabled` — and the frontend contract
(`frontend/src/lib/mes/queries/types.ts`, both operations in
`frontend/src/lib/mes/queries/settings.ts`) requests all eight. The SDL type
declares six. Both domain tests
(`backend/src/domain/settings.test.ts` asserts the flags are `false`/`true`
and that audit payloads carry them) and the frontend component test
(`frontend/src/components/settings/telegram-bot.test.ts` composes settings
with both flags) already treat the flags as existing — they have simply never
been able to execute over the wire.

The contract test (`backend/src/graphql/schema.test.ts`) asserts that every
documented operation name is present and that the operation counts match the
documentation, plus a handful of exact per-type field lists (for example
`PersonalKpiDashboard`). Nothing covers the bot settings type, which is how
the SDL lost two fields without any test noticing. `API_CONTACT_SPECIFICATION.md`
§6.4 documents `type TelegramWebhookConfig` under Types but never documented
`TelegramBotSettings` (nor the other bot types) — its operations are documented,
its type is not.

The working tree carries uncommitted WIP touching
`backend/src/graphql/schema.ts` and `backend/src/domain/settings.ts`, so the
implementation hunk will need the repo's established reconstruct-on-HEAD dance
at commit time.

## Goals / Non-Goals

**Goals:**
- Make `telegramBotSettings` / `saveTelegramBotSettings` execute against the
  shipped SDL: every field the frontend requests is declared.
- Make SDL↔client drift fail the backend contract test, so a future
  under-declared type cannot ship silently again.
- Leave the specification honest: the type the API serves is the type the
  contract document describes.

**Non-Goals:**
- Documenting the other undocumented bot types (`TelegramLink`,
  `TelegramLinkCode`, `TelegramAiModel`) — a doc-completeness concern of the
  earlier change; out of scope for this fix.
- A cross-package guard that validates every frontend GraphQL document against
  the SDL at CI time. It would catch this class more broadly but is machinery
  the repo does not have; the per-type field assertion closes this specific
  hole inside the existing test file.
- Changing the masking behavior, the resolver, the frontend, or the domain
  view — they already agree.

## Decisions

1. **Add the two fields to the SDL rather than drop them from the client.**
   The presence flags are load-bearing by design: the domain comment documents
   them as the "does this secret exist" signal, the audit payloads carry them
   as presence flags, and the frontend typed contract declares
   `botTokenSet: boolean` / `aiApiKeySet: boolean`. Removing them from the
   query would shrink the contract and leave the editor unable to express
   "not configured" without prompting the client to compare masked strings.
2. **Declare both as `Boolean!`.** The domain view computes them with
   `Boolean(row.botToken)` / `Boolean(row.aiApiKey)`, so they are always
   concrete booleans; nullable would force every client to handle a third
   "unknown" state that can never occur.
3. **No resolver change.** `telegramBotSettings` returns
   `getTelegramBotSettings(ctx)` directly and GraphQL.js reads the declared
   fields by property name; `botTokenSet`/`aiApiKeySet` are properties of the
   returned view, so declaring them is sufficient.
4. **Guard with an exact field-list assertion in the contract test,** mirroring
   the existing `PersonalKpiDashboard` pattern (`expect(fields.sort()).toEqual([...])`
   for the `TelegramBotSettings` type). An exact list fails if either side
   drifts — a field added to the client without the SDL, or removed from the
   SDL with the client still querying it — and keeps both halves of the
   contract in one place instead of a checklist someone has to remember.
5. **Document `type TelegramBotSettings` in §6.4 Types** next to
   `TelegramWebhookConfig`, listing the full eight fields exactly as the SDL
   declares them, with a one-line note that the masked secrets come with
   boolean presence flags.

## Risks / Trade-offs

- **WIP entanglement at commit time.** `schema.ts` and `domain/settings.ts`
  are dirty in the working tree. The implementation task isolates this
  change's hunks (reconstruct on the HEAD base, stage, restore WIP) and
  verifies the staged diff carries no WIP markers — the established dance,
  restated in the tasks.
- **The other bot types stay undocumented.** A client writing
  `telegramLinks` end-to-end still has no type reference. Acceptable for this
  fix's scope; recorded as a proposal note.
- **An exact-list assertion is stricter than presence-only.** That is the
  point — the two fields must exist, and nothing may exist that the client
  contract does not describe. Any intentional field change updates the test
  in the same commit.
