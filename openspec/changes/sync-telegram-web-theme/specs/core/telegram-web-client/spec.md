# Spec Delta

## ADDED Requirements

### Requirement: Follow the MES light/dark theme
The embedded Telegram Web client SHALL render in the MES resolved theme — light or
dark, including the theme the viewer's `system` mode resolves to. The theme SHALL be
applied before the client's first paint, and every later MES theme change SHALL be
applied to the open client without remounting it. The override is presentation only:
it SHALL NOT change the viewer's own Telegram account theme settings.

#### Scenario: First paint already matches MES
- **WHEN** a viewer whose MES theme is dark opens the Telegram module
- **THEN** the embedded client's first paint is its dark theme, with no light flash before it

#### Scenario: System-mode viewers match too
- **WHEN** a viewer on the `system` mode with a dark operating system opens the Telegram module
- **THEN** the embedded client renders in its dark theme

#### Scenario: Theme change applies in place
- **WHEN** a viewer switches the MES theme from light to dark while the Telegram module is open
- **THEN** the embedded client switches to its dark theme in place — the frame is not reloaded, the account stays connected, and the viewer's position in the client is kept

#### Scenario: The viewer's Telegram account settings stay untouched
- **WHEN** the embedded client renders under the MES theme override
- **THEN** the viewer's own Telegram account theme preference is not modified, so the account's theme elsewhere (another device or the official clients) is unchanged

#### Scenario: No override outside MES
- **WHEN** the embedded client's URL carries no MES theme
- **THEN** the client applies its own default theme choice, exactly as the unmodified build would