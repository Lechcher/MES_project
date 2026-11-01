# Spec Delta

## MODIFIED Requirements

### Requirement: Configure the bot from environment and website
Every bot setting (enable flag, bot token, AI endpoint, default model, push
alerts) SHALL be resolvable from the backend environment and from the website,
with a documented precedence: per-user preference → website setting →
environment variable → built-in default. Secrets SHALL never appear in bot
messages, logs, or GraphQL responses unmasked. The GraphQL type that surfaces
the website settings SHALL declare every field the client contract relies on,
including the presence flags `botTokenSet` and `aiApiKeySet` that tell the
settings editor whether a secret is configured, so the API never rejects a
settings read or write for a field it does not expose.

#### Scenario: Environment bootstrap
- **WHEN** a deployment provides bot settings only through environment variables
- **THEN** the bot starts with those values without any website configuration

#### Scenario: Website overrides environment
- **WHEN** an operator saves a different value in the website's Telegram settings
- **THEN** the website value takes precedence for new sessions, and the environment value is used again when the website value is cleared

#### Scenario: Secret masking
- **WHEN** bot settings (including the AI API key and bot token) are read through any surfacing other than the settings editor
- **THEN** only the masked form is shown, and no secret is written to logs or audit records

#### Scenario: Presence flags beside the masked secrets
- **WHEN** a client reads the bot settings through the settings query or saves them through the settings mutation
- **THEN** the type carries `botTokenSet` and `aiApiKeySet` as non-null booleans beside the masked values, so the settings editor can show "not configured" without the server revealing any part of the secret

#### Scenario: Per-user model preference overrides the global default
- **WHEN** a user selects a model inside the bot
- **THEN** that model is used for their subsequent questions, without changing the default for other users
