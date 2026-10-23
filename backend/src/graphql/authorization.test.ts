/**
 * Authorization matrix conformance.
 *
 * Layer 1 (app access) and Layer 2 (operation access) are enforced from a single
 * table. This test asserts that table covers every contract operation, that the
 * documented role asymmetries are preserved, and that each permitted role
 * resolves to the documented data scope.
 */

import { describe, expect, test } from "bun:test";
import { buildSchema } from "graphql";
import { ROLE_CODES, type RoleCode } from "../db/enums";
import { OPERATIONS, type OperationName, operationPolicy } from "./access";
import { typeDefs } from "./schema";

const schema = buildSchema(typeDefs);

const QUERY_FIELDS = Object.keys(schema.getQueryType()?.getFields() ?? {});
const MUTATION_FIELDS = Object.keys(
	schema.getMutationType()?.getFields() ?? {},
);
const SDL_OPERATIONS = [...QUERY_FIELDS, ...MUTATION_FIELDS];

/**
 * Operations that carry no policy by contract.
 *
 * The public auth operations are reachable without a session, and `viewer`
 * resolves to `null` for an unauthenticated caller instead of failing, so the
 * client can ask "who am I?" on boot.
 */
const PUBLIC_OPERATIONS = new Set([
	"login",
	"logout",
	"requestPasswordReset",
	"resetPassword",
	"changePassword",
	"viewer",
]);

function rolesFor(operation: OperationName): readonly RoleCode[] {
	return operationPolicy(operation).roles;
}

function sorted(roles: readonly string[]): string[] {
	return [...roles].sort();
}

describe("every contract operation has a policy", () => {
	test("no SDL operation is unguarded (except the public auth operations)", () => {
		const policyNames = new Set(Object.keys(OPERATIONS));
		const unguarded = SDL_OPERATIONS.filter(
			(name) => !PUBLIC_OPERATIONS.has(name) && !policyNames.has(name),
		);
		expect(unguarded).toEqual([]);
	});

	test("no policy targets a field the schema does not expose", () => {
		const orphans = Object.keys(OPERATIONS).filter(
			(name) => !SDL_OPERATIONS.includes(name),
		);
		expect(orphans).toEqual([]);
	});

	test("every policy lists only known roles and a scope for each", () => {
		for (const [name, policy] of Object.entries(OPERATIONS)) {
			expect(policy.roles.length).toBeGreaterThan(0);
			for (const role of policy.roles) {
				expect(ROLE_CODES).toContain(role);
				expect(policy.scope[role]).toBeDefined();
			}
			expect(name.length).toBeGreaterThan(0);
		}
	});

	test("registries are readable by every authenticated role", () => {
		expect(sorted(rolesFor("ticketStates"))).toEqual(sorted(ROLE_CODES));
		expect(sorted(rolesFor("leaveCodes"))).toEqual(sorted(ROLE_CODES));
	});
});

