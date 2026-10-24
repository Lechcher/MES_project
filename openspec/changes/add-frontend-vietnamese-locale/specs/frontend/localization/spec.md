# Spec Delta

## Purpose

The locale contract for the frontend: which languages exist and which is the
default, how a viewer chooses and keeps a language, how complete translation
catalogues are guaranteed, locale-aware date and number formatting, and the rule
that every string the frontend authors renders in the active locale while domain
codes stay the data contract.

## ADDED Requirements

### Requirement: English and Vietnamese with English as the default
The frontend SHALL support English (`en`) and Vietnamese (`vi`), SHALL open in English when no language preference is stored, and SHALL render every string it authors — navigation, screen text, dialogs, filter options, empty states, and enum labels — in the active locale.

#### Scenario: First visit
- **WHEN** a visitor with no stored language preference opens any screen
- **THEN** the interface renders in English

#### Scenario: Vietnamese session
- **WHEN** the active locale is Vietnamese
- **THEN** navigation, screen text, dialog text, filter options, and empty states read in Vietnamese

### Requirement: A viewer chooses a language and keeps it
The frontend SHALL offer a language switcher that applies the chosen locale to the running interface without a page reload, and SHALL remember the choice so later visits in the same browser reopen in that language. Switching SHALL NOT change the URL, the route, or the screen's current state.

#### Scenario: Switch without a reload
- **WHEN** a viewer chooses Vietnamese
- **THEN** the visible interface switches to Vietnamese without a page reload

#### Scenario: Choice is remembered
- **WHEN** a viewer who chose Vietnamese opens the app again in the same browser
- **THEN** it opens in Vietnamese

#### Scenario: Screen state survives the switch
- **WHEN** the language is switched on a module screen with filters applied
- **THEN** the URL and the applied filters are unchanged and the same records remain listed

### Requirement: Every locale covers every key
Each supported locale SHALL provide a message for every catalogue key and a label for every covered domain enum, and the locales SHALL expose the same key set. An automated test SHALL fail when a locale is missing a message or a covered enum value has no label in every locale.

#### Scenario: Missing translation fails a test
- **WHEN** a message exists in one locale but not in another
- **THEN** the catalogue completeness test fails

#### Scenario: Unlabeled enum value fails a test
- **WHEN** a covered enum gains a value with no label in every locale
- **THEN** the label coverage test fails

### Requirement: Language never changes the data contract
The active locale SHALL affect displayed text only. Code tokens SHALL remain verbatim in submitted values, filters, queries, and access decisions whichever language is active.

#### Scenario: Submit in Vietnamese
- **WHEN** a Vietnamese viewer creates a ticket whose task type reads "Hằng ngày"
- **THEN** the mutation submits `DAILY`

#### Scenario: Filter in Vietnamese
- **WHEN** a Vietnamese viewer filters the ticket list by the state that reads "Đang chờ"
- **THEN** the request carries `PEN`

### Requirement: Dates and numbers follow the active locale
Dates, times, and decimal figures SHALL render using the active locale's conventions rather than one fixed format.

#### Scenario: Vietnamese date
- **WHEN** a Vietnamese viewer views a record's date
- **THEN** the date reads in the Vietnamese convention

#### Scenario: English date
- **WHEN** an English viewer views the same record's date
- **THEN** the date reads in the convention the app used before this change

#### Scenario: Decimal figure
- **WHEN** a figure with decimals is shown to a Vietnamese viewer
- **THEN** its decimal separator follows the Vietnamese convention

### Requirement: The document declares the active locale
The rendered document SHALL declare the active locale as its language.

#### Scenario: Vietnamese document language
- **WHEN** the active locale is Vietnamese
- **THEN** the document declares Vietnamese as its language

### Requirement: Text the backend generates stays English
Exported reports, email messages, and error text supplied by the API SHALL remain English in every locale. Only text the frontend itself authors follows the active locale.

#### Scenario: Exported report
- **WHEN** a Vietnamese viewer exports an XLSX or PDF report
- **THEN** the generated file's content is identical to the English viewer's

#### Scenario: API error text passes through
- **WHEN** the API supplies an error message
- **THEN** that message is displayed as returned, untranslated

#### Scenario: Frontend fallback text is localized
- **WHEN** the frontend substitutes its own error message for one the API did not supply
- **THEN** that message renders in the active locale
