/**
 * Two-layer authorization.
 *
 * Layer 1 gates app access and Layer 2 gates the individual operation. Both are
 * driven by the same role model, and both are enforced on the server for every
 * protected query and mutation — never only in the client.
 *
 * Each operation declares the roles that may invoke it; each role resolves to an
 * effective data scope. Reads and writes are then restricted to that scope.
 */

import type { RoleCode } from "../db/enums";
import type { ViewerContext } from "./context";
import { errors } from "./errors";

export const SCOPES = [
	"ALL",
	"COMPANY_WIDE",
	"DEPARTMENT_ONLY",
	"PERSONAL",
] as const;
export type DataScope = (typeof SCOPES)[number];

const ALL_ROLES: readonly RoleCode[] = [
	"SUPER_ADMIN",
	"TECH_LEAD",
	"HR_MANAGER",
	"DEPT_HEAD",
	"EMPLOYEE",
];

const APPROVERS: readonly RoleCode[] = [
	"SUPER_ADMIN",
	"TECH_LEAD",
	"HR_MANAGER",
	"DEPT_HEAD",
];

const TECHNICAL: readonly RoleCode[] = ["SUPER_ADMIN", "TECH_LEAD"];

const ACCOUNT_MANAGERS: readonly RoleCode[] = ["SUPER_ADMIN", "HR_MANAGER"];

/**
 * Per-operation policy.
 *
 * `scope` maps each permitted role to its effective data scope. Roles absent
 * from the map are not permitted (Layer 1 + Layer 2 entry check).
 */
export interface OperationPolicy {
	readonly roles: readonly RoleCode[];
	readonly scope: Partial<Record<RoleCode, DataScope>>;
}

/** Scope lookup shared by the app-level read operations. */
const APP_SCOPE: Partial<Record<RoleCode, DataScope>> = {
	SUPER_ADMIN: "ALL",
	TECH_LEAD: "ALL",
	HR_MANAGER: "COMPANY_WIDE",
	DEPT_HEAD: "DEPARTMENT_ONLY",
	EMPLOYEE: "PERSONAL",
};

const TECHNICAL_SCOPE: Partial<Record<RoleCode, DataScope>> = {
	SUPER_ADMIN: "ALL",
	TECH_LEAD: "ALL",
};

const PERSONAL_SCOPE: Partial<Record<RoleCode, DataScope>> = {
	SUPER_ADMIN: "PERSONAL",
	TECH_LEAD: "PERSONAL",
	HR_MANAGER: "PERSONAL",
	DEPT_HEAD: "PERSONAL",
	EMPLOYEE: "PERSONAL",
};

