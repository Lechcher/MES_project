/**
 * Tool result shaping.
 *
 * Domain rows are wide; a tool result must be small enough that the model
 * reads it cheaply and cannot mistake internal columns (ids, foreign keys,
 * audit bookkeeping) for answer material. Each renderer keeps the fields a
 * person would name and drops the rest.
 */

import type {
	AttendanceRecordRow,
	KpiScoreEventRow,
	NotificationRow,
	ProjectRow,
	TaskRow,
} from "../../db/schema";

function date(value: Date | null | undefined): string | null {
	return value instanceof Date ? value.toISOString().slice(0, 10) : null;
}

export const renderToolResult = {
	tasks(rows: TaskRow[], totalCount: number) {
		return {
			totalCount,
			tickets: rows.map((row) => ({
				code: row.taskCode,
				title: row.title,
				state: row.state,
				priority: row.priority,
				type: row.taskType,
				progressPercent: row.progressPercentage,
				due: row.endDate,
				overdue: row.isOverdue,
			})),
		};
	},

	projects(rows: ProjectRow[], totalCount: number) {
		return {
			totalCount,
			projects: rows.map((row) => ({
				code: row.code,
				name: row.name,
				active: row.isActive,
			})),
		};
	},

	project(row: ProjectRow) {
		return {
			project: {
				code: row.code,
				name: row.name,
				description: row.description,
				active: row.isActive,
			},
		};
	},

	kpiDashboard(dashboard: unknown) {
		// The dashboard type is the Performance module's own view; it is
		// already presentation-shaped, so it passes through with only the
		// internal bookkeeping trimmed.
		return { dashboard };
	},

	kpiEvents(rows: KpiScoreEventRow[], totalCount: number) {
		return {
			totalCount,
			events: rows.map((row) => ({
				period: `${row.periodYear}-${String(row.periodMonth).padStart(2, "0")}`,
				points: row.points,
				rule: row.ruleCode,
				note: row.note,
			})),
		};
	},

	attendance(rows: AttendanceRecordRow[], totalCount: number) {
		return {
			totalCount,
			records: rows.map((row) => ({
				date: row.workDate,
				late: row.isLate,
				earlyLeave: row.isEarlyLeave,
				leaveCode: row.leaveCode,
				note: row.note,
			})),
		};
	},

	leaveRequests(
		rows: {
			id: string;
			leaveCode: string;
			startDate: string;
			endDate: string;
			status: string;
			reason: string;
		}[],
		totalCount: number,
	) {
		return {
			totalCount,
			requests: rows.map((row) => ({
				code: row.leaveCode,
				start: row.startDate,
				end: row.endDate,
				status: row.status,
				reason: row.reason,
			})),
		};
	},

	leaveBalances(rows: unknown[]) {
		return { balances: rows };
	},

	notifications(rows: NotificationRow[], totalCount: number) {
		return {
			totalCount,
			notifications: rows.map((row) => ({
				template: row.template,
				channel: row.channel,
				status: row.status,
				related: row.relatedType
					? `${row.relatedType}:${row.relatedId ?? ""}`
					: null,
				createdAt: date(row.createdAt),
			})),
		};
	},

	auditEvents(
		rows: {
			id: string;
			action: string;
			moduleCode: string | null;
			createdAt: Date;
		}[],
		totalCount: number,
	) {
		return {
			totalCount,
			events: rows.map((row) => ({
				action: row.action,
				module: row.moduleCode,
				at: date(row.createdAt),
			})),
		};
	},
};
