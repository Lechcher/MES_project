/**
 * The agent's read-only tool set.
 *
 * Each tool is a thin, zod-schema'd wrapper over an existing domain query
 * function. That is the whole security model of the agent: there is no
 * text-to-SQL tool and no generic "run a query" tool — the only way the model
 * touches data is through the same functions the GraphQL resolvers call, with
 * the same `authorize()` enforcement and the same department scoping, running
 * as the linked viewer. A tool that would exceed the viewer's permissions
 * throws exactly as it does on the web surface.
 *
 * Tools return compact JSON, not prose: the model formats the answer, the
 * tool supplies the facts.
 */

import { tool } from "ai";
import { z } from "zod";
import { listAuditLogs } from "../../domain/audit-log";
import { getKpiScoreEvents, getPersonalDashboard } from "../../domain/kpi";
import {
	attendanceRecords,
	leaveBalances,
	leaveRequests,
} from "../../domain/planning";
import { listNotifications } from "../../domain/settings";
import { getProject, listProjects, listTasks } from "../../domain/tasks";
import { authorize } from "../../graphql/access";
import type { ViewerContext } from "../../graphql/context";
import { renderToolResult } from "./render-tools";

/** Build the fixed tool set for one viewer's context. */
export function buildTools(ctx: ViewerContext) {
	/**
	 * Search tickets. Runs through the tasks domain function with the
	 * viewer's effective scope, so an employee only ever sees their own
	 * tickets and a department head only their department's.
	 */
	const searchTasks = tool({
		description:
			"Search job tickets by free text (title/code) and/or state. Returns the tickets the signed-in viewer is allowed to see.",
		inputSchema: z.object({
			search: z
				.string()
				.optional()
				.describe("Text to match in the ticket title or code."),
			state: z
				.string()
				.optional()
				.describe(
					"Ticket state code: REQ, ACT, PEN, APP, REJ, CAN, or OVERDUE.",
				),
			limit: z.number().int().min(1).max(20).optional(),
		}),
		execute: async ({ search, state, limit }) => {
			const scope = authorize(ctx, "tasks");
			const page = await listTasks(ctx, scope, {
				filter: {
					search: search ?? null,
					state: (state ?? null) as never,
				},
				offset: 0,
				limit: limit ?? 10,
			});
			return renderToolResult.tasks(page.nodes, page.pageInfo.totalCount);
		},
	});

	const searchProjects = tool({
		description:
			"Search projects by name or code. Approver roles only, exactly as on the web surface.",
		inputSchema: z.object({
			search: z.string().optional(),
			limit: z.number().int().min(1).max(20).optional(),
		}),
		execute: async ({ search, limit }) => {
			const scope = authorize(ctx, "projects");
			const page = await listProjects(ctx, scope, {
				filter: { search: search ?? null },
				offset: 0,
				limit: limit ?? 10,
			});
			return renderToolResult.projects(page.nodes, page.pageInfo.totalCount);
		},
	});

	const getProjectDetail = tool({
		description: "Read one project with its department and status.",
		inputSchema: z.object({ projectId: z.string() }),
		execute: async ({ projectId }) => {
			const scope = authorize(ctx, "project");
			const project = await getProject(ctx, scope, projectId);
			return project ? renderToolResult.project(project) : { found: false };
		},
	});

	const listKpiSummary = tool({
		description:
			"The viewer's personal KPI summary for a month. Personal by design: never another person's score.",
		inputSchema: z.object({
			periodYear: z.number().int(),
			periodMonth: z.number().int().min(1).max(12),
		}),
		execute: async ({ periodYear, periodMonth }) => {
			const dashboard = await getPersonalDashboard(ctx, [
				{ periodYear, periodMonth },
			]);
			return renderToolResult.kpiDashboard(dashboard);
		},
	});

	const listKpiEvents = tool({
		description:
			"The viewer's KPI score events (what moved their score, and why).",
		inputSchema: z.object({
			periodYear: z.number().int().optional(),
			periodMonth: z.number().int().min(1).max(12).optional(),
			limit: z.number().int().min(1).max(20).optional(),
		}),
		execute: async ({ periodYear, periodMonth, limit }) => {
			const now = new Date();
			const month = periodMonth ?? now.getMonth() + 1;
			const year = periodYear ?? now.getFullYear();
			const page = await getKpiScoreEvents(
				ctx,
				[{ periodYear: year, periodMonth: month }],
				0,
				limit ?? 10,
			);
			return renderToolResult.kpiEvents(page.rows, page.totalCount);
		},
	});

	const listAttendance = tool({
		description:
			"Attendance records for a month. Scoped to the viewer exactly as on the web surface.",
		inputSchema: z.object({
			periodYear: z.number().int(),
			periodMonth: z.number().int().min(1).max(12),
			limit: z.number().int().min(1).max(20).optional(),
		}),
		execute: async ({ periodYear, periodMonth, limit }) => {
			const page = await attendanceRecords(ctx, {
				filter: {
					fromDate: `${periodYear}-${String(periodMonth).padStart(2, "0")}-01`,
					toDate: new Date(periodYear, periodMonth, 0)
						.toISOString()
						.slice(0, 10),
				},
				offset: 0,
				limit: limit ?? 10,
			});
			return renderToolResult.attendance(page.rows, page.totalCount);
		},
	});

	const listLeave = tool({
		description:
			"Leave requests within the viewer's scope and, optionally, their balances.",
		inputSchema: z.object({
			includeBalances: z.boolean().optional(),
			limit: z.number().int().min(1).max(20).optional(),
		}),
		execute: async ({ includeBalances, limit }) => {
			const page = await leaveRequests(ctx, { offset: 0, limit: limit ?? 10 });
			const result: Record<string, unknown> = {
				requests: renderToolResult.leaveRequests(page.rows, page.totalCount),
			};
			if (includeBalances) {
				result.balances = renderToolResult.leaveBalances(
					await leaveBalances(ctx),
				);
			}
			return result;
		},
	});

	const listNotificationsTool = tool({
		description:
			"Recent notification records (job openings, status changes, ...), newest first. The notification log is management-only, exactly as on the web surface.",
		inputSchema: z.object({
			limit: z.number().int().min(1).max(20).optional(),
		}),
		execute: async ({ limit }) => {
			// The same operation policy the GraphQL `notifications` log uses.
			authorize(ctx, "notifications");
			const page = await listNotifications(ctx, {
				offset: 0,
				limit: limit ?? 10,
			});
			return renderToolResult.notifications(page.nodes, page.totalCount);
		},
	});

	const listAuditEvents = tool({
		description:
			"Recent audit-log entries. Technical roles only — same gate as the Audit Log module.",
		inputSchema: z.object({
			limit: z.number().int().min(1).max(20).optional(),
		}),
		execute: async ({ limit }) => {
			authorize(ctx, "auditLogs");
			const page = await listAuditLogs(ctx, { offset: 0, limit: limit ?? 10 });
			return renderToolResult.auditEvents(page.nodes, page.totalCount);
		},
	});

	return {
		searchTasks,
		searchProjects,
		getProjectDetail,
		listKpiSummary,
		listKpiEvents,
		listAttendance,
		listLeave,
		listNotificationsTool,
		listAuditEvents,
	} as const;
}

export type AgentToolSet = ReturnType<typeof buildTools>;
