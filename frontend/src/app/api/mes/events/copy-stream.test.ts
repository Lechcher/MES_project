/**
 * Copy-stream tests.
 *
 * The route behind these tests proxies a long-lived SSE body, so the property
 * under test is error classification: whatever the upstream does — deliver
 * frames, die mid-stream, or be cancelled — the returned stream ends cleanly
 * and releases the upstream. A thrown error here would surface as Next's
 * `failed to pipe response` (see the change that introduced this module).
 */

import { describe, expect, test } from "bun:test";
import { copyEventStream } from "./copy-stream";

const encoder = new TextEncoder();

function upstreamOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

/** Read everything the copy stream yields, as text. */
async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream) {
    text += decoder.decode(chunk, { stream: true });
  }
  return text;
}

describe("copyEventStream", () => {
  test("forwards frames as they arrive and ends when upstream ends", async () => {
    const copied = copyEventStream({
      upstream: upstreamOf(
        encoder.encode("event: connected\n"),
        encoder.encode('data: {"ok":true}\n\n'),
      ),
      signal: new AbortController().signal,
    });

    expect(await drain(copied)).toBe('event: connected\ndata: {"ok":true}\n\n');
  });

  test("ends cleanly when the upstream errors mid-stream", async () => {
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(": first\n\n"));
      },
      pull(controller) {
        // A terminated socket arrives exactly like this: the first frame was
        // already forwarded, then the body errors with no further data.
        controller.error(new TypeError("terminated"));
      },
    });

    const copied = copyEventStream({
      upstream,
      signal: new AbortController().signal,
    });

    const reader = copied.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(new TextDecoder().decode(first.value)).toBe(": first\n\n");

    // The next read ends the stream instead of rejecting.
    const second = await reader.read();
    expect(second.done).toBe(true);
  });

  test("releases the upstream when the reader cancels", async () => {
    let upstreamCancelled = false;
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(": one\n\n"));
      },
      cancel() {
        upstreamCancelled = true;
      },
    });

    const copied = copyEventStream({
      upstream,
      signal: new AbortController().signal,
    });
    const reader = copied.getReader();
    await reader.read();

    await reader.cancel();
    expect(upstreamCancelled).toBe(true);
  });

  test("ends and releases the upstream when the signal is already aborted", async () => {
    let upstreamCancelled = false;
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(": one\n\n"));
      },
      cancel() {
        upstreamCancelled = true;
      },
    });

    const controller = new AbortController();
    controller.abort();
    const copied = copyEventStream({ upstream, signal: controller.signal });

    const { done } = await copied.getReader().read();
    expect(done).toBe(true);
    expect(upstreamCancelled).toBe(true);
  });
});
