/**
 * Query subscription tests.
 *
 * Drives the extracted `subscribeLiveQuery` helper through a real
 * `LiveController` with a fake `EventSource`, which is where the subscription
 * rules live: a matching change refetches, a non-matching one does not, a
 * reconnect refetches exactly once, and unsubscribing (an unmounting view)
 * stops everything.
 */

import { describe, expect, test } from "bun:test";
import { LiveController } from "./live";
import { subscribeLiveQuery } from "./live-subscription";

type Listener = (event: { data: string }) => void;

class FakeEventSource {
  readonly listeners = new Map<string, Set<Listener>>();

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  close(): void {}

  open(): void {
    for (const listener of [...(this.listeners.get("open") ?? [])]) {
      listener({ data: "" });
    }
  }

  fail(): void {
    for (const listener of [...(this.listeners.get("error") ?? [])]) {
      listener({ data: "" });
    }
  }

  change(area: string): void {
    for (const listener of [...(this.listeners.get("change") ?? [])]) {
      listener({ data: JSON.stringify({ area }) });
    }
  }
}

function setup() {
  const sources: FakeEventSource[] = [];
  const controller = new LiveController({
    createSource: (url) => {
      const source = new FakeEventSource(url);
      sources.push(source);
      return source;
    },
  });
  return { controller, sources };
}

describe("subscribeLiveQuery", () => {
  test("refetches on a change in the subscribed area only", () => {
    const { controller, sources } = setup();
    let refetches = 0;
    const unsubscribe = subscribeLiveQuery({
      controller,
      area: "leave",
      onChange: () => {
        refetches += 1;
      },
    });

    controller.start();
    sources[0]?.open();
    sources[0]?.change("leave");
    expect(refetches).toBe(1);

    sources[0]?.change("tickets");
    expect(refetches).toBe(1);

    unsubscribe();
    sources[0]?.change("leave");
    expect(refetches).toBe(1);
  });

  test("refetches exactly once on reconnect, not on the first connect", () => {
    const { controller, sources } = setup();
    let refetches = 0;
    subscribeLiveQuery({
      controller,
      area: "tickets",
      onChange: () => {
        refetches += 1;
      },
    });

    controller.start();
    sources[0]?.open(); // first connect: the query fetched on mount already
    expect(refetches).toBe(0);

    sources[0]?.fail();
    sources[0]?.open(); // reconnect: catch up once
    expect(refetches).toBe(1);
  });

  test("unsubscribing after a view unmounts stops all callbacks", () => {
    const { controller, sources } = setup();
    let refetches = 0;
    const unsubscribe = subscribeLiveQuery({
      controller,
      area: "performance",
      onChange: () => {
        refetches += 1;
      },
    });
    controller.start();
    sources[0]?.open();

    unsubscribe();
    sources[0]?.change("performance");
    sources[0]?.fail();
    sources[0]?.open();

    expect(refetches).toBe(0);
  });

  test("a query without an area opts out entirely", () => {
    const { controller, sources } = setup();
    let refetches = 0;
    const unsubscribe = subscribeLiveQuery({
      controller,
      area: null,
      onChange: () => {
        refetches += 1;
      },
    });

    controller.start();
    sources[0]?.open();
    sources[0]?.change("tickets");

    expect(refetches).toBe(0);
    expect(() => unsubscribe()).not.toThrow();
  });

  test("a query outside a provider (no controller) opts out entirely", () => {
    let refetches = 0;
    const unsubscribe = subscribeLiveQuery({
      controller: null,
      area: "tickets",
      onChange: () => {
        refetches += 1;
      },
    });

    expect(refetches).toBe(0);
    expect(() => unsubscribe()).not.toThrow();
  });
});
