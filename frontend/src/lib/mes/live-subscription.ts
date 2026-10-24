/**
 * Live-channel subscription for one query.
 *
 * Extracted from the `useQuery` effect so the rules are testable without a
 * React runtime: subscribe to one area, refetch when that area changes, refetch
 * once on every reconnect to catch up on what was missed while offline, and
 * unsubscribe cleanly on unmount or when the subscription's inputs change.
 */

import type { LiveArea, LiveController } from "./live";

export interface LiveSubscriptionInput {
  /** The tree's controller, or `null` when no provider is mounted. */
  controller: LiveController | null;
  /** The area to follow; `null` opts the query out of live updates. */
  area: LiveArea | null;
  /** Called on a matching change and on every reconnect. */
  onChange: () => void;
}

/** Subscribe to the live channel. Returns an unsubscribe function. */
export function subscribeLiveQuery(input: LiveSubscriptionInput): () => void {
  const { controller, area, onChange } = input;
  if (!controller || !area) return () => {};

  const offArea = controller.subscribeArea(area, onChange);
  const offReconnect = controller.onReconnect(onChange);
  return () => {
    offArea();
    offReconnect();
  };
}
