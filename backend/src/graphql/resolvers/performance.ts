/**
 * Performance & Audit resolvers.
 *
 * Thin boundary: authorize the operation first, delegate the read to the
 * deterministic KPI domain, then map persisted rows onto the contract's shapes.
 * The KPI write path lives in the domain, so this module owns no mutations.
 */

import type { Auth } from "../../auth";
import {
	getAuditLevel1,
	getAuditLevel2,
	getAuditLevel3,
	getKpiScoreEvents,
	getPersonalDashboard,
	type KpiMonth,
	listKpiPointRules,
	validateMonthSelection,
} from "../../domain/kpi";
import { authorize } from "../access";
import type { ViewerContext } from "../context";
import {
	loadDepartment,
	loadUser,
	pagination,
	toDepartment,
	toKpiPointRule,
	toKpiScoreEvent,
	toUser,
} from "../shapes";

type Resolver = (
	parent: unknown,
	args: any,
	contextValue: { ctx: ViewerContext; auth: Auth },
	info: unknown,
) => unknown;

/**
 * The months a Performance operation selects.
 *
 * The schema requires a non-empty list, so a missing or empty list is a
 * validation failure rather than an empty read.
 */
function selectedMonths(input: unknown): KpiMonth[] {
	const months = (input as { months?: KpiMonth[] } | undefined)?.months ?? [];
	return validateMonthSelection(months);
}

/** The months and the department narrowing an audit filter carries. */
function auditFilter(filter: unknown): {
	months: KpiMonth[];
	departmentId: string | null;
} {
	const source = (filter ?? {}) as {
		months?: KpiMonth[];
		departmentId?: string | null;
	};
	return {
		months: validateMonthSelection(source.months ?? []),
		departmentId: source.departmentId ?? null,
	};
}

async function auditUser(userId: string, ctx: ViewerContext) {
	const row = await loadUser(ctx, userId);
	return row ? toUser(row) : null;
}

async function auditDepartment(
	departmentId: string | null,
	ctx: ViewerContext,
) {
	const row = await loadDepartment(ctx, departmentId);
	return row ? toDepartment(row) : null;
}

const queryResolvers: Record<string, Resolver> = {
	personalKpiDashboard: async (_parent, args, { ctx }) => {
		authorize(ctx, "personalKpiDashboard");
		const viewer = ctx.viewer;
		if (!viewer) return null;

		const months = selectedMonths(args?.input);
		const dashboard = await getPersonalDashboard(ctx, months);

		const viewerRow = await loadUser(ctx, viewer.id);
		const viewerShape = viewerRow ? toUser(viewerRow) : null;

		return {
			months: dashboard.months,
			totalKpiScore: dashboard.totalKpiScore,
			monthlyTotals: dashboard.monthlyTotals,
			summary: dashboard.summary,
			leaveBalances: dashboard.leaveBalances.map((balance) => ({
				user: viewerShape,
				leaveCode: balance.leaveCode,
				leaveName: balance.leaveName,
				balanceDays: balance.balanceDays,
			})),
			recentEvents: dashboard.recentEvents.map(toKpiScoreEvent),
		};
	},

	kpiScoreEvents: async (_parent, args, { ctx }) => {
		authorize(ctx, "kpiScoreEvents");
		const offset = args?.offset ?? 0;
		const limit = args?.limit ?? 20;
		const { rows, totalCount } = await getKpiScoreEvents(
			ctx,
			selectedMonths(args?.input),
			offset,
			limit,
		);
		return {
			nodes: rows.map(toKpiScoreEvent),
			pageInfo: pagination(offset, limit, totalCount),
		};
	},

	kpiPointRules: async (_parent, _args, { ctx }) => {
		authorize(ctx, "kpiPointRules");
		const rows = await listKpiPointRules(ctx);
		return rows.map(toKpiPointRule);
	},

	kpiAuditLevel1Company: async (_parent, args, { ctx }) => {
		authorize(ctx, "kpiAuditLevel1Company");
		const offset = args?.offset ?? 0;
		const limit = args?.limit ?? 20;
		const { rows, totalCount } = await getAuditLevel1(
			ctx,
			auditFilter(args?.filter),
			offset,
			limit,
		);

		const nodes = await Promise.all(
			rows.map(async (row) => {
				const userRow = await loadUser(ctx, row.userId);
				return {
					periodYear: row.periodYear,
					periodMonth: row.periodMonth,
					user: userRow ? toUser(userRow) : null,
					department: await auditDepartment(userRow?.departmentId ?? null, ctx),
					totalTasksAssigned: row.totalTasksAssigned,
					completedOnTime: row.completedOnTime,
					overdueTasks: row.overdueTasks,
					unapprovedLeaveCount: row.unapprovedLeaveCount,
					perfectAttendanceBonus: row.perfectAttendanceBonus,
					attendanceRate: row.attendanceRate,
					totalKpiScore: row.totalKpiScore,
				};
			}),
		);

		return { nodes, pageInfo: pagination(offset, limit, totalCount) };
	},

	kpiAuditLevel2Department: async (_parent, args, { ctx }) => {
		authorize(ctx, "kpiAuditLevel2Department");
		const { rows } = await getAuditLevel2(ctx, auditFilter(args?.filter));

		const nodes = await Promise.all(
			rows.map(async (row) => ({
				periodYear: row.periodYear,
				periodMonth: row.periodMonth,
				department: await auditDepartment(row.departmentId, ctx),
				totalEmployees: row.totalEmployees,
				totalTasksAssigned: row.totalTasksAssigned,
				avgAttendanceRate: row.avgAttendanceRate,
				avgDepartmentKpiScore: row.avgDepartmentKpiScore,
			})),
		);

		return {
			nodes,
			pageInfo: pagination(0, rows.length, rows.length),
		};
	},

	kpiAuditLevel3Employee: async (_parent, args, { ctx }) => {
		authorize(ctx, "kpiAuditLevel3Employee");
		const offset = args?.offset ?? 0;
		const limit = args?.limit ?? 20;
		const { rows, totalCount } = await getAuditLevel3(
			ctx,
			auditFilter(args?.filter),
			args?.orderBy ?? null,
			offset,
			limit,
		);

		const nodes = await Promise.all(
			rows.map(async (row) => ({
				periodYear: row.periodYear,
				periodMonth: row.periodMonth,
				user: await auditUser(row.userId, ctx),
				department: await auditDepartment(row.departmentId, ctx),
				totalTasksAssigned: row.totalTasksAssigned,
				completedOnTime: row.completedOnTime,
				overdueTasks: row.overdueTasks,
				immediateApprovalCount: row.immediateApprovalCount,
				returnedCount: row.returnedCount,
				perfectAttendanceBonus: row.perfectAttendanceBonus,
				attendanceRate: row.attendanceRate,
				totalKpiScore: row.totalKpiScore,
			})),
		);

		return { nodes, pageInfo: pagination(offset, limit, totalCount) };
	},
};

/** The assembled schema declares the resolver context as `unknown`. */
type AssembledResolver = (
	parent: unknown,
	args: any,
	contextValue: unknown,
	info: unknown,
) => unknown;

export const performanceQuery = queryResolvers as Record<
	string,
	AssembledResolver
>;

/** The Performance module contributes no mutations. */
const mutationResolvers: Record<string, Resolver> = {};

export const performanceMutation = mutationResolvers as Record<
	string,
	AssembledResolver
>;
