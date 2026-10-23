/**
 * Planning & Attendance GraphQL resolvers.
 *
 * Thin adapters over `domain/planning.ts`: each resolver gates the operation
 * with the shared access policy, delegates the business rule to the domain
 * service, and maps the persisted rows onto the contract's shapes. Date-only
 * columns stored as `YYYY-MM-DD` text are converted to `DateTime` values here.
 */

import type { Auth } from "../../auth";
import type {
	AttendanceRecordRow,
	LeaveRequestRow,
	OvertimeRecordRow,
	UserRow,
} from "../../db/schema";
import {
	type AssignPenaltyLeaveInput,
	type AttendanceFilterInput,
	assignPenaltyLeave,
	attendanceRecords,
	type LeaveRequestFilterInput,
	leaveBalances,
	leaveRequests,
	type MatrixCalendarInput,
	matrixCalendar,
	overtimeRecords,
	type RecordOvertimeInput,
	type RegisterLeaveInput,
	type ReviewLeaveInput,
	type ReviewOvertimeInput,
	recordOvertime,
	registerLeave,
	reviewLeave,
	reviewOvertime,
} from "../../domain/planning";
import { authorize } from "../access";
import type { ViewerContext } from "../context";
import {
	loadDepartment,
	loadUser,
	pagination,
	parseDate,
	toAttendanceRecord,
	toDepartment,
	toLeaveRequest,
	toOvertimeRecord,
	toUser,
} from "../shapes";

type Resolver = (
	parent: unknown,
	args: any,
	contextValue: { ctx: ViewerContext; auth: Auth },
	info: unknown,
) => unknown;

/** The assembled schema declares the resolver context as `unknown`. */
type AssembledResolver = (
	parent: unknown,
	args: any,
	contextValue: unknown,
	info: unknown,
) => unknown;

function attendanceShape(row: AttendanceRecordRow) {
	return { ...toAttendanceRecord(row), workDate: parseDate(row.workDate) };
}

function leaveRequestShape(row: LeaveRequestRow) {
	return {
		...toLeaveRequest(row),
		startDate: parseDate(row.startDate),
		endDate: parseDate(row.endDate),
	};
}

function overtimeShape(row: OvertimeRecordRow) {
	return { ...toOvertimeRecord(row), workDate: parseDate(row.workDate) };
}

function pageArgs(args: { offset?: number | null; limit?: number | null }): {
	offset: number;
	limit: number;
} {
	return { offset: args.offset ?? 0, limit: args.limit ?? 20 };
}

const queryResolvers: Record<string, Resolver> = {
	async matrixCalendar(_parent, args, { ctx }) {
		authorize(ctx, "matrixCalendar");
		const view = await matrixCalendar(ctx, args.input as MatrixCalendarInput);

		const department = view.departmentId
			? await loadDepartment(ctx, view.departmentId)
			: null;

		const rows = await Promise.all(
			view.rows.map(async (row) => ({
				user: toUser((await loadUser(ctx, row.userId)) as UserRow),
				days: row.days,
			})),
		);

		return {
			department: department ? toDepartment(department) : null,
			fromDate: view.fromDate,
			toDate: view.toDate,
			rows,
		};
	},

	async attendanceRecords(_parent, args, { ctx }) {
		authorize(ctx, "attendanceRecords");
		const { offset, limit } = pageArgs(args);
		const { rows, totalCount } = await attendanceRecords(ctx, {
			filter: (args.filter ?? null) as AttendanceFilterInput | null,
			offset,
			limit,
		});
		return {
			nodes: rows.map(attendanceShape),
			pageInfo: pagination(offset, limit, totalCount),
		};
	},

	async leaveRequests(_parent, args, { ctx }) {
		authorize(ctx, "leaveRequests");
		const { offset, limit } = pageArgs(args);
		const { rows, totalCount } = await leaveRequests(ctx, {
			filter: (args.filter ?? null) as LeaveRequestFilterInput | null,
			offset,
			limit,
		});
		return {
			nodes: rows.map(leaveRequestShape),
			pageInfo: pagination(offset, limit, totalCount),
		};
	},

	async leaveBalances(_parent, args, { ctx }) {
		authorize(ctx, "leaveBalances");
		const balances = await leaveBalances(ctx, {
			userId: (args.userId ?? null) as string | null,
		});
		return Promise.all(
			balances.map(async (balance) => ({
				user: toUser((await loadUser(ctx, balance.userId)) as UserRow),
				leaveCode: balance.leaveCode,
				leaveName: balance.leaveName,
				balanceDays: balance.balanceDays,
			})),
		);
	},

	async overtimeRecords(_parent, args, { ctx }) {
		authorize(ctx, "overtimeRecords");
		const { offset, limit } = pageArgs(args);
		const { rows, totalCount } = await overtimeRecords(ctx, { offset, limit });
		return {
			nodes: rows.map(overtimeShape),
			pageInfo: pagination(offset, limit, totalCount),
		};
	},
};

const mutationResolvers: Record<string, Resolver> = {
	async registerLeave(_parent, args, { ctx }) {
		authorize(ctx, "registerLeave");
		const row = await registerLeave(ctx, args.input as RegisterLeaveInput);
		return leaveRequestShape(row);
	},

	async reviewLeave(_parent, args, { ctx }) {
		authorize(ctx, "reviewLeave");
		const row = await reviewLeave(ctx, args.input as ReviewLeaveInput);
		return leaveRequestShape(row);
	},

	async assignPenaltyLeave(_parent, args, { ctx }) {
		authorize(ctx, "assignPenaltyLeave");
		const row = await assignPenaltyLeave(
			ctx,
			args.input as AssignPenaltyLeaveInput,
		);
		return attendanceShape(row);
	},

	async recordOvertime(_parent, args, { ctx }) {
		authorize(ctx, "recordOvertime");
		const row = await recordOvertime(ctx, args.input as RecordOvertimeInput);
		return overtimeShape(row);
	},

	async reviewOvertime(_parent, args, { ctx }) {
		authorize(ctx, "reviewOvertime");
		const row = await reviewOvertime(ctx, args.input as ReviewOvertimeInput);
		return overtimeShape(row);
	},
};

export const planningQuery = queryResolvers as Record<
	string,
	AssembledResolver
>;

export const planningMutation = mutationResolvers as Record<
	string,
	AssembledResolver
>;
