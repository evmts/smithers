// The conversation's views contract (docs/features/web-pages.md#the-views-table, decision 0004 §8): the one home of the
// values the tab, the engine worker, ChatApi and the tests share. Nothing here imports a library, so every side can.

/** ChatApi's route that adds a view to the conversation: `POST`. */
export const VIEWS_ROUTE = "/api/views"

/** ChatApi's Electric shape proxy for `views`: `GET`. */
export const VIEWS_SHAPE_ROUTE = "/api/shapes/views"

/** The Postgres table the shape proxy serves. */
export const VIEWS_TABLE = "views"

/**
 * The templates a view renders with (decision 0004 §3): our own React, rendered natively in the conversation.
 * - `webpage`: an outside page in a sandboxed frame, with its origin and an "Open in new tab" link above it;
 * - `link`: a card with an outside page's origin and an Open button, which opens it in a new tab.
 */
export const VIEW_TEMPLATES = ["webpage", "link"] as const

/** One of {@link VIEW_TEMPLATES}. */
export type ViewTemplate = (typeof VIEW_TEMPLATES)[number]

/** The largest `POST /api/views` body: 8 KiB. */
export const MAX_VIEW_BODY_BYTES = 8 * 1024

/** The route that shows one view full screen (decision 0004 §6): `/app/views/<id>`. */
export const viewPath = (viewId: string): string => `/app/views/${viewId}`
