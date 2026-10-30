/**
 * GraphQL execution context.
 *
 * The context carries the resolved viewer (or `null`), the session that
 * authenticated the request, the database handle, runtime configuration, and
 * request metadata used for the audit trail.
 */

import type { AppConfig } from "../config";
import type { DatabaseHandle } from "../db";
import type { RoleCode } from "../db/enums";

export interface Viewer {
	id: string;
	userCode: string;
	fullName: string;
	email: string;
	departmentId: string | null;
	isActive: boolean;
	roleCodes: RoleCode[];
}

export interface ResolvedSession {
	id: string;
	token: string;
	expiresAt: Date;
	ipAddress: string | null;
	userAgent: string | null;
}

export interface RequestMetadata {
	ipAddress: string | null;
	userAgent: string | null;
}

export interface ViewerContext {
	viewer: Viewer | null;
	session: ResolvedSession | null;
	db: DatabaseHandle;
	config: AppConfig;
	request: RequestMetadata;
	/** Per-request memo cache, keyed by `"<type>:<id>"`. */
	cache: Map<string, unknown>;
}

/** Context passed to public (unauthenticated) operations. */
export function createContext(input: {
	db: DatabaseHandle;
	config: AppConfig;
	request: RequestMetadata;
	viewer?: Viewer | null;
	session?: ResolvedSession | null;
}): ViewerContext {
	return {
		db: input.db,
		config: input.config,
		request: input.request,
		viewer: input.viewer ?? null,
		session: input.session ?? null,
		cache: new Map(),
	};
}

/**
 * Memoize an async lookup within a single GraphQL request, coalescing
 * concurrent callers. The in-flight promise is cached (not only its resolved
 * value), so fields resolving concurrently for the same key — a list's rows
 * each referencing the same user — share one query instead of racing into N. A
 * rejected load is evicted so a later caller can retry.
 */
export function cached<T>(
	ctx: ViewerContext,
	key: string,
	load: () => Promise<T>,
): Promise<T> {
	const existing = ctx.cache.get(key);
	if (existing !== undefined) return existing as Promise<T>;
	const inflight = load();
	ctx.cache.set(key, inflight);
	inflight.catch(() => {
		if (ctx.cache.get(key) === inflight) ctx.cache.delete(key);
	});
	return inflight;
}

/**
 * The GraphQL context value.
 *
 * Root resolvers are handed `{ ctx, auth }` so they can reach the authenticated
 * Better Auth instance, while object-type field resolvers receive the context
 * value directly and read `db`, `viewer` and the request cache off it. Both
 * therefore have to see the same request state: this value carries the viewer
 * context's own fields *and* exposes itself as `ctx` (sharing the same database
 * handle and cache map) alongside `auth`.
 */
export function graphqlContextValue(
	ctx: ViewerContext,
	auth: unknown,
): ViewerContext & { ctx: ViewerContext; auth: unknown } {
	return Object.assign({}, ctx, { ctx, auth });
}

/** Read the bearer token carried by an HTTP request. */
export function bearerTokenFrom(request: Request): string | null {
	const header = request.headers.get("authorization");
	if (!header) return null;
	const match = /^Bearer\s+(.+)$/i.exec(header.trim());
	if (!match) return null;
	const token = match[1]?.trim();
	return token && token.length > 0 ? token : null;
}
