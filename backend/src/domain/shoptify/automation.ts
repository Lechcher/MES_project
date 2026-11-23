/**
 * Automation domain: the minimal v1 rule engine.
 *
 * A rule subscribes to a domain trigger, carries simple predicates over the
 * event row, and executes one action set — a local write (annotate the order)
 * plus a notification row through the platform's notification engine. The
 * engine is deliberately narrow: anything richer is a later change.
 *
 * Idempotency is the engine's correctness core: every evaluation writes an
 * `shoptify_automation_log` row keyed `(rule, eventKey)` first, so a rule
 * fires at most once per event — Shopify webhooks retry, and the bus may
 * fan out the same payload more than once.
 */

import { and, eq, sql } from "drizzle-orm";
import type { AppConfig } from "../../config";
import type { DatabaseHandle } from "../../db";
import type { ShoptifyAutomationTrigger } from "../../db/enums";
import {
	shoptifyAutomationLog,
	shoptifyAutomationRules,
	shoptifyOrders,
} from "../../db/schema";
import type { ViewerContext } from "../../graphql/context";
import { createContext } from "../../graphql/context";
import { DomainError } from "../../graphql/errors";
import { recordAuditEvent } from "../audit";
import { notify as notifyPlatform } from "../notifications";
import { toRule } from "./shapes";
import type { WebhookPayload } from "./webhooks";

/** One predicate: a field on the event row compared to a value. */
export interface RuleCondition {
	field: string;
	operator: "equals" | "not_equals" | "gt" | "gte" | "lt" | "lte" | "contains";
	value: string | number | boolean;
}

/** One action: the local writes and notifications this version supports. */
export interface RuleAction {
	type: "flag_exception" | "annotate" | "notify";
	reason?: string;
	note?: string;
	template?: string;
}

export interface SaveRuleInput {
	id?: string | null;
	name: string;
	storeId?: string | null;
	triggerEvent: ShoptifyAutomationTrigger;
	conditions?: RuleCondition[] | null;
	actions?: RuleAction[] | null;
	isActive?: boolean;
}

/** Create or update a rule; conditions/actions are validated structurally. */
export async function saveRule(
	ctx: ViewerContext,
	input: SaveRuleInput,
): Promise<ReturnType<typeof toRule>> {
	const conditions = validateConditions(input.conditions);
	const actions = validateActions(input.actions);

	let ruleId: string;
	if (input.id) {
		const [existing] = await ctx.db
			.select()
			.from(shoptifyAutomationRules)
			.where(eq(shoptifyAutomationRules.id, input.id))
			.limit(1);
		if (!existing) throw new DomainError("NOT_FOUND", "Rule not found.");
		ruleId = existing.id;
		await ctx.db
			.update(shoptifyAutomationRules)
			.set({
				name: input.name,
				storeId: input.storeId ?? null,
				triggerEvent: input.triggerEvent,
				conditions: conditions ? JSON.stringify(conditions) : null,
				actions: actions ? JSON.stringify(actions) : null,
				isActive: input.isActive ?? existing.isActive,
				updatedAt: new Date(),
			})
			.where(eq(shoptifyAutomationRules.id, ruleId));
		await recordAuditEvent(ctx, {
			action: "shoptify.rule.update",
			moduleCode: "shoptify",
			resourceType: "shoptify_automation_rule",
			resourceId: ruleId,
			newData: { ...input, conditions, actions },
		});
	} else {
		ruleId = crypto.randomUUID();
		await ctx.db.insert(shoptifyAutomationRules).values({
			id: ruleId,
			name: input.name,
			storeId: input.storeId ?? null,
			triggerEvent: input.triggerEvent,
			conditions: conditions ? JSON.stringify(conditions) : null,
			actions: actions ? JSON.stringify(actions) : null,
			isActive: input.isActive ?? true,
		});
		await recordAuditEvent(ctx, {
			action: "shoptify.rule.create",
			moduleCode: "shoptify",
			resourceType: "shoptify_automation_rule",
			resourceId: ruleId,
			newData: { ...input, conditions, actions },
		});
	}

	const stored = await listRules(ctx.db, input.storeId ?? null);
	const rule = stored.find((row) => row.id === ruleId);
	if (!rule) throw new DomainError("NOT_FOUND", "Rule not found.");
	return rule;
}

