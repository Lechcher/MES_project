/**
 * Mutation → change-area mapping.
 *
 * Two things are under test: the extraction helper's behavior (which
 * operations publish, which stay silent) and the mapping table's coverage of
 * the schema's mutation surface — a new mutation field must fail here until
 * someone decides what it invalidates.
 */

import { describe, expect, test } from "bun:test";
import { Kind, parse } from "graphql";
import type { ChangeArea } from "../events/event-bus";
import {
	areasForMutation,
	MUTATION_AREAS,
	publishMutationAreas,
} from "./change-areas";
import { typeDefs } from "./schema";

const query = (source: string) => parse(source);
const ok = { data: {} };

describe("areasForMutation", () => {
	test("collects the unique areas of a batched multi-field mutation", () => {
		const areas = areasForMutation(
			query(`
        mutation Batch {
          createTask(input: { title: "T", taskType: HOURLY, priority: HIGH }) { id }
          approveTask(taskId: "1") { id }
          registerLeave(input: { leaveCode: AL, startDate: "2026-01-01", endDate: "2026-01-02", reason: "rest" }) { id }
        }
      `),
			ok,
		);
		expect(areas.sort()).toEqual(["leave", "tickets"]);
	});

	test("returns no areas for a query operation", () => {
		const areas = areasForMutation(query(`{ tasks { nodes { id } } }`), ok);
		expect(areas).toEqual([]);
	});

	test("returns no areas when the mutation returned errors", () => {
		const areas = areasForMutation(
			query(
				`mutation { createTask(input: { title: "T", taskType: HOURLY, priority: HIGH }) { id } }`,
			),
			{
				data: null,
				errors: [{ message: "nope", path: ["createTask"] } as never],
			},
		);
		expect(areas).toEqual([]);
	});

	test("ignores an operation the request did not run", () => {
		const document = query(`
      mutation Named { createTask(input: { title: "T", taskType: HOURLY, priority: HIGH }) { id } }
      mutation Other { registerLeave(input: { leaveCode: AL, startDate: "2026-01-01", endDate: "2026-01-02", reason: "rest" }) { id } }
    `);
		expect(areasForMutation(document, ok, "Named")).toEqual(["tickets"]);
		expect(areasForMutation(document, ok, "Other")).toEqual(["leave"]);
	});

	test("follows a fragment spread at the mutation root", () => {
		const areas = areasForMutation(
			query(`
        mutation { ...Changes }
        fragment Changes on Mutation {
          reviewLeave(input: { leaveRequestId: "1", decision: APPROVED }) { id }
        }
      `),
			ok,
		);
		expect(areas).toEqual(["leave"]);
	});

	test("treats auth-only mutations as inert", () => {
		const areas = areasForMutation(
			query(
				`mutation { login(input: { email: "a@b.c", password: "x" }) { token } changePassword(input: { currentPassword: "a", newPassword: "b" }) }`,
			),
			ok,
		);
		expect(areas).toEqual([]);
	});
});

describe("publishMutationAreas", () => {
	test("publishes each unique area exactly once", () => {
		const published: ChangeArea[] = [];
		publishMutationAreas(ok, {
			document: query(`
        mutation {
          createTask(input: { title: "T", taskType: HOURLY, priority: HIGH }) { id }
          approveTask(taskId: "1") { id }
          printTaskSlip(taskId: "1") { id }
        }
      `),
			bus: { publish: (area) => published.push(area) },
		});
		expect(published).toEqual(["tickets"]);
	});

	test("stays silent when no bus is wired", () => {
		// Callers that construct the service without a bus (older tests) must
		// see no behavior change: nothing throws, nothing publishes.
		expect(() =>
			publishMutationAreas(ok, {
				document: query(`mutation { approveTask(taskId: "1") { id } }`),
			}),
		).not.toThrow();
	});
});

describe("mapping table coverage", () => {
	/** The field names the schema declares on `type Mutation`. */
	function schemaMutationFields(): string[] {
		const document = parse(typeDefs);
		const fields: string[] = [];
		for (const definition of document.definitions) {
			if (
				definition.kind === Kind.OBJECT_TYPE_DEFINITION &&
				definition.name.value === "Mutation"
			) {
				for (const field of definition.fields ?? []) {
					fields.push(field.name.value);
				}
			}
		}
		return fields;
	}

	test("decides an area for every declared mutation field", () => {
		const declared = schemaMutationFields();
		expect(declared.length).toBeGreaterThan(0);

		const undecided = declared.filter((field) => !(field in MUTATION_AREAS));
		expect(undecided).toEqual([]);
	});

	test("maps every field to a known area or to inert", () => {
		const known: (ChangeArea | null)[] = [
			"tickets",
			"leave",
			"performance",
			"users",
			"audit",
			null,
		];
		const invalid = Object.entries(MUTATION_AREAS)
			.filter(([, area]) => !known.includes(area))
			.map(([field]) => field);
		expect(invalid).toEqual([]);
	});

	test("keeps the auth session mutations inert", () => {
		for (const field of [
			"login",
			"logout",
			"requestPasswordReset",
			"resetPassword",
			"changePassword",
		]) {
			expect(MUTATION_AREAS[field]).toBeNull();
		}
	});
});
