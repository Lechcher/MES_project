/**
 * Server-Sent Events stream for backend change events.
 *
 * Builds the streaming `Response` behind `GET /api/v1/events`: one long-lived
 * response per browser tab, carrying an initial `connected` frame, a `change`
 * frame per published bus event, and comment heartbeats that keep idle
 * connections (and any intermediary) from closing the stream.
 *
 * The handler owns no state beyond its subscription: when the client goes away
 * — an abort signal, the duration cap, or the reader cancelling the stream —
 * the subscription is removed and the stream closes. That last case matters:
 * a network drop closes the response body without the request's abort signal
 * firing, so teardown has to hang off the stream reader too.
 */

import type { ChangeArea, ChangeBus } from "./event-bus";

/** Comment heartbeat written while no event has occurred. */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Maximum stream lifetime. Clients reconnect with a catch-up refetch, so a
 * close is always safe; this bounds connections stuck in a half-dead state.
 */
export const MAX_STREAM_MS = 30 * 60 * 1000;

/** Content type every SSE response must carry. */
export const SSE_CONTENT_TYPE = "text/event-stream";

export interface SseResponseOptions {
	bus: ChangeBus;
	signal?: AbortSignal;
	/** Overridable so a test need not wait the production heartbeat interval. */
	heartbeatIntervalMs?: number;
	/** Overridable so a test can exercise the cap without waiting it out. */
	maxStreamMs?: number;
}

/** Frame a single event as SSE: an event name plus a JSON data line. */
export function sseFrame(event: string, data: unknown): string {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** A comment line; ignored by EventSource, keeps the connection warm. */
export function sseComment(text: string): string {
	return `: ${text}\n\n`;
}

/**
 * Encode a change publication as the `change` frame the frontend parses.
 * The frame names the affected area and nothing else — no record payloads.
 */
export function changeFrame(area: ChangeArea): string {
	return sseFrame("change", { area });
}

/**
 * Build the SSE response for one connection.
 *
 * Returns a `ReadableStream`-backed response wired to the bus: the caller is
 * responsible for having authenticated the request before calling this.
 */
export function createEventStreamResponse(
	options: SseResponseOptions,
): Response {
	const {
		bus,
		signal,
		heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS,
		maxStreamMs = MAX_STREAM_MS,
	} = options;
	const encoder = new TextEncoder();

	// Assigned inside start(); cancel() can fire before or after start, so the
	// teardown is reached through this slot rather than directly.
	let teardown: (() => void) | null = null;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let closed = false;
			let unsubscribe: (() => void) | null = null;
			let heartbeat: ReturnType<typeof setInterval> | null = null;
			let cap: ReturnType<typeof setTimeout> | null = null;

			const close = () => {
				if (closed) return;
				closed = true;
				if (heartbeat !== null) clearInterval(heartbeat);
				if (cap !== null) clearTimeout(cap);
				unsubscribe?.();
				unsubscribe = null;
				signal?.removeEventListener("abort", close);
				try {
					controller.close();
				} catch {
					// Already closed by the reader cancelling the stream.
				}
			};
			teardown = close;

			const write = (chunk: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					// The reader is gone; close tears the subscription down.
					close();
				}
			};

			unsubscribe = bus.subscribe((area) => write(changeFrame(area)));
			write(sseFrame("connected", { ok: true }));

			heartbeat = setInterval(
				() => write(sseComment("heartbeat")),
				heartbeatIntervalMs,
			);
			// Do not hold the process open for the heartbeat alone.
			heartbeat.unref?.();
			cap = setTimeout(close, maxStreamMs);
			cap.unref?.();
			signal?.addEventListener("abort", close);
		},
		cancel() {
			teardown?.();
		},
	});

	return new Response(stream, {
		status: 200,
		headers: {
			"content-type": SSE_CONTENT_TYPE,
			"cache-control": "no-cache, no-transform",
			connection: "keep-alive",
			"x-accel-buffering": "no",
		},
	});
}