export async function deleteRule(
	ctx: ViewerContext,
	ruleId: string,
): Promise<boolean> {
	const [existing] = await ctx.db
		.select()
		.from(shoptifyAutomationRules)
		.where(eq(shoptifyAutomationRules.id, ruleId))
		.limit(1);
	if (!existing) throw new DomainError("NOT_FOUND", "Rule not found.");
	await ctx.db
		.delete(shoptifyAutomationRules)
		.where(eq(shoptifyAutomationRules.id, ruleId));
	await recordAuditEvent(ctx, {
		action: "shoptify.rule.delete",
		moduleCode: "shoptify",
		resourceType: "shoptify_automation_rule",
		resourceId: ruleId,
		oldData: { name: existing.name, triggerEvent: existing.triggerEvent },
	});
	return true;
}

export async function listRules(
	db: DatabaseHandle,
	storeId: string | null,
): Promise<ReturnType<typeof toRule>[]> {
	const where = storeId
		? eq(shoptifyAutomationRules.storeId, storeId)
		: undefined;
	const rows = await db
		.select()
		.from(shoptifyAutomationRules)
		.where(where)
		.orderBy(sql`${shoptifyAutomationRules.name} asc`);
	return rows.map((row) => toRule(row));
}

/** The event row a rule evaluates against — keyed by its trigger. */
export interface RuleEvent {
	trigger: ShoptifyAutomationTrigger;
	/** Global rules also see scoped events; `null` means the event has no store. */
	storeId: string | null;
	/** Identifier making the event unique, e.g. the Shopify order id. */
	eventKey: string;
	/** The row the predicates read. */
	row: WebhookPayload;
	/** The local order row the actions mutate, when the event has one. */
	orderId?: string | null;
}

export interface RuleExecutionOutcome {
	ruleId: string;
	executed: boolean;
	reason?: "already-executed" | "conditions-not-met";
	errors: string[];
}

/**
 * Evaluate one event against every enabled rule that subscribes to it.
 *
 * Claims the `(rule, eventKey)` pair before acting — a concurrent duplicate
 * loses the insert and is reported as `already-executed` without touching
 * data. Actions beyond the v1 set (local annotation + notification) are
 * refused rather than silently skipped.
 */
export async function evaluateRules(
	db: DatabaseHandle,
	event: RuleEvent,
	deps?: {
		/** Runtime config for the default notifier (platform engine). */
		config?: AppConfig;
		/** Raises the notification row; defaults to the platform engine. */
		notify?: (action: RuleAction, event: RuleEvent) => Promise<void>;
	},
): Promise<RuleExecutionOutcome[]> {
	const rules = await db
		.select()
		.from(shoptifyAutomationRules)
		.where(
			and(
				eq(shoptifyAutomationRules.triggerEvent, event.trigger),
				eq(shoptifyAutomationRules.isActive, true),
				event.storeId
					? sql`(${shoptifyAutomationRules.storeId} is null or ${shoptifyAutomationRules.storeId} = ${event.storeId})`
					: sql`${shoptifyAutomationRules.storeId} is null`,
			),
		);

	const outcomes: RuleExecutionOutcome[] = [];
	for (const rule of rules) {
		const conditions = parse<RuleCondition[]>(rule.conditions);
		const actions = parse<RuleAction[]>(rule.actions) ?? [];
		if (!matchesAll(event.row, conditions)) {
			outcomes.push({
				ruleId: rule.id,
				executed: false,
				reason: "conditions-not-met",
				errors: [],
			});
			continue;
		}

		const claimed = await claim(db, rule.id, event.eventKey);
		if (!claimed) {
			outcomes.push({
				ruleId: rule.id,
				executed: false,
				reason: "already-executed",
				errors: [],
			});
			continue;
		}

		const errors: string[] = [];
		for (const action of actions) {
			try {
				await executeAction(
					db,
					rule.id,
					event,
					action,
					deps?.notify,
					deps?.config,
				);
			} catch (error) {
				errors.push((error as Error).message);
			}
		}
		outcomes.push({ ruleId: rule.id, executed: true, errors });
	}
	return outcomes;
}

/* ------------------------------------------------------------------ */
/* Internals                                                           */
/* ------------------------------------------------------------------ */

function parse<T>(text: string | null): T | null {
	if (!text) return null;
	try {
		return JSON.parse(text) as T;
	} catch {
		return null;
	}
}

