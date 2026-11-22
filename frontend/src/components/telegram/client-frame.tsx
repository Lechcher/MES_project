"use client";

/**
 * The embedded Telegram Web client, mounted in an iframe.
 *
 * The client is the vendored telegram-tt build served at `/telegram-web/`;
 * `?account=<slot>` tells it which of its own account slots to load, and the
 * slot's session material was hydrated into that origin's storage before
 * this frame mounts (the controller's `selectAccount`), so a restored account
 * connects with no login step.
 *
 * `?theme=<light|dark>` tells it which theme to paint in — the resolved MES
 * theme, captured once per mount (the frame is keyed by slot, so a new frame
 * boots in the current theme). A later theme change never touches the URL:
 * the live bridge re-themes the open client in place, because changing `src`
 * would reload the frame and reconnect the account.
 *
 * The frame is keyed by slot: switching accounts remounts it, which is the
 * client's own multi-account model — one tab per slot, each re-reading its
 * own stored session.
 */

import { useRef } from "react";
import type { ResolvedTheme } from "@/lib/mes/theme/config";

export interface ClientFrameProps {
  /** The mounted account's slot; `null` renders nothing. */
  slot: number | null;
  /** Accessible name for the frame, e.g. the account's name. */
  label: string;
  /** The resolved MES theme this frame boots in. */
  theme: ResolvedTheme;
}

export function ClientFrame({ slot, label, theme }: ClientFrameProps) {
  // Captured before the early return so the hook order is stable: a theme
  // change must not rebuild the URL of an already-mounted frame.
  const bootTheme = useRef(theme).current;

  if (slot === null) return null;

  return (
    <iframe
      key={slot}
      data-telegram-frame=""
      src={`/telegram-web/index.html?account=${slot}&theme=${bootTheme}`}
      title={label}
      // Telegram Web asks for camera and microphone for calls and for the
      // QR-login scan; without these the embedded client degrades.
      allow="camera; microphone; autoplay; clipboard-read; clipboard-write; display-capture; fullscreen"
      className="h-full min-h-[70vh] w-full border-0 bg-background"
    />
  );
}
