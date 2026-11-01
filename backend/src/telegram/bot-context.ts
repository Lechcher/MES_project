/**
 * The bot's execution context.
 *
 * Every bot command runs with a grammY context extended by the resolved MES
 * viewer. The `ctx` (a `ViewerContext` built by the guard) is what command
 * handlers hand to the domain functions, so authorization on this surface is
 * literally the same check the GraphQL resolvers perform — same viewer, same
 * `authorize()` table.
 */

import type { Context as GrammyContext } from "grammy";
import type { Viewer, ViewerContext } from "../graphql/context";

export interface BotContext extends GrammyContext {
	/** The linked viewer, or null when the Telegram identity is not linked. */
	viewer: Viewer | null;
	/** The `ViewerContext` to hand to domain functions (null when unlinked). */
	viewerContext: ViewerContext | null;
}
