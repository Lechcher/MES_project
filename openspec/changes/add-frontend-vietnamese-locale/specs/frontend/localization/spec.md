# Spec Delta

## Purpose

The frontend renders every screen in the language the viewer chose — which
locales exist, how the choice is detected and remembered, how a switch keeps the
viewer on the same screen and signed in, and how all user-facing copy and label
values follow that choice without touching the codes the data contract keeps.

## ADDED Requirements

### Requirement: Two supported languages

The frontend SHALL support exactly two languages: `en` (English, the default)
and `vi` (Vietnamese). Every screen SHALL be available in both, and no screen
SHALL present an untranslated mix of the two for the language that is active.

#### Scenario: English is the default
- **WHEN** a viewer opens the app with no stored language preference
- **THEN** the interface renders in English

#### Scenario: Vietnamese is offered
- **WHEN** a viewer chooses Vietnamese
- **THEN** every screen the viewer may access renders in Vietnamese, and every
  label, tab, button, filter, table heading, form field, message, and nav entry
  reads in Vietnamese

#### Scenario: No other language is offered
- **WHEN** the language switcher renders its choices
- **THEN** it offers English and Vietnamese only

### Requirement: Language is chosen by the viewer and remembered

The viewer SHALL be able to choose their language from the top navigation user
menu and from the sign-in page, that choice SHALL be persisted so a later visit
opens in the same language, and an authenticated viewer SHALL keep their session
when the language changes.

#### Scenario: Choice survives a new session
- **WHEN** a viewer selects Vietnamese and later reopens the app in a fresh
  browser session
- **THEN** the app opens in Vietnamese without asking again

#### Scenario: Session preserved on switch
- **WHEN** a signed-in viewer switches language
- **THEN** the viewer stays signed in and remains on the same screen after the
  switch

#### Scenario: Switch available before sign-in
- **WHEN** an unauthenticated viewer is on the sign-in page
- **THEN** the language switcher is reachable, and choosing a language renders
  the sign-in page in that language

#### Scenario: Browser language honored when nothing is stored
- **WHEN** a viewer opens the app with no stored choice and the browser requests
  Vietnamese
- **THEN** the app renders in Vietnamese

### Requirement: Every screen has an address in each language

Each route SHALL exist under a locale-specific address so a screen can be opened,
bookmarked, and shared in a chosen language, and the app SHALL keep the viewer on
the same logical screen while switching language rather than returning them to a
landing screen.

#### Scenario: Address carries the language
- **WHEN** a viewer opens the Vietnamese Jobs view
- **THEN** the address carries the Vietnamese prefix, not the English one

#### Scenario: Unknown language address
- **WHEN** a viewer opens an address with a language prefix the app does not
  support
- **THEN** the app treats it as the viewer has no such screen and resolves to
  the same screen in the default language

#### Scenario: Language switch keeps the screen
- **WHEN** a signed-in viewer switches language from any screen, including a
  ticket detail or a leave form
- **THEN** the same screen opens in the new language, preserving any unsaved
  input the viewer had entered

#### Scenario: Old English addresses keep working
- **WHEN** a viewer opens a previously saved address without a language prefix
- **THEN** the app resolves it to the same screen in the viewer's chosen
  language, or in English when none is chosen

### Requirement: The shell follows the selected language

The frame around every screen — the top navigation, the app switcher, the app
launcher's names and descriptions, the user menu, and the sign-in page — SHALL
render its text in the selected language, and the document's declared language
attribute SHALL match the locale actually being rendered.

#### Scenario: Nav and launcher translated
- **WHEN** a viewer has chosen Vietnamese
- **THEN** the top navigation links, the app launcher tiles and their
  descriptions, the user menu, and the sign-out action read in Vietnamese

#### Scenario: Document language attribute
- **WHEN** any page renders in Vietnamese
- **THEN** the page's document language attribute declares Vietnamese

#### Scenario: Auth labels preserved
- **WHEN** the nav or launcher renders in Vietnamese
- **THEN** it still lists exactly the apps the viewer's role may access and no
  others

### Requirement: Dates and numbers follow the selected language

Date, time, and number formatting SHALL follow the active language so a
Vietnamese viewer reads dates and quantities in a local convention rather than an
English one.

#### Scenario: Local date format
- **WHEN** a date renders for a Vietnamese viewer
- **THEN** it appears in Vietnamese date conventions instead of the English
  format used for the same screen in English

#### Scenario: Progress values stay numeric
- **WHEN** a percentage or progress figure renders
- **THEN** the value and its unit are localized without changing the underlying
  number

### Requirement: Translation coverage is enforced

Every user-facing string SHALL come from the translation catalogs rather than
remaining hardcoded in a component, every message key SHALL exist in both
catalogs with a translated value, and a check SHALL fail the build or test run
when a key is missing from either catalog.

#### Scenario: Missing translation fails
- **WHEN** a message key exists in the English catalog with no Vietnamese entry
- **THEN** the coverage check fails and names the missing key until it is
  translated

#### Scenario: No hardcoded UI strings
- **WHEN** the catalogs and components are checked
- **THEN** no user-facing button label, tab name, heading, empty state, or form
  label remains a hardcoded English string in the component source

#### Scenario: Unknown key is a visible defect, not English leakage
- **WHEN** a component requests a message key that no catalog defines
- **THEN** the failure is reported rather than silently rendering the English
  key name as if it were content

### Requirement: The Vietnamese text is rendered with the documented typeface

Vietnamese copy SHALL render in the project's documented font with its full
diacritics, so Vietnamese text is neither substituted nor clipped, and the
visual design's typography direction carries across both languages.

#### Scenario: Diacritics render in IBM Plex Sans
- **WHEN** Vietnamese copy renders on any screen
- **THEN** it uses the documented sans-serif typeface with the Vietnamese
  character subset loaded, and characters carrying diacritics render fully

#### Scenario: Layout holds in both languages
- **WHEN** a screen renders in Vietnamese
- **THEN** its layout, spacing, and type scale stay within the design system's
  rules, with Vietnamese text wrapping inside the same containers rather than
  overflowing them

### Requirement: Localization changes no data, code, or access behavior

Selecting a language SHALL NOT change any code, token, query, mutation, filter
input, authorization decision, or stored value. Localization is a presentation
layer only.

#### Scenario: Codes unchanged in both languages
- **WHEN** a viewer submits any form or applies any filter in Vietnamese
- **THEN** the request carries exactly the same documented codes as in English

#### Scenario: Access unchanged
- **WHEN** the active language differs between two viewers
- **THEN** both see the same set of screens, actions, and data for their roles
