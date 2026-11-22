"use client";

/**
 * Client theme provider.
 *
 * Holds the viewer's mode choice, defaulting to `system` so the first client
 * render assumes the light baseline the server tree also renders. The
 * document element's class is written by a blocking inline script in
 * `layout.tsx` before hydration, so a dark viewer never paints a light frame;
 * this provider picks that up on mount, keeps the class in step with a later
 * change, and persists the choice in the `mes_theme` cookie.
 *
 * It is deliberately the locale provider's shape with one difference: the
 * locale only re-renders the same content, so it could afford to adopt its
 * cookie after hydration. A wrong theme is a visible flash, which is why the
 * class is set before React mounts and only adopted here.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  DEFAULT_THEME,
  readMesThemeCookie,
  resolveTheme,
  THEME_COOKIE,
  type ThemeMode,
} from "./config";

/** The viewer's operating-system preference, queried through matchMedia. */
const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

/** Read the OS preference in a browser, or fall back to the light baseline. */
function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(SYSTEM_DARK_QUERY).matches;
}

interface ThemeChoice {
  /** The viewer's stored mode; `system` means "follow the operating system". */
  mode: ThemeMode;
  /** The mode resolved to a concrete theme against the current OS setting. */
  theme: "light" | "dark";
  /** Choose a mode now and remember it for later visits. */
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeChoice | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_THEME);
  // The OS preference is state so a live change re-renders the tree.
  const [systemDark, setSystemDark] = useState(false);

  // Adopt the stored choice once, after hydration.
  useEffect(() => {
    const stored = readMesThemeCookie(document.cookie);
    setModeState((current) => (stored === current ? current : stored));
  }, []);

  useEffect(() => {
    setSystemDark(systemPrefersDark());
  }, []);

  // A `system` viewer tracks the OS preference while the app is open. A viewer
  // who pinned a mode has said what they want, so the event is ignored for
  // them — which is why the listener is registered unconditionally and the
  // short-circuit happens inside it.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(SYSTEM_DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) =>
      setSystemDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const theme = resolveTheme(mode, systemDark);

  // Keep the document element's class in step with the resolved theme. Always
  // an explicit class: an unclassed <html> would leave the unprefixed light
  // tokens and any system-dark rule both matching, so a pinned light would go
  // dark by accident.
  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
  }, [theme]);

  const setTheme = useCallback((next: ThemeMode) => {
    setModeState(next);
    // The design pins a plain, script-readable cookie (path=/, SameSite=Lax,
    // one year) rather than the Cookie Store API, matching the locale cookie
    // so one preference pattern covers both.
    // biome-ignore lint/suspicious/noDocumentCookie: deliberate cookie write per the theme design
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const value = { mode, theme, setTheme };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/** The viewer's theme choice, for the theme selector. */
export function useThemeChoice(): ThemeChoice {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useThemeChoice must be used within ThemeProvider");
  }
  return value;
}
