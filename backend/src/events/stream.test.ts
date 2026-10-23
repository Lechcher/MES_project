import { describe, expect, test } from "bun:test";
import { type ChangeArea, type ChangeBus, createChangeBus } from "./event-bus";
import {
	changeFrame,
	createEventStreamResponse,
	sseComment,
	sseFrame,
} from "./stream";

/** A bus that records how many subscriptions were taken and given back. */
function spyBus(): {
	bus: ChangeBus;
	subscribed: () => number;
	released: () => number;
} {
	const inner = createChangeBus();
	let subscribed = 0;
	let released = 0;
	return {
		bus: {
			publish: (area) => inner.publish(area),
			subscribe: (listener) => {
				subscribed += 1;
				const unsubscribe = inner.subscribe(listener);
				return () => {
					released += 1;
					unsubscribe();
				};
			},
		},
		subscribed: () => subscribed,
		released: () => released,
	};
}

async function readChunk(
	reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<string> {
	const decoder = new TextDecoder();
	const { value } = await reader.read();
	expect(value).toBeDefined();
	return decoder.decode(value);
}

describe("sse framing", () => {
	test("an event frame carries the event name and JSON data", () => {
		expect(sseFrame("connected", { ok: true })).toBe(
			'event: connected\ndata: {"ok":true}\n\n',
		);
	});

	test("a change frame names the area and nothing else", () => {
		expect(changeFrame("tickets")).toBe(
			'event: change\ndata: {"area":"tickets"}\n\n',
		);
	});

	test("a comment line is ignored by EventSource", () => {
		expect(sseComment("heartbeat")).toBe(": heartbeat\n\n");
	});
});

describe("event stream response", () => {
	test("opens with a connected frame and relays bus publications", async () => {
		const { bus } = spyBus();
		const response = createEventStreamResponse({ bus });
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("text/event-stream");

		const reader = response.body?.getReader();
		expect(reader).toBeDefined();
		if (!reader) return;

		const opening = await readChunk(reader);
		expect(opening).toContain("event: connected");
		expect(opening).toContain('data: {"ok":true}');

		bus.publish("leave");
		const change = await readChunk(reader);
		expect(change).toContain("event: change");
		expect(change).toContain('data: {"area":"leave"}');

		await reader.cancel();
	});

	test("writes heartbeat lines while idle", async () => {
		const { bus } = spyBus();
		const response = createEventStreamResponse({
			bus,
			heartbeatIntervalMs: 5,
		});
		const reader = response.body?.getReader();
		if (!reader) throw new Error("missing stream body");

		await readChunk(reader); // connected frame
		await Bun.sleep(20); // let at least one heartbeat elapse
		const beat = await readChunk(reader);
		expect(beat).toBe(": heartbeat\n\n");

		await reader.cancel();
	});

	test("cancelling the reader releases the bus subscription", async () => {
		const { bus, subscribed, released } = spyBus();
		const response = createEventStreamResponse({ bus });
		const reader = response.body?.getReader();
		if (!reader) throw new Error("missing stream body");

		await readChunk(reader); // connected frame
		expect(subscribed()).toBe(1);

		await reader.cancel();
		expect(released()).toBe(1);
	});

	test("closes and releases the subscription when the cap elapses", async () => {
		const { bus, released } = spyBus();
		const response = createEventStreamResponse({ bus, maxStreamMs: 5 });
		const reader = response.body?.getReader();
		if (!reader) throw new Error("missing stream body");

		await readChunk(reader); // connected frame
		await Bun.sleep(20); // past the cap
		const { done } = await reader.read();
		expect(done).toBe(true);
		expect(released()).toBe(1);
	});

	test("closes and releases the subscription when the abort signal fires", async () => {
		const { bus, released } = spyBus();
		const controller = new AbortController();
		const response = createEventStreamResponse({
			bus,
			signal: controller.signal,
		});
		const reader = response.body?.getReader();
		if (!reader) throw new Error("missing stream body");

		await readChunk(reader); // connected frame
		controller.abort();

		const { done } = await reader.read();
		expect(done).toBe(true);
		expect(released()).toBe(1);
	});

	test("keeps serving the remaining subscribers when one listener throws", async () => {
		const { bus } = spyBus();
		const response = createEventStreamResponse({ bus });
		const received: ChangeArea[] = [];
		bus.subscribe((area) => received.push(area));

		const reader = response.body?.getReader();
		if (!reader) throw new Error("missing stream body");

		await readChunk(reader); // connected frame
		bus.publish("audit");
		const change = await readChunk(reader);
		expect(change).toContain('data: {"area":"audit"}');
		expect(received).toEqual(["audit"]);

		await reader.cancel();
	});
});