export const OPERATIONS = {
	// Registries — every authenticated role.
	ticketStates: { roles: ALL_ROLES, scope: APP_SCOPE },
	leaveCodes: { roles: ALL_ROLES, scope: APP_SCOPE },

	// Jobs
	projects: { roles: APPROVERS, scope: APP_SCOPE },
	project: { roles: APPROVERS, scope: APP_SCOPE },
	tasks: { roles: ALL_ROLES, scope: APP_SCOPE },
	task: { roles: ALL_ROLES, scope: APP_SCOPE },
	createTask: { roles: APPROVERS, scope: APP_SCOPE },
	acceptTask: { roles: ALL_ROLES, scope: APP_SCOPE },
	logTaskProgress: { roles: ALL_ROLES, scope: APP_SCOPE },
	submitTaskReport: { roles: ALL_ROLES, scope: APP_SCOPE },
	approveTask: { roles: APPROVERS, scope: APP_SCOPE },
	returnTask: { roles: APPROVERS, scope: APP_SCOPE },
	cancelTask: { roles: ALL_ROLES, scope: APP_SCOPE },
	requestExtension: { roles: ALL_ROLES, scope: APP_SCOPE },
	explainLateSubmission: { roles: ALL_ROLES, scope: APP_SCOPE },
	reviewTaskRequest: { roles: APPROVERS, scope: APP_SCOPE },
	submitTaskCompletionRequest: { roles: ALL_ROLES, scope: APP_SCOPE },
	reviewTaskCompletionRequest: { roles: APPROVERS, scope: APP_SCOPE },

	// Planning
	matrixCalendar: { roles: ALL_ROLES, scope: APP_SCOPE },
	scheduledTasks: { roles: ALL_ROLES, scope: APP_SCOPE },
	updateTask: { roles: APPROVERS, scope: APP_SCOPE },
	deleteTask: { roles: APPROVERS, scope: APP_SCOPE },
	duplicateTask: { roles: APPROVERS, scope: APP_SCOPE },
	previewTaskImport: { roles: APPROVERS, scope: APP_SCOPE },
	commitTaskImport: { roles: APPROVERS, scope: APP_SCOPE },
	attendanceRecords: { roles: ALL_ROLES, scope: APP_SCOPE },
	leaveRequests: { roles: ALL_ROLES, scope: APP_SCOPE },
	leaveBalances: { roles: ALL_ROLES, scope: APP_SCOPE },
	overtimeRecords: { roles: ALL_ROLES, scope: APP_SCOPE },
	registerLeave: { roles: ALL_ROLES, scope: APP_SCOPE },
	reviewLeave: { roles: APPROVERS, scope: APP_SCOPE },
	assignPenaltyLeave: { roles: ACCOUNT_MANAGERS, scope: APP_SCOPE },
	recordOvertime: { roles: APPROVERS, scope: APP_SCOPE },
	reviewOvertime: { roles: APPROVERS, scope: APP_SCOPE },

	// Performance
	personalKpiDashboard: { roles: ALL_ROLES, scope: PERSONAL_SCOPE },
	kpiScoreEvents: { roles: ALL_ROLES, scope: APP_SCOPE },
	kpiPointRules: { roles: ALL_ROLES, scope: APP_SCOPE },
	kpiAuditLevel1Company: {
		roles: ["SUPER_ADMIN", "TECH_LEAD", "HR_MANAGER"],
		scope: APP_SCOPE,
	},
	kpiAuditLevel2Department: {
		roles: ["SUPER_ADMIN", "TECH_LEAD", "HR_MANAGER"],
		scope: APP_SCOPE,
	},
	kpiAuditLevel3Employee: { roles: APPROVERS, scope: APP_SCOPE },

	// Settings & IAM
	users: {
		roles: ["SUPER_ADMIN", "TECH_LEAD", "HR_MANAGER"],
		scope: APP_SCOPE,
	},
	user: { roles: ALL_ROLES, scope: APP_SCOPE },
	departments: { roles: APPROVERS, scope: APP_SCOPE },
	roles: { roles: TECHNICAL, scope: TECHNICAL_SCOPE },
	permissions: { roles: TECHNICAL, scope: TECHNICAL_SCOPE },
	createUser: { roles: ACCOUNT_MANAGERS, scope: APP_SCOPE },
	updateUser: { roles: ACCOUNT_MANAGERS, scope: APP_SCOPE },
	resetUserPassword: { roles: ACCOUNT_MANAGERS, scope: APP_SCOPE },
	deactivateUser: { roles: ACCOUNT_MANAGERS, scope: APP_SCOPE },
	createDepartment: { roles: TECHNICAL, scope: TECHNICAL_SCOPE },
	updateDepartment: { roles: TECHNICAL, scope: TECHNICAL_SCOPE },
	updateRolePermissions: { roles: TECHNICAL, scope: TECHNICAL_SCOPE },
	systemAuditLogs: { roles: TECHNICAL, scope: TECHNICAL_SCOPE },
	appSettings: { roles: TECHNICAL, scope: TECHNICAL_SCOPE },
	updateAppSetting: { roles: TECHNICAL, scope: TECHNICAL_SCOPE },
	telegramWebhookConfig: { roles: TECHNICAL, scope: TECHNICAL_SCOPE },
	updateTelegramWebhookConfig: { roles: TECHNICAL, scope: TECHNICAL_SCOPE },
	notifications: {
		roles: ["SUPER_ADMIN", "TECH_LEAD", "HR_MANAGER"],
		scope: APP_SCOPE,
	},

	// Audit Log
	auditLogs: { roles: TECHNICAL, scope: TECHNICAL_SCOPE },
	moduleActivity: { roles: TECHNICAL, scope: TECHNICAL_SCOPE },
	exportAuditLogs: { roles: TECHNICAL, scope: TECHNICAL_SCOPE },

	// Print / export
	printTaskSlip: { roles: ALL_ROLES, scope: APP_SCOPE },
	exportTasks: { roles: ALL_ROLES, scope: APP_SCOPE },
	exportSchedule: { roles: ALL_ROLES, scope: APP_SCOPE },
	taskImportTemplate: { roles: APPROVERS, scope: APP_SCOPE },
	printLeaveRequest: { roles: ALL_ROLES, scope: APP_SCOPE },
	printAttendanceCalendar: { roles: ALL_ROLES, scope: APP_SCOPE },
	exportAttendance: { roles: ALL_ROLES, scope: APP_SCOPE },
	printKpiReport: { roles: ALL_ROLES, scope: PERSONAL_SCOPE },
	exportAuditWorkbook: { roles: APPROVERS, scope: APP_SCOPE },
} as const satisfies Record<string, OperationPolicy>;