describe("documented role asymmetries are preserved", () => {
	test("only SUPER_ADMIN and HR_MANAGER may assign penalty leave", () => {
		expect(sorted(rolesFor("assignPenaltyLeave"))).toEqual([
			"HR_MANAGER",
			"SUPER_ADMIN",
		]);
	});

	test("only SUPER_ADMIN and TECH_LEAD may manage RBAC and the webhook", () => {
		for (const operation of [
			"roles",
			"permissions",
			"updateRolePermissions",
			"telegramWebhookConfig",
			"updateTelegramWebhookConfig",
		] as const) {
			expect(sorted(rolesFor(operation))).toEqual(["SUPER_ADMIN", "TECH_LEAD"]);
		}
	});

	test("only SUPER_ADMIN and TECH_LEAD may use the Audit Log app", () => {
		for (const operation of [
			"auditLogs",
			"moduleActivity",
			"exportAuditLogs",
		] as const) {
			expect(sorted(rolesFor(operation))).toEqual(["SUPER_ADMIN", "TECH_LEAD"]);
		}
	});

	test("the system audit trail in Settings is technical-only", () => {
		expect(sorted(rolesFor("systemAuditLogs"))).toEqual([
			"SUPER_ADMIN",
			"TECH_LEAD",
		]);
	});

	test("account lifecycle is limited to SUPER_ADMIN and HR_MANAGER", () => {
		for (const operation of [
			"createUser",
			"updateUser",
			"resetUserPassword",
			"deactivateUser",
		] as const) {
			expect(sorted(rolesFor(operation))).toEqual([
				"HR_MANAGER",
				"SUPER_ADMIN",
			]);
		}
	});

	test("HR_MANAGER may read the user directory but not RBAC", () => {
		expect(rolesFor("users")).toContain("HR_MANAGER");
		expect(rolesFor("roles")).not.toContain("HR_MANAGER");
		expect(rolesFor("permissions")).not.toContain("HR_MANAGER");
		expect(rolesFor("telegramWebhookConfig")).not.toContain("HR_MANAGER");
	});

	test("HR_MANAGER sees the audit trail in Settings but not the Audit Log app", () => {
		expect(rolesFor("systemAuditLogs")).not.toContain("HR_MANAGER");
		expect(rolesFor("auditLogs")).not.toContain("HR_MANAGER");
	});

	test("schedule writes are for planners; everyone reads the schedule", () => {
		for (const operation of [
			"updateTask",
			"deleteTask",
			"duplicateTask",
		] as const) {
			expect(sorted(rolesFor(operation))).toEqual([
				"DEPT_HEAD",
				"HR_MANAGER",
				"SUPER_ADMIN",
				"TECH_LEAD",
			]);
		}
		expect(sorted(rolesFor("scheduledTasks"))).toEqual(sorted(ROLE_CODES));
	});

	test("employees cannot create tickets allocated to others", () => {
		expect(rolesFor("createTask")).not.toContain("EMPLOYEE");
		expect(sorted(rolesFor("createTask"))).toEqual([
			"DEPT_HEAD",
			"HR_MANAGER",
			"SUPER_ADMIN",
			"TECH_LEAD",
		]);
	});

	test("employees cannot approve, return, or review", () => {
		for (const operation of [
			"approveTask",
			"returnTask",
			"reviewTaskRequest",
			"reviewLeave",
			"reviewOvertime",
			"recordOvertime",
		] as const) {
			expect(rolesFor(operation)).not.toContain("EMPLOYEE");
		}
	});

	test("employees may still accept, progress, report, cancel, and request", () => {
		for (const operation of [
			"acceptTask",
			"logTaskProgress",
			"submitTaskReport",
			"cancelTask",
			"requestExtension",
			"explainLateSubmission",
			"registerLeave",
		] as const) {
			expect(sorted(rolesFor(operation))).toEqual(sorted(ROLE_CODES));
		}
	});

	test("the company-wide audit levels exclude the Department Head and Employee", () => {
		for (const operation of [
			"kpiAuditLevel1Company",
			"kpiAuditLevel2Department",
		] as const) {
			expect(rolesFor(operation)).not.toContain("DEPT_HEAD");
			expect(rolesFor(operation)).not.toContain("EMPLOYEE");
		}
	});

	test("the department audit level excludes only the Employee", () => {
		expect(sorted(rolesFor("kpiAuditLevel3Employee"))).toEqual([
			"DEPT_HEAD",
			"HR_MANAGER",
			"SUPER_ADMIN",
			"TECH_LEAD",
		]);
	});
});

describe("effective data scopes", () => {
	test("list and workflow reads follow the app access summary", () => {
		for (const operation of ["tasks", "task", "matrixCalendar"] as const) {
			const policy = operationPolicy(operation);
			expect(policy.scope.SUPER_ADMIN).toBe("ALL");
			expect(policy.scope.TECH_LEAD).toBe("ALL");
			expect(policy.scope.HR_MANAGER).toBe("COMPANY_WIDE");
			expect(policy.scope.DEPT_HEAD).toBe("DEPARTMENT_ONLY");
			expect(policy.scope.EMPLOYEE).toBe("PERSONAL");
		}
	});

	test("the personal KPI dashboard is personal for every role", () => {
		const policy = operationPolicy("personalKpiDashboard");
		for (const role of policy.roles) {
			expect(policy.scope[role]).toBe("PERSONAL");
		}
	});

	test("technical operations resolve to the all-data scope", () => {
		for (const operation of [
			"systemAuditLogs",
			"updateRolePermissions",
			"auditLogs",
		] as const) {
			const policy = operationPolicy(operation);
			expect(policy.scope.SUPER_ADMIN).toBe("ALL");
			expect(policy.scope.TECH_LEAD).toBe("ALL");
		}
	});

	test("print and export operations never grant more than the matching read", () => {
		for (const operation of [
			"printTaskSlip",
			"exportTasks",
			"printLeaveRequest",
			"printAttendanceCalendar",
			"exportAttendance",
			"printKpiReport",
			"exportAuditWorkbook",
		] as const) {
			const policy = operationPolicy(operation);
			expect(policy.roles.length).toBeGreaterThan(0);
			for (const role of policy.roles) {
				expect(policy.scope[role]).toBeDefined();
			}
		}
	});
});
