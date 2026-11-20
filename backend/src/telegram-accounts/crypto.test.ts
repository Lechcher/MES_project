import { describe, expect, test } from "bun:test";
import { ConfigurationError } from "../config";
import {
	decryptSession,
	encryptSession,
	requireTelegramKey,
	TELEGRAM_KEY_ENV_NAME,
} from "./crypto";

/** A valid 32-byte key as hex, generated for the test run. */
const KEY = "a".repeat(64);
const OTHER_KEY = "b".repeat(64);

describe("encryptSession / decryptSession", () => {
	test("round-trips a session string", () => {
		const plaintext = "1BAAOMTAwMzE4MjM4NDU2NzForExampleSessionString=";
		const stored = encryptSession(KEY, plaintext);
		expect(stored.ciphertext).not.toBe(plaintext);
		expect(stored.ciphertext.length).toBeGreaterThan(0);
		expect(decryptSession(KEY, stored)).toBe(plaintext);
	});

	test("uses a fresh IV per call", () => {
		const first = encryptSession(KEY, "same-plaintext");
		const second = encryptSession(KEY, "same-plaintext");
		expect(first.iv).not.toBe(second.iv);
		// The same plaintext under different IVs produces different ciphertext,
		// so the storage never leaks that two sessions are identical.
		expect(first.ciphertext).not.toBe(second.ciphertext);
	});

	test("rejects a tampered ciphertext", () => {
		const stored = encryptSession(KEY, "session-to-tamper");
		const bytes = Buffer.from(stored.ciphertext, "hex");
		bytes[0] ^= 0xff;
		expect(() =>
			decryptSession(KEY, { ...stored, ciphertext: bytes.toString("hex") }),
		).toThrow(ConfigurationError);
	});

	test("rejects a tampered auth tag", () => {
		const stored = encryptSession(KEY, "session-to-tamper");
		const tag = Buffer.from(stored.authTag, "hex");
		tag[0] ^= 0xff;
		expect(() =>
			decryptSession(KEY, { ...stored, authTag: tag.toString("hex") }),
		).toThrow(ConfigurationError);
	});

	test("cannot decrypt under a different key", () => {
		const stored = encryptSession(KEY, "session-under-key-a");
		expect(() => decryptSession(OTHER_KEY, stored)).toThrow(
			ConfigurationError,
		);
	});

	test("handles empty and multi-byte plaintext", () => {
		expect(decryptSession(KEY, encryptSession(KEY, ""))).toBe("");
		const unicode = "Phiên mã tiếng Việt — 𝕊随机 🔐";
		expect(decryptSession(KEY, encryptSession(KEY, unicode))).toBe(unicode);
	});
});

describe("requireTelegramKey", () => {
	test("refuses an unconfigured deployment with an actionable error", () => {
		try {
			requireTelegramKey(null);
			throw new Error("expected a ConfigurationError");
		} catch (error) {
			const failure = error as ConfigurationError;
			expect(failure).toBeInstanceOf(ConfigurationError);
			expect(failure.missing).toContain(TELEGRAM_KEY_ENV_NAME);
			expect(failure.message).toContain("openssl rand -hex 32");
			// The failure never suggests an insecure fallback.
			expect(failure.message.toLowerCase()).not.toContain("plaintext");
		}
	});

	test("refuses an empty key", () => {
		expect(() => requireTelegramKey("")).toThrow(ConfigurationError);
	});

	test("refuses a wrong-length key", () => {
		expect(() => requireTelegramKey("abcd")).toThrow(ConfigurationError);
	});

	test("accepts the configured key", () => {
		expect(requireTelegramKey(KEY)).toBe(KEY);
	});
});