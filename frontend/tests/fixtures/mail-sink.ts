/**
 * A mail sink for the e2e suite.
 *
 * A minimal SMTP server on 127.0.0.1:2525 that accepts every message and files
 * it under `test-results/mail-sink/`. The backend dev server is configured to
 * deliver through it (see `playwright.config.ts`), so a flow that mails a
 * verification link can read the link back and follow it — the same thing a
 * recipient does.
 *
 * Only what the delivery path needs is implemented: greeting, EHLO, one
 * recipient per message, DATA, QUIT. TLS and AUTH are deliberately absent, so
 * nodemailer's plain mode is what the suite exercises.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:net";
import { join } from "node:path";

export const MAIL_SINK_PORT = 2525;
export const MAIL_SINK_DIR = join(process.cwd(), "test-results", "mail-sink");

let server: Server | null = null;

/** Start the sink and return once it accepts connections. */
export async function startMailSink(): Promise<void> {
  if (server) return;
  rmSync(MAIL_SINK_DIR, { recursive: true, force: true });
  mkdirSync(MAIL_SINK_DIR, { recursive: true });

  server = createServer((socket) => {
    let inData = false;
    let dataBuffer = "";

    socket.write("220 mail-sink ESMTP ready\r\n");

    socket.on("data", (buffer) => {
      const text = buffer.toString("utf8");
      if (inData) {
        dataBuffer += text;
        if (dataBuffer.includes("\r\n.\r\n")) {
          inData = false;
          const message = dataBuffer;
          dataBuffer = "";
          const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          writeFileSync(join(MAIL_SINK_DIR, `${id}.eml`), message);
          socket.write("250 OK: queued\r\n");
        }
        return;
      }

      const command = text.trim();
      if (command.toUpperCase().startsWith("DATA")) {
        inData = true;
        socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        return;
      }
      if (command.toUpperCase().startsWith("QUIT")) {
        socket.write("221 Bye\r\n");
        socket.end();
        return;
      }
      socket.write("250 OK\r\n");
    });

    socket.on("error", () => socket.destroy());
  });

  await new Promise<void>((resolve, reject) => {
    server?.once("error", reject);
    server?.listen(MAIL_SINK_PORT, "127.0.0.1", () => resolve());
  });
}

/** Stop the sink; safe to call when it was never started. */
export async function stopMailSink(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve) => {
    server?.close(() => resolve());
  });
  server = null;
}

/** Every raw message the sink has accepted, oldest first. */
export function mailSinkMessages(): string[] {
  if (!existsSync(MAIL_SINK_DIR)) return [];
  return readdirSync(MAIL_SINK_DIR)
    .filter((name) => name.endsWith(".eml"))
    .sort()
    .map((name) => readFileSync(join(MAIL_SINK_DIR, name), "utf8"));
}

/**
 * Undo a quoted-printable body: join soft line breaks and decode escapes.
 *
 * Nodemailer encodes long URLs this way, so the confirmation link arrives
 * wrapped across lines with `=` as `=3D` — a raw regex would read a broken
 * token and every confirmation would look invalid.
 */
function decodeQuotedPrintable(text: string): string {
  return text
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
}

/** The first confirmation link the sink carries, or `null` when there is none. */
export function latestConfirmEmailLink(): string | null {
  for (const message of mailSinkMessages().reverse()) {
    const match = decodeQuotedPrintable(message).match(
      /https?:\/\/\S*confirm-email\?\S*/,
    );
    if (match) return match[0];
  }
  return null;
}
