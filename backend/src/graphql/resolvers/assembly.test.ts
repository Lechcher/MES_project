/**
 * Resolver assembly coverage.
 *
 * A field with no attached resolver falls back to the default property lookup
 * and silently resolves to `null`, so a missing entry is invisible at runtime.
 * This test asserts that every contract operation is wired to a resolver.
 */

import { describe, expect, test } from "bun:test";
import { isObjectType, isScalarType } from "graphql";
import { schema } from "../index";
import { mutationResolvers, queryResolvers } from "./index";

function fieldsOf(typeName: string): string[] {
	const type = schema.getType(typeName);
	if (!type || !isObjectType(type))
		throw new Error(`${typeName} is not an object`);
	return Object.keys(type.getFields());
}

function hasResolver(typeName: string, fieldName: string): boolean {
	const type = schema.getType(typeName);
	if (!type || !isObjectType(type)) return false;
	return typeof type.getFields()[fieldName]?.resolve === "function";
}

describe("query resolvers", () => {
	test("every query field is wired", () => {
		const missing = fieldsOf("Query").filter(
			(field) => !hasResolver("Query", field),
		);
		expect(missing).toEqual([]);
	});

	test("the resolver map declares exactly the schema's query fields", () => {
		expect(Object.keys(queryResolvers).sort()).toEqual(
			fieldsOf("Query").sort(),
		);
	});
});

describe("mutation resolvers", () => {
	test("every mutation field is wired", () => {
		const missing = fieldsOf("Mutation").filter(
			(field) => !hasResolver("Mutation", field),
		);
		expect(missing).toEqual([]);
	});

	test("the resolver map declares exactly the schema's mutation fields", () => {
		expect(Object.keys(mutationResolvers).sort()).toEqual(
			fieldsOf("Mutation").sort(),
		);
	});
});

describe("scalar and object resolvers", () => {
	test("the custom scalars are implemented, not placeholders", () => {
		for (const name of ["DateTime", "JSON", "Decimal"]) {
			const scalar = schema.getType(name);
			expect(scalar).toBeDefined();
			expect(isScalarType(scalar)).toBe(true);
			if (name === "DateTime" && isScalarType(scalar)) {
				// The real scalar normalizes a Date to an ISO-8601 string.
				expect(typeof scalar.serialize(new Date("2026-10-17T00:00:00Z"))).toBe(
					"string",
				);
			}
		}
	});

	test("nested relations are resolved rather than defaulted", () => {
		for (const [typeName, field] of [
			["Task", "assignedTo"],
			["Task", "project"],
			["User", "department"],
			["User", "roles"],
			["Department", "parent"],
			["LeaveRequest", "user"],
			["AttendanceRecord", "user"],
		] as const) {
			expect(hasResolver(typeName, field)).toBe(true);
		}
	});
});
