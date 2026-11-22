"use client";

/**
 * The theme bridge between MES and the embedded Telegram Web client.
 *
 * The client paints in its own theme, chosen from the Telegram account's
 * settings. MES is the source of truth instead: the resolved shell theme
 * (light or dark) is handed to the client twice — once at boot, as the
 * `theme` parameter on the frame's URL (the first paint already matches),
 * and once live, as a message posted to the mounted frame on every theme
 * change or frame load.
 *
 * The client side of this bridge lives in the vendored build (see
 * `frontend/scripts/telegram-tt-patches/` and NOTICES.md): it accepts only
 * `{ source: "mes", type: "theme", theme }` from its parent. Only frames MES
 * itself mounted (tagged with `data-telegram-frame`) are ever posted to, so
 * the bridge never reaches into frames it does not own.
 */

import { useEffect } from "react";
import type { ResolvedTheme } from "@/lib/mes/theme/config";

/** The selector for the frames MES mounts for the module. */
export const FRAME_SELECTOR = "iframe[data-telegram-frame]";

/** Post one resolved theme to every mounted module frame. */
export function postThemeToFrames(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  for (const frame of document.querySelectorAll<HTMLIFrameElement>(
    FRAME_SELECTOR,
  )) {
    // Same-origin iframes only: the client is served from `/telegram-web/`,
    // and the message is never broadcast anywhere else.
    frame.contentWindow?.postMessage(
      { source: "mes", type: "theme", theme },
      window.location.origin,
    );
  }
}

/**
 * Whether a load event came from one of the module's own frames.
 *
 * Duck-typed on `matches` rather than `instanceof HTMLIFrameElement`, which
 * is not defined outside a browser (the unit tests drive this path against
 * stubs). Only frames ever carry iframe load events, and the selector is
 * itself iframe-scoped.
 */
function isModuleFrame(
  target: EventTarget | null,
): target is HTMLIFrameElement {
  if (typeof target !== "object" || target === null) return false;
  const element = target as { matches?: unknown };
  if (typeof element.matches !== "function") return false;
  return (element.matches as (selector: string) => boolean)(FRAME_SELECTOR);
}

/**
 * Watch for module frames loading, and return the stop function.
 *
 * A frame's `load` does not bubble; the capture listener still sees it. The
 * handler runs only for the module's own frames.
 */
export function observeFrameLoads(onFrameLoad: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const onLoad = (event: Event) => {
    if (isModuleFrame(event.target)) {
      onFrameLoad();
    }
  };
  document.addEventListener("load", onLoad, true);
  return () => document.removeEventListener("load", onLoad, true);
}

/**
 * Keep the embedded client in step with the resolved shell theme.
 *
 * The theme is posted on every change and again on every frame load — a
 * post can otherwise be lost when it arrives before the client's own
 * listener exists — which also covers the client reloading itself.
 */
export function useThemeSync(theme: ResolvedTheme): void {
  useEffect(() => {
    postThemeToFrames(theme);
  }, [theme]);

  useEffect(() => observeFrameLoads(() => postThemeToFrames(theme)), [theme]);
}
