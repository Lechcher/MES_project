/**
 * Theme bridge tests — the MES ↔ embedded-client theme seam.
 *
 * The bridge is plain DOM code, so these tests run it against a minimal
 * document/window stub rather than a browser. What the tests pin is the
 * client-side contract (`{ source: "mes", type: "theme", theme }`, posted to
 * same-origin module frames only): a drift there leaves the embedded client
 * on its own theme, or posts the theme somewhere it does not belong.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  FRAME_SELECTOR,
  observeFrameLoads,
  postThemeToFrames,
} from "./theme-sync";

interface PostedMessage {
  source: string;
  type: string;
  theme: string;
}

class FakeContentWindow {
  readonly posts: { message: PostedMessage; origin: string }[] = [];

  postMessage(message: PostedMessage, origin: string): void {
    this.posts.push({ message, origin });
  }
}

class FakeFrame {
  readonly frame = true;
  readonly ownerWindow: FakeContentWindow;
  matchesSelector = true;

  constructor(ownerWindow: FakeContentWindow) {
    this.ownerWindow = ownerWindow;
  }

  get contentWindow(): FakeContentWindow {
    return this.ownerWindow;
  }

  matches(selector: string): boolean {
    if (selector !== FRAME_SELECTOR) return false;
    return this.matchesSelector;
  }
}

let frames: FakeFrame[];
let listeners: Map<string, Set<(event: unknown) => void>>;

function addEventListener(
  type: string,
  listener: (event: unknown) => void,
): void {
  const set = listeners.get(type) ?? new Set();
  set.add(listener);
  listeners.set(type, set);
}

function removeEventListener(
  type: string,
  listener: (event: unknown) => void,
): void {
  listeners.get(type)?.delete(listener);
}

/** A frame's `load` does not bubble, so dispatch it as a browser does. */
function dispatchLoad(target: FakeFrame | null, type = "load"): void {
  for (const listener of listeners.get(type) ?? []) {
    listener({ target, type });
  }
}

beforeEach(() => {
  frames = [];
  listeners = new Map();
  // biome-ignore lint/suspicious/noExplicitAny: minimal document stub
  (globalThis as any).document = {
    addEventListener,
    removeEventListener,
    querySelectorAll: (selector: string) => {
      if (selector !== FRAME_SELECTOR) return [];
      return frames.filter((frame) => frame.matches(FRAME_SELECTOR));
    },
  };
  // biome-ignore lint/suspicious/noExplicitAny: minimal window stub
  (globalThis as any).window = {
    location: { origin: "https://mes.test" },
    addEventListener,
    removeEventListener,
  };
});

afterEach(() => {
  // biome-ignore lint/suspicious/noExplicitAny: resetting the stub
  (globalThis as any).document = undefined;
  // biome-ignore lint/suspicious/noExplicitAny: resetting the stub
  (globalThis as any).window = undefined;
});

function addFrame(owner = new FakeContentWindow()): FakeFrame {
  const frame = new FakeFrame(owner);
  frames.push(frame);
  return frame;
}

describe("posting the theme to the frames", () => {
  test("posts the theme bridge payload to every module frame, same-origin", () => {
    const first = addFrame();
    const second = addFrame();

    postThemeToFrames("dark");

    for (const frame of [first, second]) {
      expect(frame.ownerWindow.posts).toHaveLength(1);
      expect(frame.ownerWindow.posts[0].message).toEqual({
        source: "mes",
        type: "theme",
        theme: "dark",
      });
      expect(frame.ownerWindow.posts[0].origin).toBe("https://mes.test");
    }
  });

  test("leaves frames MES does not own alone", () => {
    const owned = addFrame();
    const foreign = addFrame();
    foreign.matchesSelector = false;

    postThemeToFrames("light");

    expect(owned.ownerWindow.posts).toHaveLength(1);
    expect(foreign.ownerWindow.posts).toHaveLength(0);
  });

  test("skips a frame whose window is not there yet", () => {
    const owned = addFrame();
    const detached = new FakeFrame(null as unknown as FakeContentWindow);
    frames.push(detached);

    postThemeToFrames("light");

    expect(owned.ownerWindow.posts).toHaveLength(1);
  });
});

describe("watching for frame loads", () => {
  test("re-posts when a module frame loads", () => {
    const owned = addFrame();
    const stop = observeFrameLoads(() => postThemeToFrames("dark"));

    dispatchLoad(owned);
    expect(owned.ownerWindow.posts).toHaveLength(1);

    stop();
    dispatchLoad(owned);
    expect(owned.ownerWindow.posts).toHaveLength(1);
  });

  test("ignores loads from foreign frames", () => {
    const owned = addFrame();
    const foreign = addFrame();
    foreign.matchesSelector = false;
    observeFrameLoads(() => postThemeToFrames("light"));

    dispatchLoad(foreign);
    dispatchLoad(null);
    expect(owned.ownerWindow.posts).toHaveLength(0);
  });
});
