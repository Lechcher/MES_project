"use client";

/**
 * Live change channel.
 *
 * One long-lived SSE connection per browser tab relays backend change events
 * to open views. This module owns the connection (`LiveController`) and hands
 * it to React through a context; `useQuery`'s `liveArea` option (see
 * `./session`) subscribes a query to one area.
 *
 * The controller is deliberately free of React and DOM specifics beyond the
 * `EventSource` it constructs — the source is injected, so the whole
 * connection lifecycle is testable without a browser.
 */

import { createContext, useContext, useEffect, useState } from "react";

/** The same areas the backend publishes (see `backend/src/events/`). */
export type LiveArea = "tickets" | "leave" | "performance" | "users" | "audit";

export type LiveStatus = "live" | "connecting" | "offline";

/** The same-origin proxy route that streams the backend's change events. */
export const LIVE_ENDPOINT = "/api/mes/events";

/**
 * The slice of `EventSource` the controller uses. Named events arrive as
 * message-like events carrying a JSON `data` string.
 */
export interface EventSourceLike {
  /** 0 connecting, 1 open, 2 closed — the browser's own `readyState`. */
  readonly readyState: number;
  addEventListener(
    type: string,
    listener: (event: { data: string }) => void,
  ): void;
  close(): void;
}

export type EventSourceFactory = (url: string) => EventSourceLike;

/** Wrap a browser `EventSource` in the controller's minimal shape. */
export function browserEventSource(url: string): EventSourceLike {
  const source = new EventSource(url);
  return {
    get readyState() {
      return source.readyState;
    },
    addEventListener: (type, listener) => {
      source.addEventListener(type as "message", (event) => {
        listener({ data: String((event as MessageEvent).data ?? "") });
      });
    },
    close: () => source.close(),
  };
}

/**
 * Consecutive transport failures after which the controller stops retrying.
 *
 * `EventSource` reconnects on its own after a mid-stream break, which on a
 * dead endpoint turns into an endless retry loop. After this many failures the
 * controller closes the socket and goes quiet until something asks it to run
 * again — a viewer change or window focus (see `ensureRunning`). A fatal
 * answer (a non-2xx status, which the browser treats as final) stops the
 * controller immediately regardless of the count.
 */
const MAX_CONSECUTIVE_FAILURES = 3;

interface ChangeFrame {
  area?: unknown;
}

export class LiveController {
  private readonly url: string;
  private readonly createSource: EventSourceFactory;
  private source: EventSourceLike | null = null;
  private status: LiveStatus = "offline";
  private connectedOnce = false;
  private stopped = false;
  private consecutiveFailures = 0;

  private readonly areaListeners = new Map<LiveArea, Set<() => void>>();
  private readonly reconnectListeners = new Set<() => void>();
  private readonly statusListeners = new Set<(status: LiveStatus) => void>();

  constructor(
    options: { url?: string; createSource?: EventSourceFactory } = {},
  ) {
    this.url = options.url ?? LIVE_ENDPOINT;
    this.createSource = options.createSource ?? browserEventSource;
  }

  getStatus(): LiveStatus {
    return this.status;
  }

  /** Open the connection. Replaces any existing socket. */
  start(): void {
    this.closeSource();
    this.stopped = false;
    this.consecutiveFailures = 0;
    this.setStatus("connecting");

    const source = this.createSource(this.url);
    this.source = source;

    source.addEventListener("open", () => {
      this.consecutiveFailures = 0;
      this.setStatus("live");
      // Only re-connects need a catch-up refetch: a query that mounted
      // before the first connection fetched its own data, so replaying
      // the first connect would just double every view's first request.
      if (this.connectedOnce) {
        for (const listener of [...this.reconnectListeners]) listener();
      }
      this.connectedOnce = true;
    });

    source.addEventListener("change", (event) => {
      let frame: ChangeFrame;
      try {
        frame = JSON.parse(event.data) as ChangeFrame;
      } catch {
        // A malformed frame carries no usable area; ignore it rather
        // than taking down the connection's listener.
        return;
      }
      const area = frame.area as LiveArea;
      for (const listener of [...(this.areaListeners.get(area) ?? [])]) {
        listener();
      }
    });

    source.addEventListener("error", () => {
      this.consecutiveFailures += 1;
      // A closed source will never reconnect on its own — the browser treats
      // a non-2xx answer (a 401 or 502 from the proxy) as fatal, unlike a
      // mid-stream break it retries. Either way the retry loop is over, so
      // the controller stops and waits to be asked to run again.
      const gaveUp = source.readyState === 2; // EventSource.CLOSED
      if (gaveUp || this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        this.closeSource();
        this.stopped = true;
      }
      this.setStatus("offline");
    });
  }

  /** Close the connection without discarding subscriptions. */
  close(): void {
    this.closeSource();
    this.stopped = false;
    this.consecutiveFailures = 0;
    this.setStatus("offline");
  }

  /** Start the connection if it is not running (resumes after a stop). */
  ensureRunning(): void {
    if (this.stopped || this.source === null) this.start();
  }

  /** Listen for changes in one area. Returns an unsubscribe function. */
  subscribeArea(area: LiveArea, listener: () => void): () => void {
    const listeners = this.areaListeners.get(area) ?? new Set();
    listeners.add(listener);
    this.areaListeners.set(area, listeners);
    return () => {
      listeners.delete(listener);
    };
  }

  /**
   * Listen for re-connections. Fires when an established connection is
   * re-established — the moment a client refetches to catch up on anything
   * missed while it was down.
   */
  onReconnect(listener: () => void): () => void {
    this.reconnectListeners.add(listener);
    return () => {
      this.reconnectListeners.delete(listener);
    };
  }

  /** Listen for connection status changes. */
  onStatusChange(listener: (status: LiveStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private setStatus(status: LiveStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of [...this.statusListeners]) listener(status);
  }

  private closeSource(): void {
    if (this.source) {
      this.source.close();
      this.source = null;
    }
  }
}

/** The controller for the current tree, or `null` outside a provider. */
export const LiveContext = createContext<LiveController | null>(null);

export function useLiveController(): LiveController | null {
  return useContext(LiveContext);
}

/** The live connection's status for the current tree. */
export function useLiveStatus(): LiveStatus {
  const controller = useLiveController();
  const [status, setStatus] = useState<LiveStatus>(
    controller ? controller.getStatus() : "offline",
  );
  useEffect(() => {
    setStatus(controller ? controller.getStatus() : "offline");
    if (!controller) return;
    return controller.onStatusChange(setStatus);
  }, [controller]);
  return status;
}
