/**
 * Encryption for stored Telegram session strings.
 *
 * A GramJS `StringSession` is a bearer credential for a Telegram account: with
 * it, anyone can act as that account. Sessions are therefore stored only as
 * AES-256-GCM ciphertext under `TELEGRAM_ENCRYPTION_KEY` (32 bytes, hex), each
 * one with its own random IV and its auth tag, and decryptable only through
 * this module. The key never leaves the configuration it was read from, and no
 * function here logs key material or plaintext.
 *
 * An unset key is a deployment that has not configured the module: the link
 * flow refuses with an actionable configuration error instead of storing a
 * session in any weaker form.
 */

import {
	createCipheriv,
	createDecipheriv,
	randomFillSync,
} from "node:crypto";
import { ConfigurationError } from "../config";

/** Environment variable that carries the key, named in every failure. */
export const TELEGRAM_KEY_ENV_NAME = "TELEGRAM_ENCRYPTION_KEY";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
/** GCM's authentication tag: the tamper evidence kept beside the ciphertext. */
const AUTH_TAG_BYTES = 16;

/** A stored session, split so the migration's three columns stay independent. */
export interface EncryptedSession {
	/** Hex AES-GCM ciphertext of the `StringSession`. */
	readonly ciphertext: string;
	/** Hex IV the ciphertext was produced with. */
	readonly iv: string;
	/** Hex authentication tag verified on every decrypt. */
	readonly authTag: string;
}

/**
 * Resolve the configured key or refuse.
 *
 * `null` means the deployment never configured the module — refusing to store
 * a session is the specified behavior, and the message names the variable to
 * set. A wrong-length key is caught by `loadConfig` at startup; this is the
 * last line of defense for programmatic callers.
 */
export function requireTelegramKey(key: string | null): string {
	if (key === null || key === "") {
		throw new ConfigurationError(
			`Linking a Telegram account requires ${TELEGRAM_KEY_ENV_NAME} ` +
				"(generate with: openssl rand -hex 32). No session can be stored " +
				"without it.",
			[TELEGRAM_KEY_ENV_NAME],
		);
	}
	if (key.length !== KEY_BYTES * 2) {
		throw new ConfigurationError(
			`${TELEGRAM_KEY_ENV_NAME} must be 32 bytes as 64 hex characters.`,
			[TELEGRAM_KEY_ENV_NAME],
		);
	}
	return key;
}

function keyBuffer(key: string): Buffer {
	return Buffer.from(key, "hex");
}

/**
 * Encrypt one session string.
 *
 * A fresh random IV per call: reusing an IV under GCM would leak plaintext
 * relationships, so the random source is the crypto module's own CSPRNG.
 */
export function encryptSession(
	key: string,
	plaintext: string,
): EncryptedSession {
	const iv = randomFillSync(Buffer.alloc(IV_BYTES));
	const cipher = createCipheriv(ALGORITHM, keyBuffer(key), iv);
	const ciphertext = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	return {
		ciphertext: ciphertext.toString("hex"),
		iv: iv.toString("hex"),
		authTag: cipher.getAuthTag().toString("hex"),
	};
}

/**
 * Decrypt a stored session and verify its integrity.
 *
 * A modified ciphertext or tag fails the tag check and raises — the caller
 * treats that as a corrupted record, never as a session to use.
 */
export function decryptSession(
	key: string,
	session: EncryptedSession,
): string {
	try {
		const decipher = createDecipheriv(
			ALGORITHM,
			keyBuffer(key),
			Buffer.from(session.iv, "hex"),
		);
		decipher.setAuthTag(Buffer.from(session.authTag, "hex"));
		return Buffer.concat([
			decipher.update(Buffer.from(session.ciphertext, "hex")),
			decipher.final(),
		]).toString("utf8");
	} catch {
		throw new ConfigurationError(
			"The stored Telegram session could not be decrypted: it was " +
				"written with a different key or was modified. The account must " +
				"be linked again.",
		);
	}
}