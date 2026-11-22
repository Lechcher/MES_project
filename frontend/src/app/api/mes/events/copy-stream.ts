/**
 * Copy an upstream SSE body to the browser, owning the error class.
 *
 * Next.js pipes a route handler's response body itself, and rethrows any pipe
 * failure that is not an `AbortError`/`ResponseAborted` as an unhandled
 * `failed to pipe response` error. A stream ending mid-life — the upstream
 * socket dying, the backend restarting — is normal lifecycle for a long-lived
 * SSE proxy, so this copy loop turns every upstream read failure into a clean
 * end-of-stream and releases the upstream promptly when the browser goes away.
 */

export interface CopyEventStreamOptions {
  /** The upstream response body, e.g. the proxied fetch's body. */
  upstream: ReadableStream<Uint8Array>;
  /** Aborted when the browser disconnects; tears the upstream down. */
  signal: AbortSignal;
}

/**
 * Forward `upstream` to a new stream that always ends cleanly.
 *
 * Chunks are forwarded as they arrive — no buffering. An upstream read error
 * of any class ends the stream quietly (the browser's `EventSource` reconnects
 * on its own); `cancel()` — the reader going away — cancels the upstream so no
 * dead connection is left behind.
 */
export function copyEventStream({
  upstream,
  signal,
}: CopyEventStreamOptions): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();

  const releaseUpstream = () => {
    void reader.cancel().catch(() => {
      // The upstream already errored or closed; nothing to release.
    });
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (signal.aborted) {
        releaseUpstream();
        controller.close();
        return;
      }
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch {
        // The upstream died mid-stream (terminated socket, backend restart):
        // end this stream cleanly. The browser reconnects under its own
        // EventSource retry, and no unhandled error reaches Next's pipe.
        releaseUpstream();
        controller.close();
      }
    },
    cancel() {
      releaseUpstream();
    },
  });
}
