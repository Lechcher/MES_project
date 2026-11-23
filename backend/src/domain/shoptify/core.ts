/**
 * Shopify commerce core services.
 *
 * Owns the pieces every other shoptify domain file depends on:
 *
 * - **Token custody:** AES-256-GCM encryption for stored Shopify access
 *   tokens. The key never leaves `AppConfig`; plaintext tokens exist only
 *   inside this module's boundary.
 * - **The configured guard:** `requireShopifySettings` turns "commerce not
 *   configured" into one actionable error instead of a confusing failure at
 *   the first Shopify call.
 * - **The Admin API client:** a throttle-aware wrapper around
 *   `createAdminApiClient` that pauses batch work when Shopify's reported
 *   cost-throttle points run low.
 *
 * This module performs no database work itself: stores are read and written
 * by the domains that need them.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createAdminApiClient } from "@shopify/admin-api-client";
import type { AppConfig, ShopifySettings } from "../../config";
import { ConfigurationError } from "../../config";
import type {
	AdminApiClient,
	AdminGraphQLClientOptions,
	CostedResponse,
} from "./types";

/* ------------------------------------------------------------------ */
/* Token encryption                                                     */
/* ------------------------------------------------------------------ */

/** AES-256-GCM payload layout: 12-byte IV ‖ 16-byte tag ‖ ciphertext. */
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Concatenate byte parts (node's Buffer.concat types fight the current lib). */
function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
	const total = parts.reduce((sum, part) => sum + part.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

/** Copy node Buffers into plain Uint8Arrays (avoids the lib type friction). */
function toBytes(value: Uint8Array | Buffer): Uint8Array {
	return new Uint8Array(value);
}

/** The 32-byte key material behind the configured hex key. */
export type TokenEncryptionKey = Uint8Array;

/**
 * Decode the configured encryption key.
 *
 * The key is 64 hex characters (32 bytes); anything else would surface as an
 * OpenSSL error at the first encryption, so it is rejected here with an
 * actionable message instead.
 */
export function decodeTokenEncryptionKey(key: string): TokenEncryptionKey {
	if (!/^[0-9a-fA-F]{64}$/.test(key)) {
		throw new ConfigurationError(
			"SHOPIFY_TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes); " +
				"generate one with `openssl rand -hex 32`.",
			["SHOPIFY_TOKEN_ENCRYPTION_KEY"],
		);
	}
	return Uint8Array.from(Buffer.from(key, "hex"));
}

/** Encrypt a Shopify access token for storage. Output is base64 text. */
export function encryptToken(
	plaintext: string,
	key: TokenEncryptionKey,
): string {
	const iv = toBytes(randomBytes(IV_BYTES));
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const ciphertext = concatBytes([
		toBytes(cipher.update(plaintext, "utf8")),
		toBytes(cipher.final()),
	]);
	return Buffer.from(
		concatBytes([iv, toBytes(cipher.getAuthTag()), ciphertext]),
	).toString("base64");
}

/**
 * Decrypt a stored Shopify access token.
 *
 * Throws when the payload is malformed or the authentication tag does not
 * verify (wrong key, rotated key, or tampered value) — never returns
 * garbage.
 */
export function decryptToken(payload: string, key: TokenEncryptionKey): string {
	const raw = Buffer.from(payload, "base64");
	if (raw.length <= IV_BYTES + TAG_BYTES) {
		throw new ConfigurationError("Stored Shopify token is malformed.");
	}
	const decipher = createDecipheriv(
		"aes-256-gcm",
		key,
		toBytes(raw.subarray(0, IV_BYTES)),
	);
	decipher.setAuthTag(toBytes(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)));
	return Buffer.from(
		concatBytes([
			toBytes(decipher.update(toBytes(raw.subarray(IV_BYTES + TAG_BYTES)))),
			toBytes(decipher.final()),
		]),
	).toString("utf8");
}

/* ------------------------------------------------------------------ */
/* Configuration guard                                                  */
/* ------------------------------------------------------------------ */

/**
 * The Shopify credentials, or a thrown configuration error.
 *
 * Callers that need credentials (OAuth flows, token storage) go through this
 * so an unconfigured deployment fails with one actionable message.
 */
export function requireShopifySettings(config: AppConfig): ShopifySettings {
	if (config.shopify === null) {
		throw new ConfigurationError(
			"Shopify commerce is not configured: set SHOPIFY_API_KEY, " +
				"SHOPIFY_API_SECRET and SHOPIFY_TOKEN_ENCRYPTION_KEY.",
			["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "SHOPIFY_TOKEN_ENCRYPTION_KEY"],
		);
	}
	return config.shopify;
}

/* ------------------------------------------------------------------ */
/* Admin API client                                                     */
/* ------------------------------------------------------------------ */

/**
 * Build a per-store Admin API client wrapper.
 *
 * `retries: 3` covers transient 429/503; throttle-aware batch helpers read
 * the cost block on the response (see `throttleAwareRequest`). `fetchImpl`
 * is forwarded as the client's custom fetch so tests can run offline.
 */
export function createStoreClient(options: {
	shopDomain: string;
	accessToken: string;
	apiVersion: string;
	fetchImpl?: typeof fetch;
}): AdminApiClient {
	return createAdminApiClient({
		storeDomain: options.shopDomain,
		apiVersion: options.apiVersion,
		accessToken: options.accessToken,
		retries: 3,
		customFetchApi: options.fetchImpl,
	} satisfies AdminGraphQLClientOptions) as unknown as AdminApiClient;
}

/**
 * Run a request and pause batch work while Shopify reports low cost points.
 *
 * `throttleStatus` rides on every response's `extensions.cost` block; when
 * `currentlyAvailable` drops below the configured threshold the caller waits
 * before the next chunk. A missing or malformed block is treated as "no
 * information" and never blocks a call.
 */
export async function throttleAwareRequest<T>(
	options: {
		client: AdminApiClient;
		threshold: number;
		wait?: (ms: number) => Promise<void>;
	},
	document: string,
	variables?: Record<string, unknown>,
): Promise<CostedResponse<T>> {
	const wait = options.wait ?? defaultWait;
	const guard = options.threshold;

	for (let attempt = 1; ; attempt += 1) {
		const response = (await options.client.request(document, {
			variables,
		})) as CostedResponse<T>;
		const available =
			response?.extensions?.cost?.throttleStatus?.currentlyAvailable;
		if (typeof available !== "number" || available >= guard) {
			return response;
		}
		// Points restore at a fixed rate; a short, capped back-off keeps the
		// batch caller progressing without hammering the API.
		await wait(Math.min(250 * attempt, 2000));
	}
}

const defaultWait = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));
