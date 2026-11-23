/**
 * Shared aliases for the Shopify commerce domain.
 *
 * Keeps the official SDK types behind our own names so the rest of the domain
 * never imports SDK type names directly.
 */

/** Minimal per-store Admin API client used by this module. */
export interface AdminApiClient {
	request<TData = unknown>(
		document: string,
		options?: { variables?: Record<string, unknown> },
	): Promise<{ data?: TData; errors?: unknown; extensions?: unknown }>;
}

/** Options accepted when constructing `@shopify/admin-api-client`. */
export interface AdminGraphQLClientOptions {
	storeDomain: string;
	apiVersion: string;
	accessToken: string;
	retries?: number;
	customFetchApi?: typeof fetch;
}

/** Cost-throttle block Shopify returns on every GraphQL response. */
export interface ThrottleStatus {
	currentlyAvailable?: number;
	maximumAvailable?: number;
	restoreRate?: number;
}

/** A parsed Shopify Admin API response carrying its cost extension. */
export interface CostedResponse<T> {
	data?: T;
	errors?: unknown;
	extensions?: { cost?: { throttleStatus?: ThrottleStatus } };
}

/** Webhook topics this module subscribes to on store connect. */
export const SHOPTIFY_WEBHOOK_TOPICS = [
	"orders/create",
	"orders/updated",
	"orders/edited",
	"refunds/create",
	"fulfillments/create",
	"fulfillments/update",
	"products/update",
	"inventory_levels/update",
	"app/uninstalled",
] as const;

export type ShoptifyWebhookTopic = (typeof SHOPTIFY_WEBHOOK_TOPICS)[number];
