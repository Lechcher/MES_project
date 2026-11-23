/**
 * Catalog domain: product/variant ingestion, cross-store inventory through
 * `master_sku`, and low-stock detection.
 *
 * Variants are the unit of cross-store identity: every variant carrying the
 * same `master_sku` is one logical item, so a quantity/price change for one
 * of them applies to all of them. Remote writes go through each store's
 * Admin API client; local rows always land first so the dashboard stays
 * authoritative even when a store is unreachable.
 */

import { and, eq, sql } from "drizzle-orm";
import type { AppConfig } from "../../config";
import type { DatabaseHandle } from "../../db";
import {
	shoptifyProducts,
	shoptifyStores,
	shoptifyVariants,
} from "../../db/schema";
import type { ViewerContext } from "../../graphql/context";
import { DomainError } from "../../graphql/errors";
import { recordAuditEvent } from "../audit";
import {
	createStoreClient,
	decodeTokenEncryptionKey,
	decryptToken,
	requireShopifySettings,
} from "./core";
import type { StoreClientInput } from "./orders";
import { toMinorUnits, toProduct } from "./shapes";
import type { AdminApiClient } from "./types";
import type { WebhookPayload } from "./webhooks";

/** Filter shape shared by the GraphQL input and the domain. */
export interface ProductFilter {
	storeId?: string;
	masterSku?: string;
	lowStockOnly?: boolean;
}

export interface VariantUpdateInput {
	variantId: string;
	availableQuantity?: number;
	price?: number;
	status?: string;
}

export interface VariantUpdateResult {
	updated: string[];
	failed: { variantId: string; message: string }[];
	/** Variant ids that fell below their minimum after the update. */
	lowStock: string[];
}

export interface CatalogDependencies {
	db: DatabaseHandle;
	config: AppConfig;
	clientFactory?: (store: StoreClientInput) => AdminApiClient;
}

/** Surface the first GraphQL error message, or the given fallback. */
function firstErrorMessage(errors: unknown, fallback: string): string {
	if (Array.isArray(errors)) {
		const first = errors[0] as { message?: string } | undefined;
		if (typeof first?.message === "string") return first.message;
	}
	return fallback;
}

/* ------------------------------------------------------------------ */
/* Ingestion                                                           */
/* ------------------------------------------------------------------ */

interface ProductWebhookPayload extends WebhookPayload {
	title?: string;
	status?: string;
	variants?: {
		id?: number | string;
		sku?: string;
		price?: string;
		inventory_quantity?: number;
	}[];
}

/**
 * Upsert a product and its variants from a `products/update` webhook.
 *
 * Variants are matched by Shopify id within the store; unknown ones are
 * inserted. `master_sku` is carried from the variant's `sku` when the store
 * uses one SKU per item across stores — the operator edits it in the
 * dashboard when the stores disagree.
 */
