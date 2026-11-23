import { describe, expect, test } from "bun:test";
import { ConfigurationError } from "../../config";
import {
	decodeTokenEncryptionKey,
	decryptToken,
	encryptToken,
	requireShopifySettings,
	throttleAwareRequest,
} from "./core";
import type { CostedResponse } from "./types";

const KEY_HEX = "a".repeat(64);

describe("shopify token encryption", () => {
	test("round-trips a token", () => {
		const key = decodeTokenEncryptionKey(KEY_HEX);
		const stored = encryptToken("shpat_offline_token", key);
		expect(decryptToken(stored, key)).toBe("shpat_offline_token");
	});

	test("produces different ciphertext for the same plaintext", () => {
		const key = decodeTokenEncryptionKey(KEY_HEX);
		const first = encryptToken("same-token", key);
		const second = encryptToken("same-token", key);
		expect(first).not.toBe(second);
	});

	test("rejects a tampered payload instead of returning garbage", () => {
		const key = decodeTokenEncryptionKey(KEY_HEX);
		const stored = encryptToken("token", key);
		const raw = Buffer.from(stored, "base64");
		raw[raw.length - 1] ^= 0xff;
		expect(() => decryptToken(raw.toString("base64"), key)).toThrow();
	});

	test("rejects a wrong key", () => {
		const key = decodeTokenEncryptionKey(KEY_HEX);
		const stored = encryptToken("token", key);
		const otherKey = decodeTokenEncryptionKey("b".repeat(64));
		expect(() => decryptToken(stored, otherKey)).toThrow();
	});

	test("rejects a malformed key with an actionable message", () => {
		expect(() => decodeTokenEncryptionKey("too-short")).toThrow(
			ConfigurationError,
		);
		try {
			decodeTokenEncryptionKey("too-short");
		} catch (error) {
			expect((error as ConfigurationError).missing).toContain(
				"SHOPIFY_TOKEN_ENCRYPTION_KEY",
			);
		}
	});
});

describe("requireShopifySettings", () => {
	test("throws when commerce is not configured", () => {
		expect(() => requireShopifySettings({ shopify: null } as never)).toThrow(
			ConfigurationError,
		);
	});

	test("returns the configured group", () => {
		const settings = {
			apiKey: "k",
			apiSecretKey: "s",
			tokenEncryptionKey: KEY_HEX,
			oauthCallbackUrl: "",
			scopes: "",
		};
		expect(requireShopifySettings({ shopify: settings } as never)).toEqual(
			settings,
		);
	});
});

describe("throttleAwareRequest", () => {
	const clientReturning = (available: number) => ({
		request: async <T>() =>
			({
				data: { ok: true },
				extensions: {
					cost: { throttleStatus: { currentlyAvailable: available } },
				},
			}) as CostedResponse<T>,
	});

	test("passes through when points are plentiful", async () => {
		const waits: number[] = [];
		const result = await throttleAwareRequest<{ ok: boolean }>(
			{
				client: clientReturning(900),
				threshold: 150,
				wait: async (ms) => void waits.push(ms),
			},
			"query",
		);
		expect(result.data).toEqual({ ok: true });
		expect(waits).toEqual([]);
	});

	test("waits while points are below the threshold", async () => {
		const waits: number[] = [];
		let calls = 0;
		const client = {
			request: async <T>() => {
				calls += 1;
				return {
					data: { calls },
					extensions: {
						cost: {
							throttleStatus: {
								currentlyAvailable: calls < 3 ? 10 : 500,
							},
						},
					},
				} as CostedResponse<T>;
			},
		};
		const result = await throttleAwareRequest<{ calls: number }>(
			{
				client,
				threshold: 150,
				wait: async (ms) => void waits.push(ms),
			},
			"query",
		);
		expect(result.data?.calls).toBe(3);
		expect(waits.length).toBe(2);
		expect(waits[0]).toBeLessThan(waits[1]);
	});

	test("passes through when the response carries no cost block", async () => {
		const client = {
			request: async <T>() => ({ data: { ok: true } }) as CostedResponse<T>,
		};
		const result = await throttleAwareRequest<{ ok: boolean }>(
			{ client, threshold: 150, wait: async () => {} },
			"query",
		);
		expect(result.data).toEqual({ ok: true });
	});
});
