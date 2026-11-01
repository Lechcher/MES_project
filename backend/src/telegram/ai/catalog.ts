/**
 * Model catalog.
 *
 * The OpenAI-compatible endpoint reports its available models on `/models`.
 * The bot caches that list in `telegram_ai_models` so `/model` works even
 * while the endpoint is briefly unreachable — a failed refresh keeps the
 * previous rows and reports staleness instead of leaving users with nothing.
 */

import { desc, eq } from "drizzle-orm";
import type { AppConfig } from "../../config";
import type { DatabaseHandle } from "../../db";
import { telegramAiModels } from "../../db/schema";

/** One entry of the cached catalog. */
export interface CatalogEntry {
	modelId: string;
	displayName: string | null;
}

/** How stale the cached catalog is allowed to be before a refresh is offered. */
export const CATALOG_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Fetch the model list from the endpoint's catalog route.
 *
 * Both the OpenAI shape (`{ data: [{ id }] }`) and the bare-array shape are
 * accepted, because compatible gateways differ here. Throws on a non-OK
 * response so the caller keeps the previous cache.
 */
export async function fetchModelCatalog(
	baseUrl: string,
	apiKey: string | null,
	fetchImpl: typeof fetch = fetch,
): Promise<CatalogEntry[]> {
	const response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/models`, {
		headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
	});
	if (!response.ok) {
		throw new Error(`Model catalog request failed with ${response.status}.`);
	}

	const body = (await response.json()) as
		| { data?: { id?: string }[] }
		| { id?: string }[];

	const rows = Array.isArray(body) ? body : (body.data ?? []);
	const entries: CatalogEntry[] = [];
	for (const row of rows) {
		const modelId = typeof row?.id === "string" ? row.id.trim() : "";
		if (modelId !== "") entries.push({ modelId, displayName: modelId });
	}
	return entries;
}

/** Replace the cached catalog with a fresh fetch. Returns the stored rows. */
export async function refreshModelCatalog(
	db: DatabaseHandle,
	settings: { aiBaseUrl: string | null; aiApiKey: string | null },
	fetchImpl: typeof fetch = fetch,
): Promise<CatalogEntry[]> {
	// A caller without an endpoint configured refreshes nothing; the caller
	// reports that separately, so returning empty keeps this honest.
	if (!settings.aiBaseUrl) return [];
	const entries = await fetchModelCatalog(
		settings.aiBaseUrl,
		settings.aiApiKey,
		fetchImpl,
	);

	const now = new Date();
	await db.delete(telegramAiModels);
	if (entries.length > 0) {
		await db.insert(telegramAiModels).values(
			entries.map((entry) => ({
				modelId: entry.modelId,
				displayName: entry.displayName,
				fetchedAt: now,
			})),
		);
	}
	return entries;
}

/** Read the cached catalog, newest fetch first. */
export async function loadModelCatalog(db: DatabaseHandle) {
	return db
		.select()
		.from(telegramAiModels)
		.orderBy(desc(telegramAiModels.fetchedAt));
}

/** Age of the newest cached fetch, or null when the cache is empty. */
export async function catalogAgeMs(db: DatabaseHandle): Promise<number | null> {
	const rows = await db
		.select({ fetchedAt: telegramAiModels.fetchedAt })
		.from(telegramAiModels);
	if (rows.length === 0) return null;
	const newest = rows.reduce(
		(max, row) =>
			row.fetchedAt.getTime() > max ? row.fetchedAt.getTime() : max,
		0,
	);
	return Date.now() - newest;
}

/** True when a stored model id is still offered by the endpoint's catalog. */
export async function isKnownModel(
	db: DatabaseHandle,
	modelId: string,
): Promise<boolean> {
	const [row] = await db
		.select({ modelId: telegramAiModels.modelId })
		.from(telegramAiModels)
		.where(eq(telegramAiModels.modelId, modelId))
		.limit(1);
	return Boolean(row);
}

/** Whether the endpoint is configured at all (base URL present). */
export function aiConfigured(config: AppConfig): boolean {
	return config.telegramAiBaseUrl.trim() !== "";
}
