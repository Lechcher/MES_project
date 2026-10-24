/**
 * Live controller tests.
 *
 * The `EventSource` is injected as a fake, so the whole connection lifecycle —
 * connect, change frames, reconnect catch-up, the retry stop, status
 * transitions — is exercised without a browser or a server.
 */

import { describe, expect, test } from "bun:test";
import { type EventSourceLike, LiveController, type LiveStatus } from "./live";

type Listener = (event: { data: string }) => void;

class FakeEventSource implements EventSourceLike {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Set<Listener>>();
  closed = false;
  readyState = 0; // 0 connecting, 1 open, 2 closed

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  close(): void {
    this.closed = true;
    this.readyState = 2;
  }

  /** Simulate the transport opening. */
  open(): void {
    this.readyState = 1;
    for (const listener of [...(this.listeners.get("open") ?? [])]) {
      listener({ data: "" });
    }
  }

  /** Simulate a transport failure the browser will keep retrying. */
  fail(): void {
    for (const listener of [...(this.listeners.get("error") ?? [])]) {
      listener({ data: "" });
    }
  }

  /**
   * Simulate a fatal failure: the endpoint answered with a non-2xx status, so
   * the browser closed the source for good (a 401 or 502 from the proxy).
   */
  failFatal(): void {
    this.readyState = 2;
    this.fail();
  }

  /** Simulate a `change` frame carrying a JSON area payload. */
  change(area: string): void {
    for (const listener of [...(this.listeners.get("change") ?? [])]) {
      listener({ data: JSON.stringify({ area }) });
    }
  }

  /** Simulate a `change` frame whose payload is not JSON. */
  malformed(): void {
    for (const listener of [...(this.listeners.get("change") ?? [])]) {
      listener({ data: "not json" });
    }
  }
}

function makeController(): LiveController {
  return new LiveController({
    createSource: (url) => new FakeEventSource(url),
  });
}

/** The most recently created fake source. */
function currentSource(): FakeEventSource {
  const source = FakeEventSource.instances.at(-1);
  if (!source) throw new Error("no source created yet");
  return source;
}

describe("LiveController", () => {
  test("opens at the proxy endpoint and moves through its statuses", () => {
    FakeEventSource.instances = [];
    const statuses: LiveStatus[] = [];
    const controller = makeController();
    controller.onStatusChange((status) => statuses.push(status));

    controller.start();
    expect(currentSource().url).toBe("/api/mes/events");
    expect(controller.getStatus()).toBe("connecting");

    currentSource().open();
    expect(controller.getStatus()).toBe("live");

    currentSource().fail();
    expect(controller.getStatus()).toBe("offline");
    expect(statuses).toEqual(["connecting", "live", "offline"]);
  });

  test("delivers a matching area's change and ignores the others", () => {
    FakeEventSource.instances = [];
    const controller = makeController();
    const tickets: number[] = [];
    const leave: number[] = [];
    controller.subscribeArea("tickets", () => tickets.push(1));
    controller.subscribeArea("leave", () => leave.push(1));
    controller.start();
    currentSource().open();

    currentSource().change("tickets");
    currentSource().change("leave");
    currentSource().change("performance");

    expect(tickets).toHaveLength(1);
    expect(leave).toHaveLength(1);
  });

  test("ignores a malformed change frame without dropping listeners", () => {
    FakeEventSource.instances = [];
    const controller = makeController();
    let calls = 0;
    controller.subscribeArea("tickets", () => {
      calls += 1;
    });
    controller.start();
    currentSource().open();

    currentSource().malformed();
    expect(calls).toBe(0);

    currentSource().change("tickets");
    expect(calls).toBe(1);
  });

  test("the first connect fires no catch-up; every reconnect fires one", () => {
    FakeEventSource.instances = [];
    const controller = makeController();
    let catchUps = 0;
    controller.onReconnect(() => {
      catchUps += 1;
    });
    controller.start();

    currentSource().open(); // first connect — no catch-up
    expect(catchUps).toBe(0);

    currentSource().fail(); // connection drops
    currentSource().open(); // re-established — catch up
    expect(catchUps).toBe(1);

    currentSource().fail();
    currentSource().open();
    expect(catchUps).toBe(2);
  });

  test("stops retrying after repeated failures and resumes on demand", () => {
    FakeEventSource.instances = [];
    const controller = makeController();
    controller.start();
    const first = currentSource();

    first.fail();
    expect(first.closed).toBe(false);
    first.fail();
    expect(first.closed).toBe(false);
    first.fail(); // third consecutive failure stops the loop
    expect(first.closed).toBe(true);
    expect(controller.getStatus()).toBe("offline");

    controller.ensureRunning();
    const second = currentSource();
    expect(second).not.toBe(first);
    expect(controller.getStatus()).toBe("connecting");

    second.open();
    expect(controller.getStatus()).toBe("live");
  });

  test("a fatal failure (non-2xx) stops retrying after one error", () => {
    FakeEventSource.instances = [];
    const controller = makeController();
    controller.start();
    const source = currentSource();

    // One 502-style error: the browser closed the source, so there is no
    // built-in retry to wait out — the controller stops at once.
    source.failFatal();
    expect(source.closed).toBe(true);
    expect(controller.getStatus()).toBe("offline");

    controller.ensureRunning();
    expect(currentSource()).not.toBe(source);
    expect(controller.getStatus()).toBe("connecting");
  });

  test("unsubscribing stops delivery to that listener only", () => {
    FakeEventSource.instances = [];
    const controller = makeController();
    const kept: string[] = [];
    const dropped: string[] = [];
    controller.subscribeArea("tickets", () => kept.push("tickets"));
    const off = controller.subscribeArea("tickets", () =>
      dropped.push("tickets"),
    );
    controller.start();
    currentSource().open();

    off();
    currentSource().change("tickets");

    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(0);
  });

  test("close ends the connection but keeps subscriptions for a restart", () => {
    FakeEventSource.instances = [];
    const controller = makeController();
    let calls = 0;
    controller.subscribeArea("audit", () => {
      calls += 1;
    });
    controller.start();
    currentSource().open();

    controller.close();
    expect(currentSource().closed).toBe(true);
    expect(controller.getStatus()).toBe("offline");

    controller.start();
    currentSource().open();
    currentSource().change("audit");
    expect(calls).toBe(1);
  });
});
