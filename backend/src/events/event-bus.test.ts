import { describe, expect, test } from "bun:test";
import { type ChangeArea, createChangeBus } from "./event-bus";

describe("change bus", () => {
	test("delivers each published area to every subscriber", () => {
		const bus = createChangeBus();
		const first: ChangeArea[] = [];
		const second: ChangeArea[] = [];
		bus.subscribe((area) => first.push(area));
		bus.subscribe((area) => second.push(area));

		bus.publish("tickets");
		bus.publish("leave");

		expect(first).toEqual(["tickets", "leave"]);
		expect(second).toEqual(["tickets", "leave"]);
	});

	test("unsubscribe stops further delivery to that listener only", () => {
		const bus = createChangeBus();
		const kept: ChangeArea[] = [];
		const dropped: ChangeArea[] = [];
		bus.subscribe((area) => kept.push(area));
		const unsubscribe = bus.subscribe((area) => dropped.push(area));

		bus.publish("performance");
		unsubscribe();
		bus.publish("audit");

		expect(dropped).toEqual(["performance"]);
		expect(kept).toEqual(["performance", "audit"]);
	});

	test("a subscriber attached after a publish receives nothing for it", () => {
		const bus = createChangeBus();
		bus.publish("users");

		const late: ChangeArea[] = [];
		bus.subscribe((area) => late.push(area));
		bus.publish("users");

		expect(late).toEqual(["users"]);
	});

	test("a listener that unsubscribes during fan-out leaves the rest intact", () => {
		const bus = createChangeBus();
		const received: string[] = [];
		const unsubscribes = new Map<string, () => void>();
		unsubscribes.set(
			"self",
			bus.subscribe(() => {
				// Removing itself mid-fan-out must not disturb the other listener.
				unsubscribes.get("self")?.();
			}),
		);
		bus.subscribe((area) => received.push(area));

		bus.publish("tickets");

		expect(received).toEqual(["tickets"]);
	});
});