export async function ingestProductWebhook(
	db: DatabaseHandle,
	input: { shopDomain: string; payload: ProductWebhookPayload },
): Promise<{ productId: string; created: boolean }> {
	const [store] = await db
		.select({ id: shoptifyStores.id })
		.from(shoptifyStores)
		.where(eq(shoptifyStores.shopDomain, input.shopDomain))
		.limit(1);
	if (!store) return { productId: "", created: false };

	const shopifyProductId = String(input.payload.id ?? "");
	if (shopifyProductId === "") {
		throw new Error("Product webhook payload carries no id.");
	}

	const [existing] = await db
		.select({ id: shoptifyProducts.id })
		.from(shoptifyProducts)
		.where(
			and(
				eq(shoptifyProducts.storeId, store.id),
				eq(shoptifyProducts.shopifyProductId, shopifyProductId),
			),
		)
		.limit(1);

	let productId = existing?.id;
	let created = false;
	if (!productId) {
		productId = crypto.randomUUID();
		created = true;
		await db.insert(shoptifyProducts).values({
			id: productId,
			storeId: store.id,
			shopifyProductId,
			title: input.payload.title ?? `Product ${shopifyProductId}`,
			status: input.payload.status ?? null,
		});
	} else {
		await db
			.update(shoptifyProducts)
			.set({
				title: input.payload.title ?? sql`${shoptifyProducts.title}`,
				status: input.payload.status ?? sql`${shoptifyProducts.status}`,
				updatedAt: new Date(),
			})
			.where(eq(shoptifyProducts.id, productId));
	}

	for (const variant of input.payload.variants ?? []) {
		const shopifyVariantId = String(variant.id ?? "");
		if (shopifyVariantId === "") continue;
		await db
			.insert(shoptifyVariants)
			.values({
				id: crypto.randomUUID(),
				productId,
				storeId: store.id,
				shopifyVariantId,
				sku: variant.sku ?? null,
				masterSku: variant.sku ?? null,
				price: toMinorUnits(variant.price),
				availableQuantity: variant.inventory_quantity ?? 0,
			})
			.onConflictDoUpdate({
				target: [shoptifyVariants.storeId, shoptifyVariants.shopifyVariantId],
				set: {
					sku: variant.sku ?? null,
					price: toMinorUnits(variant.price),
					availableQuantity: variant.inventory_quantity ?? 0,
					updatedAt: new Date(),
				},
			});
	}

	return { productId, created };
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export async function listProducts(
	db: DatabaseHandle,
	filter: ProductFilter,
	page: { offset: number; limit: number },
): Promise<{ rows: ReturnType<typeof toProduct>[]; totalCount: number }> {
	const conditions = [];
	if (filter.storeId)
		conditions.push(eq(shoptifyProducts.storeId, filter.storeId));
	if (filter.masterSku) {
		conditions.push(
			sql`exists (select 1 from shoptify_variants v where v.product_id = ${shoptifyProducts.id} and v.master_sku = ${filter.masterSku})`,
		);
	}

	const where = conditions.length > 0 ? and(...conditions) : undefined;
	const products = await db
		.select()
		.from(shoptifyProducts)
		.where(where)
		.orderBy(sql`${shoptifyProducts.title} asc`)
		.limit(page.limit)
		.offset(page.offset);

	const [countRow] = await db
		.select({ count: sql<number>`count(*)` })
		.from(shoptifyProducts)
		.where(where);

	const rows = [];
	for (const product of products) {
		const variants = await db
			.select()
			.from(shoptifyVariants)
			.where(eq(shoptifyVariants.productId, product.id));
		const shape = toProduct(product, variants);
		if (filter.lowStockOnly) {
			shape.variants = shape.variants.filter((variant) => variant.isLowStock);
			if (shape.variants.length === 0) continue;
		}
		rows.push(shape);
	}

	return { rows, totalCount: Number(countRow?.count ?? 0) };
}

/**
 * Every local variant sharing the given `master_sku`, across all stores.
 * A variant with no `master_sku` maps to itself only.
 */
export async function variantsByMasterSku(
	db: DatabaseHandle,
	variantId: string,
): Promise<{ id: string; storeId: string; shopifyVariantId: string | null }[]> {
	const [variant] = await db
		.select()
		.from(shoptifyVariants)
		.where(eq(shoptifyVariants.id, variantId))
		.limit(1);
	if (!variant) throw new DomainError("NOT_FOUND", "Variant not found.");
	if (!variant.masterSku) {
		return [
			{
				id: variant.id,
				storeId: variant.storeId,
				shopifyVariantId: variant.shopifyVariantId,
			},
		];
	}
	const rows = await db
		.select()
		.from(shoptifyVariants)
		.where(eq(shoptifyVariants.masterSku, variant.masterSku));
	return rows.map((row) => ({
		id: row.id,
		storeId: row.storeId,
		shopifyVariantId: row.shopifyVariantId,
	}));
}

/* ------------------------------------------------------------------ */
/* Writes                                                             */
/* ------------------------------------------------------------------ */

/**
 * Apply a quantity/price/status update to every variant sharing the target's
 * `master_sku`, locally and (best-effort) remotely.
 *
 * Local rows land first; each remote store is then attempted so a single
 * unreachable store neither reverts the local change nor aborts the batch.
 */
export async function updateVariant(
	deps: CatalogDependencies & { ctx?: ViewerContext },
	input: VariantUpdateInput,
): Promise<VariantUpdateResult> {
	const { db } = deps;
	const targets = await variantsByMasterSku(db, input.variantId);
	if (targets.length === 0) {
		throw new DomainError("NOT_FOUND", "Variant not found.");
	}

	const updated: string[] = [];
	const failed: { variantId: string; message: string }[] = [];

	for (const target of targets) {
		try {
			const changes: Record<string, unknown> = {};
			if (input.availableQuantity !== undefined)
				changes.availableQuantity = input.availableQuantity;
			if (input.price !== undefined) changes.price = input.price;
			await db
				.update(shoptifyVariants)
				.set({ ...changes, updatedAt: new Date() })
				.where(eq(shoptifyVariants.id, target.id));
			// `status` is product-level in Shopify: it lands on the product row.
			if (input.status !== undefined) {
				const [variant] = await db
					.select({ productId: shoptifyVariants.productId })
					.from(shoptifyVariants)
					.where(eq(shoptifyVariants.id, target.id));
				if (variant) {
					await db
						.update(shoptifyProducts)
						.set({ status: input.status, updatedAt: new Date() })
						.where(eq(shoptifyProducts.id, variant.productId));
				}
			}
			updated.push(target.id);
		} catch (error) {
			failed.push({
				variantId: target.id,
				message: (error as Error).message,
			});
		}
	}

	// Remote best-effort: push price to each store that owns a target.
	for (const target of targets) {
		if (input.price === undefined) continue;
		try {
			const client = await resolveStoreClient(deps, target.storeId);
			await pushVariantToShopify(client, target.shopifyVariantId ?? "", {
				price: input.price,
			});
		} catch {
			// Remote failures are surfaced by the next sync: the local row is
			// already the newest truth and the store will catch up.
		}
	}

	const lowStock = await findLowStock(db, input.variantId);

	if (deps.ctx) {
		await recordAuditEvent(deps.ctx, {
			action: "shoptify.variant.update",
			moduleCode: "shoptify",
			resourceType: "shoptify_variant",
			resourceId: input.variantId,
			newData: { ...input, appliedTo: updated.length },
		});
	}

	return { updated, failed, lowStock };
}

/** Resolve an Admin API client for a store (factory-injectable). */
async function resolveStoreClient(
	deps: CatalogDependencies,
	storeId: string,
): Promise<AdminApiClient> {
	const [store] = await deps.db
		.select()
		.from(shoptifyStores)
		.where(eq(shoptifyStores.id, storeId))
		.limit(1);
	if (!store) throw new DomainError("NOT_FOUND", "Store not found.");
	if (deps.clientFactory) {
		return deps.clientFactory({
			shopDomain: store.shopDomain,
			accessToken: store.accessToken,
		});
	}
	const shopify = requireShopifySettings(deps.config);
	const key = decodeTokenEncryptionKey(shopify.tokenEncryptionKey);
	return createStoreClient({
		shopDomain: store.shopDomain,
		accessToken: decryptToken(store.accessToken, key),
		apiVersion: "2026-10",
	});
}

/** Push price/status for one variant to Shopify. */
async function pushVariantToShopify(
	client: AdminApiClient,
	shopifyVariantId: string,
	fields: { price?: number; status?: string },
): Promise<void> {
	if (shopifyVariantId === "") throw new Error("Variant has no Shopify id.");
	const variantFields: Record<string, unknown> = {};
	if (fields.price !== undefined)
		variantFields.price = (fields.price / 100).toFixed(2);
	const response = await client.request<{
		productVariantUpdate?: { userErrors?: { message: string }[] };
	}>(
		`mutation VariantUpdate($input: ProductVariantUpdateInput!) {
		productVariantUpdate(input: $input) {
			productVariant { id }
			userErrors { field message }
		}
	}`,
		{
			variables: {
				input: {
					id: `gid://shopify/ProductVariant/${shopifyVariantId}`,
					...variantFields,
				},
			},
		},
	);
	const userErrors = response.data?.productVariantUpdate?.userErrors ?? [];
	if (userErrors.length > 0) {
		throw new Error(firstErrorMessage(userErrors, "Variant update rejected."));
	}
}

/** Variants below their configured minimum, across the variant's master-SKU group. */
export async function findLowStock(
	db: DatabaseHandle,
	variantId: string,
): Promise<string[]> {
	const group = await variantsByMasterSku(db, variantId);
	const low: string[] = [];
	for (const member of group) {
		const [row] = await db
			.select()
			.from(shoptifyVariants)
			.where(eq(shoptifyVariants.id, member.id));
		if (
			row &&
			row.minStockLevel !== null &&
			row.availableQuantity < row.minStockLevel
		) {
			low.push(row.id);
		}
	}
	return low;
}
