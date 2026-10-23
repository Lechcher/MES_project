/**
 * Contract conformance for the GraphQL schema.
 *
 * The SDL is the API surface clients depend on, so this test asserts that every
 * documented operation and enum token is present and unchanged. It is the
 * automated half of "run the API contract checks".
 */

import { describe, expect, test } from "bun:test";
import { buildSchema, GraphQLEnumType } from "graphql";
import { typeDefs } from "./schema";

const schema = buildSchema(typeDefs);

const DOCUMENTED_QUERIES = [
	"viewer",
	"ticketStates",
	"leaveCodes",
	"projects",
	"project",
	"tasks",
	"task",
	"matrixCalendar",
	"scheduledTasks",
	"attendanceRecords",
	"leaveRequests",
	"leaveBalances",
	"overtimeRecords",
	"personalKpiDashboard",
	"kpiScoreEvents",
	"kpiPointRules",
	"kpiAuditLevel1Company",
	"kpiAuditLevel2Department",
	"kpiAuditLevel3Employee",
	"users",
	"user",
	"departments",
	"roles",
	"permissions",
	"systemAuditLogs",
	"appSettings",
	"telegramWebhookConfig",
	"notifications",
	"auditLogs",
	"moduleActivity",
] as const;

const DOCUMENTED_MUTATIONS = [
	"login",
	"logout",
	"requestPasswordReset",
	"resetPassword",
	"changePassword",
	"createTask",
	"acceptTask",
	"logTaskProgress",
	"submitTaskReport",
	"approveTask",
	"returnTask",
	"cancelTask",
	"requestExtension",
	"explainLateSubmission",
	"reviewTaskRequest",
	"submitTaskCompletionRequest",
	"reviewTaskCompletionRequest",
	"registerLeave",
	"reviewLeave",
	"assignPenaltyLeave",
	"recordOvertime",
	"reviewOvertime",
	"updateTask",
	"deleteTask",
	"duplicateTask",
	"previewTaskImport",
	"commitTaskImport",
	"createUser",
	"updateUser",
	"resetUserPassword",
	"deactivateUser",
	"createDepartment",
	"updateDepartment",
	"updateRolePermissions",
	"updateAppSetting",
	"updateTelegramWebhookConfig",
	"exportAuditLogs",
	"printTaskSlip",
	"exportTasks",
	"printLeaveRequest",
	"printAttendanceCalendar",
	"exportAttendance",
	"printKpiReport",
	"exportAuditWorkbook",
	"exportSchedule",
	"taskImportTemplate",
] as const;

function enumValues(name: string): string[] {
	const type = schema.getType(name);
	if (!(type instanceof GraphQLEnumType)) {
		throw new Error(`${name} is not an enum`);
	}
	return type.getValues().map((value) => value.name);
}

describe("versioned GraphQL transport", () => {
	test("declares the documented custom scalars", () => {
		for (const scalar of ["DateTime", "JSON", "Decimal"]) {
			expect(schema.getType(scalar)).toBeDefined();
		}
	});

	test("exposes every documented query", () => {
		const fields = Object.keys(schema.getQueryType()?.getFields() ?? {});
		for (const query of DOCUMENTED_QUERIES) {
			expect(fields).toContain(query);
		}
		expect(fields).toHaveLength(DOCUMENTED_QUERIES.length);
	});

	test("exposes every documented mutation", () => {
		const fields = Object.keys(schema.getMutationType()?.getFields() ?? {});
		for (const mutation of DOCUMENTED_MUTATIONS) {
			expect(fields).toContain(mutation);
		}
		expect(fields).toHaveLength(DOCUMENTED_MUTATIONS.length);
	});

	test("omits non-contractual apps", () => {
		const typeNames = Object.keys(schema.getTypeMap());
		for (const excluded of [
			"Recruitment",
			"Payroll",
			"Asset",
			"JobPosting",
			"Payslip",
		]) {
			expect(typeNames).not.toContain(excluded);
		}
	});
});

