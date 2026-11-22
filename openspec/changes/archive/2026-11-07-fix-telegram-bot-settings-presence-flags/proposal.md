# Proposal

## Why

Settings & IAM → Telegram Webhook fails to load: the page's
`telegramBotSettings` query is rejected with `VALIDATION_FAILED` —
`Cannot query field "botTokenSet" on type "TelegramBotSettings"`. The
`add-telegram-bot` change shipped a three-way mismatch: the domain view
(`TelegramBotSettingsView`), the frontend query/mutation/types, and the tests
all agree on eight fields including the two presence flags (`botTokenSet`,
`aiApiKeySet`) that sit beside the masked secrets — but the GraphQL SDL type
declares only six, so the API rejects every read and write of the bot
configuration before it executes. The bot's only website configuration surface
(enabling the bot, the AI endpoint and default model, push alerts) is unusable,
even though the bot itself runs from environment configuration.

## What Changes

- Add `botTokenSet: Boolean!` and `aiApiKeySet: Boolean!` to the
  `TelegramBotSettings` GraphQL type, matching the domain view the resolver
  already returns verbatim and the frontend contract that already requests
  them. No resolver or frontend change is needed — this is the missing half of
  the contract, additive to the type.
- Extend the SDL contract test (`backend/src/graphql/schema.test.ts`) with a
  full field-list assertion for `TelegramBotSettings`, so the schema cannot
  drift away from the client silently again. The contract test checks operation
  names today but not type fields, which is exactly how this mismatch reached
  the main branch.
- Document `type TelegramBotSettings` in `API_CONTACT_SPECIFICATION.md` §6.4
  Types. The type was never documented — only its operations were — so the
  specification a client reads does not describe the type it calls.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `core/telegram-bot`: the "Configure the bot from environment and website"
  requirement already mandates that secrets are only ever surfaced masked and
  never leak through GraphQL responses. It now also requires that the GraphQL
  type carrying the settings exposes the presence flags (`botTokenSet`,
  `aiApiKeySet`) beside the masked values, so a client can distinguish "no
  secret configured" from "secret configured" without the server revealing
  anything.

## Impact

- `backend/src/graphql/schema.ts` — the SDL `TelegramBotSettings` type
  (additive; existing queries unaffected).
- `backend/src/graphql/schema.test.ts` — the contract test, one new assertion.
- `API_CONTACT_SPECIFICATION.md` §6.4 — the type documentation.
- No schema migration, no resolver change, no frontend change, no behavior
  change for any other operation. The domain tests
  (`backend/src/domain/settings.test.ts`) and the frontend component test
  already assert the two flags, and the frontend query/mutation/types already
  request them — they have simply never been able to execute.
- Coordination note: the working tree carries uncommitted WIP that touches
  `backend/src/graphql/schema.ts` and `backend/src/domain/settings.ts`, so the
  implementation must isolate this change's hunk from the WIP when committing
  (the established reconstruct-on-HEAD dance).
