/**
 * Print / export resolvers.
 *
 * Thin boundary between the GraphQL Mutation surface and the report engine in
 * `../../reports/exports`. Each field authorizes the caller first, delegates the
 * scoped work, and maps the created `export_artifacts` row onto the contract's
 * `ExportResult`.
 */

import type { Auth } from "../../auth";
import {
	type AttendanceCalendarInput,
	type AttendanceExportFilter,
	type AuditWorkbookFilter,
	exportAttendance,
	exportAuditWorkbook,
	exportTasks,
	printAttendanceCalendar,
	printKpiReport,
	printLeaveRequest,
	printTaskSlip,
	type TaskExportFilter,
} from "../../reports/exports";
import { exportSchedule, taskImportTemplate } from "../../reports/schedule";
import { authorize } from "../access";
import type { ViewerContext } from "../context";
import { toExportResult } from "../shapes";

type Resolver = (
	parent: unknown,
	args: any,
	contextValue: { ctx: ViewerContext; auth: Auth },
	info: unknown,
) => unknown;

export const reportsMutation: Record<string, Resolver> = {
	exportSchedule: async (_parent, args, contextValue) => {
		const { ctx } = contextValue;
		const scope = authorize(ctx, "exportSchedule");
		return toExportResult(
			await exportSchedule(ctx, scope, args.input, args.format ?? null),
		);
	},

	taskImportTemplate: async (_parent, args, contextValue) => {
		const { ctx } = contextValue;
		authorize(ctx, "taskImportTemplate");
		return toExportResult(await taskImportTemplate(ctx, args.format ?? null));
	},

	printTaskSlip: async (_parent, args, contextValue) => {
		const { ctx } = contextValue;
		authorize(ctx, "printTaskSlip");
		const row = await printTaskSlip(ctx, { taskId: args.taskId as string });
		return toExportResult(row);
	},

	exportTasks: async (_parent, args, contextValue) => {
		const { ctx } = contextValue;
		authorize(ctx, "exportTasks");
		const row = await exportTasks(ctx, {
			filter: (args.filter ?? null) as TaskExportFilter | null,
			format: args.format ?? null,
		});
		return toExportResult(row);
	},

	printLeaveRequest: async (_parent, args, contextValue) => {
		const { ctx } = contextValue;
		authorize(ctx, "printLeaveRequest");
		const row = await printLeaveRequest(ctx, {
			leaveRequestId: args.leaveRequestId as string,
		});
		return toExportResult(row);
	},

	printAttendanceCalendar: async (_parent, args, contextValue) => {
		const { ctx } = contextValue;
		authorize(ctx, "printAttendanceCalendar");
		const row = await printAttendanceCalendar(ctx, {
			input: args.input as AttendanceCalendarInput,
		});
		return toExportResult(row);
	},

	exportAttendance: async (_parent, args, contextValue) => {
		const { ctx } = contextValue;
		authorize(ctx, "exportAttendance");
		const row = await exportAttendance(ctx, {
			filter: (args.filter ?? null) as AttendanceExportFilter | null,
			format: args.format ?? null,
		});
		return toExportResult(row);
	},

	printKpiReport: async (_parent, args, contextValue) => {
		const { ctx } = contextValue;
		authorize(ctx, "printKpiReport");
		const row = await printKpiReport(ctx, {
			input: args.input as { periodYear: number; periodMonth: number },
		});
		return toExportResult(row);
	},

	exportAuditWorkbook: async (_parent, args, contextValue) => {
		const { ctx } = contextValue;
		authorize(ctx, "exportAuditWorkbook");
		const row = await exportAuditWorkbook(ctx, {
			filter: args.filter as AuditWorkbookFilter,
		});
		return toExportResult(row);
	},
};
