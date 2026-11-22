/**
 * Theme rules tests.
 *
 * Covers the two behaviours a viewer depends on: an explicit choice survives
 * whatever the operating system says, and `system` inherits it — including
 * when a browser reports no preference at all. A stale or hand-edited cookie
 * must never pin a viewer to a theme.
 */

import { describe, expect, test } from "bun:test";
import {
  DEFAULT_THEME,
  readMesThemeCookie,
  resolveTheme,
  THEME_COOKIE,
  THEME_MODES,
} from "./config";
import { DARK_CLASS, LIGHT_CLASS, prePaintThemeScript } from "./pre-paint";

describe("THEME_MODES", () => {
  test("offers exactly system, light, and dark", () => {
    expect(THEME_MODES).toEqual(["system", "light", "dark"]);
  });

  test("system is the default a first-time viewer gets", () => {
    expect(DEFAULT_THEME).toBe("system");
  });
});

describe("resolveTheme", () => {
  test("system tracks the operating system in both directions", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  test("a pinned light survives a dark operating system", () => {
    // The class on <html> must be explicit, or the unprefixed light tokens
    // and the system-dark rules both match and the pin is lost.
    expect(resolveTheme("light", true)).toBe("light");
  });

  test("a pinned dark survives a light operating system", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  test("an unreported system preference resolves to light", () => {
    // A browser that reports no preference is the light baseline, not a guess.
    expect(resolveTheme("system", false)).toBe("light");
  });

  test("every mode resolves to a concrete theme, either way", () => {
    for (const mode of THEME_MODES) {
      for (const systemPrefersDark of [true, false]) {
        const theme = resolveTheme(mode, systemPrefersDark);
        expect(["light", "dark"]).toContain(theme);
      }
    }
  });
});

describe("readMesThemeCookie", () => {
  test("adopts a stored mode", () => {
    expect(readMesThemeCookie("session=abc; mes_theme=dark")).toBe("dark");
    expect(readMesThemeCookie("mes_theme=light")).toBe("light");
    expect(readMesThemeCookie("mes_theme=system")).toBe("system");
  });

  test("falls back to system for a missing or empty value", () => {
    expect(readMesThemeCookie("")).toBe("system");
    expect(readMesThemeCookie("mes_theme=")).toBe("system");
    expect(readMesThemeCookie("session=abc; other=1")).toBe("system");
  });

  test("falls back to system for an unrecognized value", () => {
    // A hand-edited cookie cannot pin a viewer to an off-contract theme.
    expect(readMesThemeCookie("mes_theme=solarized")).toBe("system");
    expect(readMesThemeCookie("theme=DARK")).toBe("system");
  });

  test("trims surrounding whitespace", () => {
    expect(readMesThemeCookie("mes_theme= dark ")).toBe("dark");
  });

  test("ignores a cookie whose name merely contains the theme cookie", () => {
    expect(readMesThemeCookie("xmes_theme=dark")).toBe("system");
  });

  test("declares the theme cookie name once", () => {
    expect(THEME_COOKIE).toBe("mes_theme");
  });

  test("reads the theme independently of the locale cookie", () => {
    // The two preferences share a document.cookie string, not a parse rule.
    expect(readMesThemeCookie("mes_locale=vi; mes_theme=dark")).toBe("dark");
  });
});

/**
 * The pre-paint script and these functions restate one algorithm twice, by
 * necessity — the inline script runs in a browser before the bundle loads. To
 * keep the two from drifting, every input is resolved through both and the
 * results must agree. This is the only guard either side has.
 */
describe("the pre-paint script resolves like the config rules", () => {
  /** Run the raw script against a stubbed document and matchMedia. */
  function scriptClass(cookie: string, systemDark: boolean): string | null {
    const classes: string[] = [];
    const root = {
      classList: {
        remove: (...names: string[]) => {
          for (const name of names) {
            const at = classes.indexOf(name);
            if (at !== -1) classes.splice(at, 1);
          }
        },
        add: (name: string) => {
          if (!classes.includes(name)) classes.push(name);
        },
      },
    };
    const globals = {
      document: { cookie, documentElement: root },
      window: {
        matchMedia: (_query: string) => ({ matches: systemDark }),
      },
    };
    const run = new Function("window", "document", prePaintThemeScript());
    run(globals.window, globals.document);
    return classes[0] ?? null;
  }

  const COOKIES = [
    `${THEME_COOKIE}=dark`,
    `${THEME_COOKIE}=light`,
    `${THEME_COOKIE}=system`,
    `${THEME_COOKIE}=solarized`,
    `${THEME_COOKIE}=`,
    `session=abc; ${THEME_COOKIE}=dark`,
    `${THEME_COOKIE}=vi`,
    "",
  ];

  test("the script always writes an explicit class", () => {
    // An unclassed <html> leaves the unprefixed light tokens and the
    // system-dark rule both matching, which silently loses a pinned light.
    for (const cookie of COOKIES) {
      for (const systemDark of [true, false]) {
        expect([LIGHT_CLASS, DARK_CLASS]).toContain(
          scriptClass(cookie, systemDark),
        );
      }
    }
  });

  test("the script matches resolveTheme for every mode and OS preference", () => {
    for (const mode of THEME_MODES) {
      for (const systemDark of [true, false]) {
        const cookie = `${THEME_COOKIE}=${mode}`;
        const expected = resolveTheme(mode, systemDark);
        expect(scriptClass(cookie, systemDark)).toBe(expected);
      }
    }
  });

  test("the script falls back like readMesThemeCookie for an off-contract value", () => {
    for (const cookie of [
      "",
      `${THEME_COOKIE}=solarized`,
      `${THEME_COOKIE}=`,
    ]) {
      for (const systemDark of [true, false]) {
        expect(scriptClass(cookie, systemDark)).toBe(
          resolveTheme(readMesThemeCookie(cookie), systemDark),
        );
      }
    }
  });

  test("an operating system with no reported preference paints light", () => {
    // Resolved through an empty matchMedia result on the `system` path.
    const run = new Function("window", "document", prePaintThemeScript());
    const classes: string[] = [];
    const root = {
      classList: {
        remove: () => {},
        add: (name: string) => classes.push(name),
      },
    };
    run(
      { matchMedia: undefined },
      { cookie: `${THEME_COOKIE}=system`, documentElement: root },
    );
    expect(classes).toEqual([LIGHT_CLASS]);
  });

  test("the script interpolates the cookie name and mode list from config", () => {
    // Single-sourced, so a rename of the cookie or a new mode cannot leave the
    // inline script reading a value nothing writes.
    const source = prePaintThemeScript();
    expect(source).toContain(`"${THEME_COOKIE}"`);
    for (const mode of THEME_MODES) {
      expect(source).toContain(`"${mode}"`);
    }
  });

  test("the script builds no breakable construct", () => {
    // It goes through `dangerouslySetInnerHTML`, so it must not close its own
    // tag or leave an unescaped character React would need to handle.
    const source = prePaintThemeScript();
    expect(source).not.toContain("</script");
    expect(source).not.toContain("<!--");
    expect(source.includes("`")).toBe(false);
  });
});
