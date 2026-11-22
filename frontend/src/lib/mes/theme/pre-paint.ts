/**
 * The pre-hydration theme script.
 *
 * A viewer who has stored a theme must never paint the wrong canvas first, and
 * React hydrates too late to prevent that — a flash of light is exactly the
 * failure the spec forbids. The document element's class therefore has to be
 * written by a plain browser script that runs before hydration, which cannot
 * import a module and cannot be deferred behind the JS bundle.
 *
 * The script is a raw string for that reason, and the drift that would
 * normally invite is closed from both ends: its cookie name and mode list are
 * built from `THEME_COOKIE` and `THEME_MODES`, so they are literally
 * single-sourced, and `config.test.ts`'s equivalence cases assert the script
 * resolves every input exactly as `resolveTheme`/`readMesThemeCookie` do. The
 * algorithm itself is the one thing both sides must restate, and the test is
 * what keeps them honest.
 */

import { THEME_COOKIE, THEME_MODES } from "./config";

/**
 * The document class the resolved theme is written to. Also the class
 * `globals.css`'s `@custom-variant dark (&:is(.dark *))` already matches.
 */
export const LIGHT_CLASS = "light";
export const DARK_CLASS = "dark";

/**
 * The pre-paint script body, ready for `dangerouslySetInnerHTML`.
 *
 * Every value interpolated is a compile-time constant from `./config` — no
 * user input, cookie value, or request data reaches it, so the string cannot
 * be steered into escaping this script tag.
 */
export function prePaintThemeScript(): string {
  const modes = JSON.stringify(THEME_MODES);
  const cookie = JSON.stringify(THEME_COOKIE);
  const darkClass = JSON.stringify(DARK_CLASS);
  const lightClass = JSON.stringify(LIGHT_CLASS);

  return (
    `(function(){var modes=${modes},cookie=${cookie};` +
    `function read(){var parts=document.cookie.split(";");` +
    `for(var i=0;i<parts.length;i++){var p=parts[i],s=p.indexOf("=");` +
    `if(s===-1)continue;if(p.slice(0,s).trim()!==cookie)continue;` +
    `var v=p.slice(s+1).trim();` +
    `return modes.indexOf(v)===-1?"system":v;}return "system";}` +
    `var mode=read();` +
    `var dark=mode==="dark"||(mode==="system"&&!!(window.matchMedia&&` +
    `window.matchMedia("(prefers-color-scheme: dark)").matches));` +
    `var root=document.documentElement;` +
    `root.classList.remove(${lightClass},${darkClass});` +
    `root.classList.add(dark?${darkClass}:${lightClass});})();`
  );
}
