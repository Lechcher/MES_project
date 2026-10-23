/**
 * Jobs resolver surface (`API_CONTACT_SPECIFICATION.md` §6.1).
 *
 * Thin by design: each resolver authorizes the operation, delegates to the Jobs
 * domain service, and maps persisted rows to the contract's shapes. Business
 * rules, scope checks, audit, KPI and notifications live in `../../domain/tasks`.
 */

import {
	deleteTask,
	duplicateTask,
	listScheduledTasks,
	updateTask,
} from "../../domain/schedule";
import {
	acceptTask,
	approveTask,
	cancelTask,
	createTask,
	explainLateSubmission,
	getProject,
	getTask,
	listProjects,
	listTasks,
	logTaskProgress,
	requestExtension,
	returnTask,
	reviewTaskCompletionRequest,
	reviewTaskRequest,
	submitTaskCompletionRequest,
	submitTaskReport,
} from "../../domain/tasks";
import { commitTaskImport, previewTaskImport } from "../../reports/schedule";
import { authorize } from "../access";
import type { ViewerContext } from "../context";
import {
	toProject,
	toTask,
	toTaskCompletionRequest,
	toTaskRequest,
} from "../shapes";

/**
 * The assembly contract types the GraphQL context value as `unknown`; the value
 * is always `{ ctx, auth }` here (see `../index`), so the parameter is loosely
 * typed and the viewer context is read through it.
 */
type Resolver = (
	parent: unknown,
	args: any,
	contextValue: any,
	info: unknown,
) => unknown;

export const jobsQuery: Record<string, Resolver> = {
	projects: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		const scope = authorize(ctx, "projects");
		const result = await listProjects(ctx, scope, {
			filter: args.filter ?? null,
			orderBy: args.orderBy ?? null,
			offset: args.offset,
			limit: args.limit,
		});
		return {
			nodes: result.nodes.map(toProject),
			pageInfo: result.pageInfo,
		};
	},

	project: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		const scope = authorize(ctx, "project");
		return toProject(await getProject(ctx, scope, args.id));
	},

	tasks: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		const scope = authorize(ctx, "tasks");
		const result = await listTasks(ctx, scope, {
			filter: args.filter ?? null,
			orderBy: args.orderBy ?? null,
			offset: args.offset,
			limit: args.limit,
		});
		return {
			nodes: result.nodes.map(toTask),
			pageInfo: result.pageInfo,
		};
	},

	task: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		const scope = authorize(ctx, "task");
		return toTask(await getTask(ctx, scope, args.id));
	},

	scheduledTasks: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		const scope = authorize(ctx, "scheduledTasks");
		return (await listScheduledTasks(ctx, scope, args.input)).map(toTask);
	},
};

export const jobsMutation: Record<string, Resolver> = {
	createTask: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		const scope = authorize(ctx, "createTask");
		return toTask(await createTask(ctx, scope, args.input));
	},

	acceptTask: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		const scope = authorize(ctx, "acceptTask");
		return toTask(await acceptTask(ctx, scope, args.taskId));
	},

	logTaskProgress: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		const scope = authorize(ctx, "logTaskProgress");
		return toTask(await logTaskProgress(ctx, scope, args.input));
	},

	submitTaskReport: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		const scope = authorize(ctx, "submitTaskReport");
		return toTask(await submitTaskReport(ctx, scope, args.input));
	},

	approveTask: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		const scope = authorize(ctx, "approveTask");
		return toTask(await approveTask(ctx, scope, args.taskId));
	},

	returnTask: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		const scope = authorize(ctx, "returnTask");
		return toTask(await returnTask(ctx, scope, args.taskId, args.reason));
	},

	cancelTask: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		const scope = authorize(ctx, "cancelTask");
		return toTask(await cancelTask(ctx, scope, args.input));
	},

	requestExtension: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		const scope = authorize(ctx, "requestExtension");
		return toTaskRequest(await requestExtension(ctx, scope, args.input));
	},

	explainLateSubmission: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		const scope = authorize(ctx, "explainLateSubmission");
		return toTaskRequest(await explainLateSubmission(ctx, scope, args.input));
	},

	reviewTaskRequest: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		const scope = authorize(ctx, "reviewTaskRequest");
		return toTaskRequest(await reviewTaskRequest(ctx, scope, args.input));
	},

	submitTaskCompletionRequest: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		const scope = authorize(ctx, "submitTaskCompletionRequest");
		return toTaskCompletionRequest(
			await submitTaskCompletionRequest(ctx, scope, args.input),
		);
	},

	reviewTaskCompletionRequest: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		const scope = authorize(ctx, "reviewTaskCompletionRequest");
		return toTaskCompletionRequest(
			await reviewTaskCompletionRequest(ctx, scope, args.input),
		);
	},

	updateTask: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		const scope = authorize(ctx, "updateTask");
		return toTask(await updateTask(ctx, scope, args.input));
	},

	deleteTask: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		const scope = authorize(ctx, "deleteTask");
		return deleteTask(ctx, scope, args.taskId);
	},

	duplicateTask: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		const scope = authorize(ctx, "duplicateTask");
		return toTask(await duplicateTask(ctx, scope, args.input));
	},

	previewTaskImport: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		const scope = authorize(ctx, "previewTaskImport");
		return previewTaskImport(ctx, scope, args.file);
	},

	commitTaskImport: async (_parent, args, contextValue) => {
		const ctx: ViewerContext = contextValue.ctx;
		const scope = authorize(ctx, "commitTaskImport");
		const ids = await commitTaskImport(ctx, scope, args.file);
		return Promise.all(
			ids.map(async (id) => toTask(await getTask(ctx, scope, id))),
		);
	},
};
