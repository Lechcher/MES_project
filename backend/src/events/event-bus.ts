/**
 * Process-local change bus.
 *
 * Backend mutations publish the domain area they touched; the SSE stream
 * handler (see `./stream`) turns those publications into frames for open
 * browser connections.
 *
 * The bus is deliberately memory-only with no replay buffer: frames missed
 * while a client is disconnected cannot be replayed, so clients refetch their
 * open views' state when the connection is re-established. Keeping history
 * would promise replay the stream never delivers.
 */

/** The domain areas a mutation can invalidate. Mirrors the frontend's areas. */
export type ChangeArea =
	| "tickets"
	| "leave"
	| "performance"
	| "users"
	| "audit";

export type ChangeListener = (area: ChangeArea) => void;

export interface ChangeBus {
	/** Announce that data in `area` changed. */
	publish(area: ChangeArea): void;
	/**
	 * Listen for publications. Returns an unsubscribe function; a listener is
	 * removed on call and receives nothing published before it subscribed.
	 */
	subscribe(listener: ChangeListener): () => void;
}

/** Create an in-process bus. One instance is shared per service (see `bootstrap`). */
export function createChangeBus(): ChangeBus {
	const listeners = new Set<ChangeListener>();

	return {
		publish(area) {
			// Copy first: a listener that unsubscribes during fan-out must not
			// shift the set under the remaining listeners.
			for (const listener of [...listeners]) {
				listener(area);
			}
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}
