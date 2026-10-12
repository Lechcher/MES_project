# Tasks

## 1. Translate DESIGN.md in place

- [x] 1.1 Replace the Spanish prose in `DESIGN.md` with English, section by section (title, Visual Theme & Atmosphere, Color Palette, Component Stylings, Typography, Layout Principles, Do's and Don'ts), keeping the Markdown structure identical (same headings in the same order, same bullets, bold markers, and inline-code formatting). Verify by checking the translated file still has all 7 section headings and every bullet of the original, in the original order.
- [x] 1.2 Apply the terminology conventions in the reference section below and keep product tokens untouched: "WattVision", `Bs.`, "Power BI Dashboard", font names (Inter, JetBrains Mono, Fira Code), and every hex color code from the original (`#121212`, `#1E1E1E`, `#00E5FF`, `#FF453A`, `#32D74B`, `#FFFFFF`, `#98989D`, `#2C2C2E`, `#30D158`, `#3A1C1C`, `#252525`). Verify by searching the translated file for each token and confirming it appears exactly as listed.

## 2. Verify the translation

- [x] 2.1 Confirm no Spanish remains in `DESIGN.md`: search the file for accented characters (`á é í ó ú ñ ¿ ¡`) and for the Spanish function words `de`, `del`, `la`, `el`, `para`, `con`, `una`, `usar`, `fondo`, `borde`, `texto`, `filas`, `alertas`, `siempre`, `gráficos`, `tarjetas` (whole-word match) and find zero matches. Verification passes when all searches return no hits.
- [x] 2.2 Confirm all technical values are identical to the committed original: run `git diff DESIGN.md` and check that every changed line differs only in prose wording — never in hex codes, pixel values, font names, grid column counts, spacing multiples, or the section structure. Verification passes when the diff shows wording-only changes.
- [x] 2.3 Confirm the change touches nothing else: run `git status --porcelain` and verify `DESIGN.md` is the only modified tracked file (the change's own files under `openspec/changes/translate-design-doc-to-english/` may appear as new/untracked).

## Terminology Conventions (reference — untracked)

Decisions already made for this translation; do not re-litigate during apply:

- Title heading: `# DESIGN.md - Sistema de Monitoreo Eléctrico "WattVision"` → `# DESIGN.md - "WattVision" Electrical Monitoring System`.
- The original uses Spanish terms with English glosses; in the English version the glosses become the main terms: "Tarjetas (Cards)" → "Cards", "Gráficos (Charts)" → "Charts", "Títulos" → "Titles", "Cuerpo" → "Body".
- "picos de consumo" → "consumption spikes".
- "alertas de 'vampiro'" → "'vampire power' alerts" (standby-power drain).
- "estado 'En vivo'" → "'Live' state".
- "iconos de 'foco'" → "'lightbulb' icons" ("foco" is Bolivian Spanish for lightbulb; the Don't warns against generic lightbulb icons in favor of lightning-bolt, plug, or meter icons).
- "Bolivianos (`Bs.`)" → "bolivianos (`Bs.`)" — anglicized lowercase currency name; the `Bs.` symbol stays exactly as the UI displays it.
- "Incluir la equivalencia en Bolivianos (`Bs.`) siempre junto al kWh" → "Include the bolivianos (`Bs.`) equivalence always alongside kWh".
- Product name "WattVision", the "Power BI Dashboard" reference, all font names, and all technical values remain unchanged.
