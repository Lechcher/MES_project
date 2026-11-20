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
 * The frame is keyed by slot: switching accounts remounts it, which is the
 * client's own multi-account model — one tab per slot, each re-reading its
 * own stored session.
 */

export interface ClientFrameProps {
  /** The mounted account's slot; `null` renders nothing. */
  slot: number | null;
  /** Accessible name for the frame, e.g. the account's name. */
  label: string;
}

export function ClientFrame({ slot, label }: ClientFrameProps) {
  if (slot === null) return null;

  return (
    <iframe
      key={slot}
      src={`/telegram-web/index.html?account=${slot}`}
      title={label}
      // Telegram Web asks for camera and microphone for calls and for the
      // QR-login scan; without these the embedded client degrades.
      allow="camera; microphone; autoplay; clipboard-read; clipboard-write; display-capture; fullscreen"
      className="h-full min-h-[70vh] w-full border-0 bg-background"
    />
  );
}
