/**
 * Shared page-size policy for the versioned list reads.
 *
 * Every list read is bounded: a default page size applies when the client omits
 * `limit`, and a maximum caps any larger request so no read returns an unbounded
 * row set (see `openspec/specs/backend/graphql-api` — List pagination and
 * filtering).
 */

/** Page size used when a list read omits `limit`. */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Largest page any single list read may return. Bounds runaway/malicious
 * limits while still allowing legitimate bulk reads the screens rely on (for
 * example a whole month of attendance across the org); list reads are now
 * O(1) per page, so a larger cap no longer costs the query blow-up that
 * motivated this change.
 */
export const MAX_PAGE_SIZE = 1000;

/** Clamp offset/limit to the bounded defaults; never returns an unbounded page. */
export function clampPageArgs(args: {
	offset?: number | null;
	limit?: number | null;
}): { offset: number; limit: number } {
	const offset = Math.max(0, Math.trunc(args.offset ?? 0));
	const requested = Math.trunc(args.limit ?? DEFAULT_PAGE_SIZE);
	const limit = Math.min(Math.max(1, requested), MAX_PAGE_SIZE);
	return { offset, limit };
}
