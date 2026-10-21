import { Action, Flow, RetryPolicy } from "@smthrs/flow"
import { Node, Placement } from "@smthrs/plan"
import { Schema } from "effect"
import { KNOWN_DOCS, MAX_URL_LENGTH, WEB_MODES } from "./contract"
import { REFUSALS } from "./url"

// `app/web/open { url, mode? }` (docs/features/web-pages.md): opens an outside web page for the person, from a person's
// `/web` or the agent's `ctx.call`. It never navigates the app and never opens a tab by itself: it adds a view to the
// conversation, which every device in it shows with the page's origin above it.
//
//   app/web/check: the URL against the host's policy (src/features/web/url.ts), and the view's id, sealed
//     ─▶ app/web/show: adds the view through ChatApi: `webpage` (embed: the page in a sandboxed frame) or `link`
//        (tab: a card whose Open button, a person's click, opens it in a new tab)
//
// Browsers open a tab only from a person's click or key, and this flow runs in the engine worker, so `tab` is a card. A
// person's own `/web … tab` opens the tab straight from their keypress when the browser still allows it, and runs this
// flow only when it doesn't (src/features/web/actions.ts). What the steps run on is injected
// (src/features/web/steps.ts), so only an engine's host imports that; the tab dispatches by this declaration.

/** How the page is shown. */
export const Mode = Schema.Literals(WEB_MODES)

/** The URL isn't one the app opens, by why (src/features/web/url.ts); never by echoing it. */
export class WebPageRefused extends Schema.TaggedError<WebPageRefused>()("@smthrs/mvp/web/WebPageRefused", {
  reason: Schema.Literals(REFUSALS),
}) {}

/** The person may not add to the conversation: signed out, or not a Member. */
export class WebPageForbidden extends Schema.TaggedError<WebPageForbidden>()("@smthrs/mvp/web/WebPageForbidden", {}) {}

/** ChatApi couldn't add the view: unreachable, or failing. */
export class WebPageUnavailable extends Schema.TaggedError<WebPageUnavailable>()(
  "@smthrs/mvp/web/WebPageUnavailable",
  {},
) {}

/** What `app/web/open` answers: the view it added, the origin the person sees, and how it shows the page. */
export const WebPageOpened = Schema.Struct({ viewId: Schema.String, origin: Schema.String, mode: Mode })
export type WebPageOpened = typeof WebPageOpened.Type

/** A page the policy allowed, with the id its view gets. */
export const CheckedPage = Schema.Struct({
  viewId: Schema.String,
  href: Schema.String,
  origin: Schema.String,
  mode: Mode,
  /** The branch conversation a person's open was asked in, pinned when they dispatched it (decision 0013 §1). */
  conversationId: Schema.optional(Schema.String),
})
export type CheckedPage = typeof CheckedPage.Type

const payload = {
  url: Schema.String.check(Schema.isMaxLength(MAX_URL_LENGTH)),
  mode: Schema.optional(Mode),
  // The branch conversation the person's tab showed when they asked (decision 0013 §1); the home conversation when
  // absent. An agent's call goes to its answer's conversation instead, whatever this says (src/features/web/steps.ts).
  conversationId: Schema.optional(Schema.String.check(Schema.isUUID())),
}

/**
 * The step: checks the URL and picks the view's id. Sealed, so a run resumed after a crash adds the very view it chose
 * before, never a second one.
 */
export const CheckPage = Action.make("app/web/check", {
  payload,
  success: CheckedPage,
  error: WebPageRefused,
  tier: "sealed",
})

/** How long `app/web/show` keeps trying while ChatApi is unreachable: 500 ms doubling to 8 s, for at most 2 minutes. */
export const SHOW_RETRY = RetryPolicy.make({
  initialMs: 500,
  factor: 2,
  maxMs: 8_000,
  expirationMs: 2 * 60_000,
  nonRetryable: ["@smthrs/mvp/web/WebPageRefused", "@smthrs/mvp/web/WebPageForbidden"],
})

/** The step: adds the view to the conversation. ChatApi checks the page again, and refuses what it won't keep. */
export const ShowPage = Action.make("app/web/show", {
  payload: CheckedPage.fields,
  success: WebPageOpened,
  error: Schema.Union([WebPageRefused, WebPageForbidden, WebPageUnavailable]),
  retryPolicy: SHOW_RETRY,
})

/** `app/web/open`: shows an outside web page in the conversation, or as a card that opens it in a new tab. */
export const OpenWebPage = Flow.make("app/web/open", {
  description: "Open an outside web page (an https URL) for the person. mode \"embed\", the default, shows the page " +
    "inside the chat with its origin above it; mode \"tab\" adds a card whose Open button opens it in a new browser " +
    "tab. Use it when the person asks to see, show, open or visit a page or a site's docs. For these docs open exactly " +
    `this page: ${Object.entries(KNOWN_DOCS).map(([name, url]) => `${name} ${url}`).join(", ")}. For another site, ` +
    "pick its URL yourself. Answers { viewId, origin, mode }.",
  modelInvocable: true,
  payload,
  success: WebPageOpened,
  error: Schema.Union([WebPageRefused, WebPageForbidden, WebPageUnavailable]),
  body: Node.capture({ check: CheckPage.name, show: ShowPage.name }, (page) =>
    CheckPage.call(page).pipe(
      Node.bindPlanned(Node.capture({ show: ShowPage.name }, (checked) => ShowPage.call(checked))),
    )),
}).annotate(Flow.Placement, Placement.client())
