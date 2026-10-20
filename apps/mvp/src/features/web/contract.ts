// The web pages' contract (docs/features/web-pages.md): the one home of the values the tab, the engine worker, ChatApi
// and the tests share. Nothing here imports a library, so every side can.

/** How `app/web/open` shows a page: in the conversation (`embed`), or as a card whose button opens a new tab (`tab`). */
export const WEB_MODES = ["embed", "tab"] as const

/** One of {@link WEB_MODES}. */
export type WebMode = (typeof WEB_MODES)[number]

/** The longest URL `app/web/open` takes, in characters. */
export const MAX_URL_LENGTH = 2_048

/**
 * The composer's line when a person's `/web` names a page the app won't open, by why (src/features/web/url.ts
 * `Refusal`): what to do instead, never the URL.
 */
export const CANT_OPEN = {
  invalid: "That isn't a web address",
  scheme: "Only https pages open",
  insecure: "Only https pages open",
  credentials: "Take the name and password out of the address",
  same_origin: "That's a page of this app: use /navigate",
  same_site: "This site's pages open in a new tab: add tab",
} as const

/**
 * How one opening ended, as the `smithers_web_pages_opened` count names it:
 * - `embedded`: the page is a view in the conversation;
 * - `card`: a card in the conversation opens it in a new tab;
 * - `opened`: a person's own `/web` opened the tab at once, from their keypress or click;
 * - `refused`: the URL isn't one the app opens;
 * - `forbidden`: the person may not add to the conversation: signed out, or not a Member;
 * - `unavailable`: the view couldn't be added this attempt; the step runs again by its retry policy.
 */
export const WEB_OUTCOMES = ["embedded", "card", "opened", "refused", "forbidden", "unavailable"] as const

/** One of {@link WEB_OUTCOMES}. */
export type WebOutcome = (typeof WEB_OUTCOMES)[number]

/**
 * What web pages record in the browser and its engine worker (docs/observability.md#browser), by name, and the
 * attributes they carry: an opening's log line and span, its count, and the agent's call of the flow, its own span.
 * None carries a URL, an origin or a path.
 * ChatApi's relay keeps exactly what src/telemetry.ts merges from every feature.
 */
export const WEB_TELEMETRY = {
  records: ["web.page.open", "smithers_web_pages_opened", "execute_tool app/web/open"],
  fields: [
    "web_mode",
    "door",
    "outcome",
    "reason",
    "smithers.web.mode",
    "smithers.web.door",
    "smithers.web.outcome",
  ],
} as const