export type OperationName = keyof typeof OPERATIONS;

export function operationPolicy(operation: OperationName): OperationPolicy {
	return OPERATIONS[operation];
}

/** Require an authenticated viewer. */
export function requireViewer(
	ctx: ViewerContext,
): NonNullable<ViewerContext["viewer"]> {
	if (!ctx.viewer) {
		throw errors.unauthenticated();
	}
	return ctx.viewer;
}

/**
 * Enforce Layer 1 + Layer 2 access for an operation and return the caller's
 * effective data scope.
 */
export function authorize(
	ctx: ViewerContext,
	operation: OperationName,
): DataScope {
	const viewer = requireViewer(ctx);
	const policy = operationPolicy(operation);

	const matchedRole = viewer.roleCodes.find((role) =>
		policy.roles.includes(role),
	);
	if (!matchedRole) {
		throw errors.forbidden(
			`You do not have permission to perform ${operation}.`,
			{
				requiredRoles: policy.roles,
			},
		);
	}

	return policy.scope[matchedRole] ?? "PERSONAL";
}

/** All roles the viewer holds, in privilege order. */
export function viewerRoles(ctx: ViewerContext): readonly RoleCode[] {
	return requireViewer(ctx).roleCodes;
}

/** True when the viewer holds any of the given roles. */
export function hasRole(ctx: ViewerContext, ...roles: RoleCode[]): boolean {
	const held = requireViewer(ctx).roleCodes;
	return roles.some((role) => held.includes(role));
}

/**
 * Resolve the department an operation must be scoped to, or `null` for
 * unrestricted scopes. Throws when a department-scoped caller has no department.
 */
export function scopedDepartmentId(
	ctx: ViewerContext,
	scope: DataScope,
): string | null {
	if (scope === "ALL" || scope === "COMPANY_WIDE") return null;
	if (scope === "PERSONAL") return null;
	const viewer = requireViewer(ctx);
	if (!viewer.departmentId) {
		throw errors.forbidden(
			"Your account has no department, so department-scoped data is unavailable.",
		);
	}
	return viewer.departmentId;
}

/** Scope a user-id filter for PERSONAL callers. */
export function scopedUserId(
	ctx: ViewerContext,
	scope: DataScope,
): string | null {
	if (scope !== "PERSONAL") return null;
	return requireViewer(ctx).id;
}
