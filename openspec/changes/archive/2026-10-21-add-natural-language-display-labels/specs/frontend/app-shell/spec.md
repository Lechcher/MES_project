# frontend/app-shell Specification

## REMOVED Requirements

### Requirement: Domain vocabulary rendered verbatim

**Reason:** The product owner now requires English-only display of domain enums,
which is the opposite of rendering the tokens verbatim in the UI. Token
preservation still matters — but as a data and logic contract, not a display
rule.

**Migration:** Preserve tokens as the data contract (`frontend/display-labels`
→ "Domain codes remain the data and logic contract" and "Token preservation is a
data-contract rule"); render English labels everywhere
(`frontend/display-labels` → "Domain enums render as English labels"). The
former requirement's color documentation (`REQ` White, `ACT` Yellow, …) stays
the badge color mapping under `frontend/jobs` → "Ticket rows show state badges
and lifecycle flags".