describe("enum codes are verbatim", () => {
	test("ticket states", () => {
		expect(enumValues("TicketStateCode")).toEqual([
			"REQ",
			"ACT",
			"PEN",
			"APP",
			"REJ",
			"CAN",
			"OVERDUE",
		]);
	});

	test("leave codes", () => {
		expect(enumValues("LeaveCode")).toEqual([
			"AL",
			"UAL",
			"SL",
			"USL",
			"PL",
			"ML",
			"CL",
			"EL",
			"LWP",
			"TOIL",
			"VTO",
		]);
	});

	test("roles, scopes and the remaining vocabularies", () => {
		expect(enumValues("RoleCode")).toEqual([
			"SUPER_ADMIN",
			"TECH_LEAD",
			"HR_MANAGER",
			"DEPT_HEAD",
			"EMPLOYEE",
		]);
		expect(enumValues("Scope")).toEqual([
			"ALL",
			"COMPANY_WIDE",
			"DEPARTMENT_ONLY",
			"PERSONAL",
		]);
		expect(enumValues("Priority")).toEqual(["LOW", "MEDIUM", "HIGH", "URGENT"]);
		expect(enumValues("TaskType")).toEqual(["HOURLY", "DAILY", "MULTI_DAY"]);
		expect(enumValues("ApprovalStatus")).toEqual([
			"PENDING",
			"APPROVED",
			"REJECTED",
		]);
		expect(enumValues("TaskRequestType")).toEqual([
			"EXTENSION",
			"LATE_EXPLANATION",
		]);
		expect(enumValues("NotificationStatus")).toEqual([
			"PENDING",
			"SENT",
			"FAILED",
		]);
		expect(enumValues("DepartmentType")).toEqual(["DEPARTMENT", "DIVISION"]);
		expect(enumValues("LeaveEntryType")).toEqual([
			"ACCRUAL",
			"USAGE",
			"ADJUSTMENT",
			"EXPIRY",
			"CARRY_OVER",
		]);
		expect(enumValues("LeaveCategory")).toEqual([
			"PAID",
			"UNPAID",
			"INSURANCE",
			"SPECIAL",
		]);
		expect(enumValues("ExportFormat")).toEqual(["PDF", "XLSX", "CSV"]);
		expect(enumValues("TaskStateBadge")).toEqual([
			"URGENT_PROCESSING",
			"PROGRESS_UPDATE",
			"AWAITING_EXTENSION_APPROVAL",
			"AWAITING_PROGRESS_VERIFICATION",
		]);
	});
});

describe("pagination and export shapes", () => {
	test("OffsetPageInfo carries the documented fields", () => {
		const type = schema.getType("OffsetPageInfo");
		const fields =
			type && "getFields" in type ? Object.keys(type.getFields()) : [];
		expect(fields.sort()).toEqual([
			"hasNextPage",
			"limit",
			"offset",
			"totalCount",
		]);
	});

	test("every connection exposes nodes and pageInfo", () => {
		for (const connection of [
			"TaskConnection",
			"ProjectConnection",
			"AttendanceRecordConnection",
			"LeaveRequestConnection",
			"OvertimeRecordConnection",
			"KpiScoreEventConnection",
			"KpiAuditLevel1Connection",
			"KpiAuditLevel2Connection",
			"KpiAuditLevel3Connection",
			"UserConnection",
			"SystemAuditLogConnection",
			"NotificationConnection",
		]) {
			const type = schema.getType(connection);
			const fields =
				type && "getFields" in type ? Object.keys(type.getFields()) : [];
			expect(fields.sort()).toEqual(["nodes", "pageInfo"]);
		}
	});

	test("ExportResult carries the documented fields", () => {
		const type = schema.getType("ExportResult");
		const fields =
			type && "getFields" in type ? Object.keys(type.getFields()) : [];
		expect(fields.sort()).toEqual([
			"createdAt",
			"fileName",
			"format",
			"id",
			"mimeType",
			"url",
		]);
	});

	test("list operations default to offset 0 and limit 20", () => {
		const tasksField = schema.getQueryType()?.getFields().tasks;
		const args = tasksField?.args ?? [];
		const byName = new Map(args.map((arg) => [arg.name, arg]));
		expect(byName.get("offset")?.defaultValue).toBe(0);
		expect(byName.get("limit")?.defaultValue).toBe(20);
	});
});