/** Claim the (rule, event) pair; false when another evaluation got there. */
async function claim(
	db: DatabaseHandle,
	ruleId: string,
	eventKey: string,
): Promise<boolean> {
	const result = await db
		.insert(shoptifyAutomationLog)
		.values({
			id: crypto.randomUUID(),
			ruleId,
			eventKey,
			targetType: null,
			targetId: null,
			actionResults: null,
		})
		.onConflictDoNothing()
		.returning({ id: shoptifyAutomationLog.id });
	return (result as { id: string }[]).length > 0;
}

async function executeAction(
	db: DatabaseHandle,
	ruleId: string,
	event: RuleEvent,
	action: RuleAction,
	notify?: (action: RuleAction, event: RuleEvent) => Promise<void>,
	config?: AppConfig,
): Promise<void> {
	if (action.type === "flag_exception") {
		if (!event.orderId) {
			throw new Error("flag_exception needs an order row.");
		}
		await db
			.update(shoptifyOrders)
			.set({
				hasException: true,
				exceptionReason: (action.reason ?? "OTHER") as never,
				updatedAt: new Date(),
			})
			.where(eq(shoptifyOrders.id, event.orderId));
		await db
			.update(shoptifyAutomationLog)
			.set({
				targetType: "shoptify_order",
				targetId: event.orderId,
				actionResults: JSON.stringify([{ action: action.type, ok: true }]),
			})
			.where(
				and(
					eq(shoptifyAutomationLog.ruleId, ruleId),
					eq(shoptifyAutomationLog.eventKey, event.eventKey),
				),
			);
		return;
	}

	if (action.type === "annotate") {
		if (!event.orderId) throw new Error("annotate needs an order row.");
		await db
			.update(shoptifyOrders)
			.set({ note: action.note ?? null, updatedAt: new Date() })
			.where(eq(shoptifyOrders.id, event.orderId));
		return;
	}

	if (action.type === "notify") {
		if (notify) {
			await notify(action, event);
		} else if (config) {
			// Platform engine: a notification row, delivered like every other.
			await notifyPlatform(
				createContext({
					db,
					config,
					request: { ipAddress: null, userAgent: null },
				}),
				{
					template: action.template ?? "SHOPTIFY_AUTOMATION",
					payload: { rule: "fired", event: event.row },
					relatedType: "shoptify_order",
					relatedId: event.orderId ?? null,
				},
			);
		}
		return;
	}

	throw new Error(`Unsupported action type: ${String(action.type)}`);
}

/** Every condition must hold; an empty set matches. */
export function matchesAll(
	row: WebhookPayload,
	conditions: RuleCondition[] | null,
): boolean {
	if (!conditions || conditions.length === 0) return true;
	return conditions.every((condition) => matchesOne(row, condition));
}

function matchesOne(row: WebhookPayload, condition: RuleCondition): boolean {
	const actual = row[condition.field];
	const expected = condition.value;
	switch (condition.operator) {
		case "equals":
			return String(actual) === String(expected);
		case "not_equals":
			return String(actual) !== String(expected);
		case "contains":
			return String(actual ?? "").includes(String(expected));
		case "gt":
			return Number(actual) > Number(expected);
		case "gte":
			return Number(actual) >= Number(expected);
		case "lt":
			return Number(actual) < Number(expected);
		case "lte":
			return Number(actual) <= Number(expected);
		default:
			return false;
	}
}

function validateConditions(
	conditions: RuleCondition[] | null | undefined,
): RuleCondition[] | null {
	if (!conditions) return null;
	for (const condition of conditions) {
		if (typeof condition.field !== "string" || condition.field === "") {
			throw new DomainError(
				"VALIDATION_FAILED",
				"Every condition needs a field name.",
			);
		}
		if (
			!["equals", "not_equals", "gt", "gte", "lt", "lte", "contains"].includes(
				condition.operator,
			)
		) {
			throw new DomainError(
				"VALIDATION_FAILED",
				`Unknown condition operator: ${String(condition.operator)}`,
			);
		}
	}
	return conditions;
}

const SUPPORTED_ACTIONS = ["flag_exception", "annotate", "notify"] as const;

function validateActions(
	actions: RuleAction[] | null | undefined,
): RuleAction[] | null {
	if (!actions) return null;
	for (const action of actions) {
		if (!SUPPORTED_ACTIONS.includes(action.type)) {
			throw new DomainError(
				"VALIDATION_FAILED",
				`Unsupported action type: ${String(action.type)}. ` +
					"This version supports flag_exception, annotate, and notify.",
			);
		}
	}
	return actions;
}
