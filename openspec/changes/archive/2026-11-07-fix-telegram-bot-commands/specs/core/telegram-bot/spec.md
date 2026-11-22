# Spec Delta

## ADDED Requirements

### Requirement: Keep the bot alive across restart conflicts

The bot SHALL keep polling when Telegram's single-instance rule rejects a
start: a conflicting start SHALL be retried with a bounded backoff, and the
bot SHALL only report failure when retries cannot make progress. A dead bot
that answers nothing SHALL NOT be a silently accepted outcome.

#### Scenario: Conflicting start is retried

- **WHEN** the bot's first long-polling request is rejected because another instance still holds the update window
- **THEN** the bot retries with a short backoff instead of giving up, and begins answering commands once the window frees

#### Scenario: Persistent failure is reported

- **WHEN** every retry of a conflicting start is rejected
- **THEN** the bot logs the failure and stops without disrupting the rest of the service, and the reason remains discoverable in the server logs

### Requirement: Present a dashboard of the viewer's own context

The bot SHALL show a dashboard after a successful login and whenever the
viewer asks for it. The dashboard SHALL contain the viewer's identity summary,
the commands the viewer's roles unlock, and personal counts (their open
tickets and their newest notifications). Every element SHALL be scoped exactly
to the linked viewer.

#### Scenario: Dashboard after login

- **WHEN** a viewer links with a code or signs in with credentials
- **THEN** the bot shows the dashboard — identity summary, available commands, personal counts — instead of a bare confirmation line

#### Scenario: Dashboard on demand

- **WHEN** a linked viewer asks for the dashboard
- **THEN** the bot re-renders the same summary without requiring another authentication

#### Scenario: The command menu follows the viewer's roles

- **WHEN** a viewer whose roles cannot create tickets opens the dashboard
- **THEN** the dashboard offers only the commands those roles unlock

#### Scenario: The counts are the viewer's own

- **WHEN** the dashboard renders counts
- **THEN** every count reflects only what the viewer is authorized to see, never another user's data

### Requirement: Report the linked account on request

The bot SHALL let a linked viewer see which MES account the chat is signed in
as. The summary SHALL report the viewer's name, user code, email, department,
roles, and link information. It SHALL contain no secrets and no other user's
data.

#### Scenario: Profile summary

- **WHEN** a linked viewer asks for their account information
- **THEN** the bot reports the linked account's name, user code, email, department, and roles

#### Scenario: Profile is viewer-scoped

- **WHEN** any viewer requests their account information
- **THEN** the response contains only that viewer's own information

### Requirement: Confirm the sign-out when ending the session

Ending the bot session SHALL revoke the link and reply with a confirmation
that states the outcome: which account was signed out, that the chat can no
longer reach the system, and how to sign back in.

#### Scenario: Logout confirms the outcome

- **WHEN** a linked viewer ends the bot session
- **THEN** the bot revokes the link and confirms the sign-out, naming the account that was signed out and how to sign back in

#### Scenario: Logout when not signed in

- **WHEN** a chat with no active link ends the bot session
- **THEN** the bot states that the chat is not signed in and changes nothing

### Requirement: Welcome the user when /ask is invoked without a question

Invoking the assistant command with no question SHALL reply with a welcome
message: what the assistant can answer, that it is read-only, and an example
question. It SHALL NOT answer a question that was not asked, and it SHALL NOT
spend the viewer's AI budget.

#### Scenario: Bare /ask welcomes

- **WHEN** a linked viewer invokes /ask with no question
- **THEN** the bot replies with the welcome message (scope, read-only nature, an example question) and runs no agent call

### Requirement: Show the signed-in commands on /help

A linked viewer's /help SHALL list the signed-in surface — the commands their
roles unlock — instead of the login instructions. An unlinked chat's /help
SHALL keep showing the login instructions.

#### Scenario: Help after login

- **WHEN** a linked viewer sends /help
- **THEN** the bot lists the signed-in commands available to that viewer

#### Scenario: Help before login

- **WHEN** an unlinked chat sends /help
- **THEN** the bot replies with the login instructions
