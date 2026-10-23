/**
 * Resolver assembly.
 *
 * Each app module exports partial `query` and `mutation` resolver maps keyed by
 * the contract's field names. They are merged here into the executable schema's
 * root resolvers, together with the shared object-type field resolvers.
 */

import { auditLogMutation, auditLogQuery } from "./audit-log";
import { authMutation, authQuery } from "./auth";
import { coreMutation, coreQuery } from "./core";
import { jobsMutation, jobsQuery } from "./jobs";
import { performanceMutation, performanceQuery } from "./performance";
import { planningMutation, planningQuery } from "./planning";
import { reportsMutation } from "./reports";
import { settingsMutation, settingsQuery } from "./settings";

/**
 * Resolver signature.
 *
 * Each app module exports its maps typed with this shape, so least-privilege
 * typing is preserved at the call site while the merged map stays assignable.
 * `args` and `contextValue` are intentionally permissive: the context value is
 * always `{ ctx, auth }`, and every resolver narrows it itself.
 */

export type Resolver = (
	parent: any,
	args: any,
	contextValue: any,
	info: any,
) => unknown;

export const queryResolvers: Record<string, Resolver> = {
	...authQuery,
	...coreQuery,
	...jobsQuery,
	...planningQuery,
	...performanceQuery,
	...settingsQuery,
	...auditLogQuery,
};

export const mutationResolvers: Record<string, Resolver> = {
	...authMutation,
	...coreMutation,
	...jobsMutation,
	...planningMutation,
	...performanceMutation,
	...settingsMutation,
	...auditLogMutation,
	...reportsMutation,
};
