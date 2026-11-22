/**
 * Theme contract for the MES frontend.
 *
 * Mirrors the locale contract in `../i18n/config.ts`: a small viewer
 * preference, held in a script-readable cookie, applied in the browser by a
 * client provider. "system" is the default, so a viewer who has never chosen
 * inherits the operating system's own light/dark preference rather than an
 * application's guess.
 */

export const THEME_MODES = ["system", "light", "dark"] as const;

export type ThemeMode = (typeof THEME_MODES)[number];

/** The concrete theme a mode resolves to once the OS preference is known. */
export type ResolvedTheme = "light" | "dark";

export const DEFAULT_THEME: ThemeMode = "system";

/** Cookie carrying the viewer's theme choice across visits. */
export const THEME_COOKIE = "mes_theme";

export function isThemeMode(value: string): value is ThemeMode {
  return (THEME_MODES as readonly string[]).includes(value);
}

/**
 * Resolve a raw `mes_theme` cookie value to a supported mode.
 *
 * A missing, empty, or unrecognized value falls back to `system`, so a stale
 * or hand-edited cookie can never pin a viewer to a theme they cannot change.
 */
export function parseThemeMode(raw: string | undefined | null): ThemeMode {
  if (!raw) return DEFAULT_THEME;
  const value = raw.trim();
  return isThemeMode(value) ? value : DEFAULT_THEME;
}

/**
 * Read the theme mode from a `document.cookie`-style string.
 *
 * Pure on purpose so the fallback behavior is unit-testable without a DOM,
 * exactly as `readMesLocaleCookie` is.
 */
export function readMesThemeCookie(cookieSource: string): ThemeMode {
  for (const part of cookieSource.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== THEME_COOKIE) continue;
    return parseThemeMode(part.slice(separator + 1));
  }
  return DEFAULT_THEME;
}

/**
 * Resolve a mode to a concrete theme.
 *
 * An explicit choice wins over the operating system in both directions — a
 * pinned `light` survives a dark system and a pinned `dark` survives a light
 * one. Only `system` consults the OS preference, and an OS that reports
 * nothing resolves to light rather than to a guess.
 */
export function resolveTheme(
  mode: ThemeMode,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (mode === "light" || mode === "dark") return mode;
  return systemPrefersDark ? "dark" : "light";
}
