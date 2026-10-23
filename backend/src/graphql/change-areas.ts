/**
 * Mutation → change-area mapping.
 *
 * One central hook turns a successful mutation into bus publications: the
 * mapping table below decides which domain area each mutation field
 * invalidates, and the GraphQL layer publishes the unique set after execution
 * (see `./index`). Editing resolvers or domain services is deliberately not
 * required — the table is the single place a new mutation declares what it
 * changed.
 *
 * `null` marks a mutation that changes no displayed domain data: the auth
 * session mutations alter the caller's own session only, so no open view has
 * anything to refetch.
 */

import {
	type DocumentNode,
	type ExecutionResult,
	type FragmentDefinitionNode,
	Kind,
	type OperationDefinitionNode,
	type SelectionNode,
} from "graphql";
import type { ChangeArea } from "../events/event-bus";

/**
 * Every field of `type Mutation` in `./schema.ts`, mapped to the area it
 * invalidates — or `null` when it changes no displayed domain data.
 *
 * The mapping is guarded by a coverage test (see `./change-areas.test.ts`):
 * a new schema mutation fails the suite until it is decided here.
 */
export const MUTATION_AREAS: Record<string, ChangeArea | null> = {
	// Auth — own-session changes only.
	login: null,
	logout: null,
	requestPasswordReset: null,
	resetPassword: null,
	changePassword: null,

	// Jobs & Projects.
	createTask: "tickets",
	acceptTask: "tickets",
	logTaskProgress: "tickets",
	submitTaskReport: "tickets",
	approveTask: "tickets",
	returnTask: "tickets",
	cancelTask: "tickets",
	requestExtension: "tickets",
	explainLateSubmission: "tickets",
	reviewTaskRequest: "tickets",
	submitTaskCompletionRequest: "tickets",
	reviewTaskCompletionRequest: "tickets",

	// Planning & Attendance.
	registerLeave: "leave",
	reviewLeave: "leave",
	assignPenaltyLeave: "leave",
	recordOvertime: "leave",
	reviewOvertime: "leave",
	updateTask: "tickets",
	deleteTask: "tickets",
	duplicateTask: "tickets",
	previewTaskImport: null,
	commitTaskImport: "tickets",

	// Settings & IAM.
	createUser: "users",
	updateUser: "users",
	resetUserPassword: "users",
	deactivateUser: "users",
	createDepartment: "users",
	updateDepartment: "users",
	updateRolePermissions: "users",
	updateAppSetting: "users",
	updateTelegramWebhookConfig: "users",

	// Audit Log app.
	exportAuditLogs: "audit",

	// Print / export — reports scoped to one module's data.
	printTaskSlip: "tickets",
	exportTasks: "tickets",
	exportSchedule: "tickets",
	taskImportTemplate: "tickets",
	printLeaveRequest: "leave",
	printAttendanceCalendar: "leave",
	exportAttendance: "leave",
	printKpiReport: "performance",
	exportAuditWorkbook: "performance",
};

/** The root field names an operation selects, following fragment spreads. */
function rootFieldNames(
	document: DocumentNode,
	operation: OperationDefinitionNode,
): string[] {
	const fragments = new Map<string, FragmentDefinitionNode>();
	for (const definition of document.definitions) {
		if (definition.kind === Kind.FRAGMENT_DEFINITION) {
			fragments.set(definition.name.value, definition);
		}
	}

	const names: string[] = [];
	const collect = (selections: readonly SelectionNode[], seen: Set<string>) => {
		for (const selection of selections) {
			switch (selection.kind) {
				case Kind.FIELD:
					names.push(selection.name.value);
					break;
				case Kind.INLINE_FRAGMENT:
					collect(selection.selectionSet.selections, seen);
					break;
				case Kind.FRAGMENT_SPREAD: {
					const fragmentName = selection.name.value;
					// `seen` also guards a cyclic spread from recursing forever.
					if (seen.has(fragmentName)) break;
					const fragment = fragments.get(fragmentName);
					if (!fragment) break;
					seen.add(fragmentName);
					collect(fragment.selectionSet.selections, seen);
					break;
				}
			}
		}
	};

	collect(operation.selectionSet.selections, new Set());
	return names;
}

/**
 * The unique areas a successful mutation invalidates.
 *
 * Returns an empty list when the operation is not a mutation or the result
 * carries errors — a failed mutation has changed nothing a view should refetch.
 */
export function areasForMutation(
	document: DocumentNode,
	result: ExecutionResult,
	operationName?: string | null,
): ChangeArea[] {
	if (result.errors && result.errors.length > 0) return [];

	const areas = new Set<ChangeArea>();
	for (const definition of document.definitions) {
		if (definition.kind !== Kind.OPERATION_DEFINITION) continue;
		if (definition.operation !== "mutation") continue;
		if (
			operationName &&
			definition.name?.value &&
			definition.name.value !== operationName
		) {
			continue;
		}
		for (const field of rootFieldNames(document, definition)) {
			const area = MUTATION_AREAS[field];
			if (area) areas.add(area);
		}
	}
	return [...areas];
}

/** Publish the areas a successful mutation invalidated, if a bus is present. */
export function publishMutationAreas(
	result: ExecutionResult,
	input: {
		document: DocumentNode;
		operationName?: string | null;
		bus?: { publish(area: ChangeArea): void };
	},
): void {
	if (!input.bus) return;
	for (const area of areasForMutation(
		input.document,
		result,
		input.operationName,
	)) {
		input.bus.publish(area);
	}
}
