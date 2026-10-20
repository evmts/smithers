import { FlowRuntime, Interpreter } from "@smthrs/flow"
import { Context, Effect, Layer } from "effect"
import { requesterOf } from "../../flows/requests"
import { ViewsClient } from "../views/api"
import type { WebOutcome } from "./contract"
import {
  CheckPage,
  type CheckedPage,
  OpenWebPage,
  ShowPage,
  WebPageForbidden,
  type WebPageOpened,
  WebPageRefused,
  WebPageUnavailable,
} from "./flows"
import { type Opening, recordOpening, withOpenSpan } from "./metrics"
import { checkUrl, type Policy } from "./url"

// What `app/web/open`'s steps run on (docs/features/web-pages.md#the-flow): the host's URL policy (`WebPolicy`) and
// ChatApi's views route (`ViewsClient`). Each step runs in a span `web.page.open`. The agent's openings are counted and
// logged here, by outcome; a person's by the tab that dispatched them, which knows their door (src/features/web/web.ts).
// The agent's call is a child execution of the answer's run, so its id isn't its own requester (src/flows/requests.ts).

/** Which pages this host opens: `http:` on this machine only in development, and never the app's own origin. */
export class WebPolicy extends Context.Service<WebPolicy, Policy>()("@smthrs/mvp/web/WebPolicy") {
  static readonly layer = (policy: Policy) => Layer.succeed(WebPolicy, policy)
}

/** Records `opening` when the running execution is the agent's call; a person's tab records its own. */
const recordAgentOpening = (opening: Omit<Opening, "door">) =>
  Effect.flatMap(FlowRuntime.FlowInstance, ({ executionId }) =>
    requesterOf(executionId) === executionId ? Effect.void : recordOpening({ ...opening, door: "agent" }))

/** `app/web/check`: the URL against the host's policy, and a fresh id for the view. */
export const check = (page: {
  readonly url: string
  readonly mode?: CheckedPage["mode"] | undefined
  readonly conversationId?: string | undefined
}) => {
  const mode = page.mode ?? "embed"
  return Effect.gen(function* () {
    const checked = checkUrl(page.url, mode, yield* WebPolicy)
    if (checked.ok) {
      const { href, origin } = checked.page
      return {
        viewId: crypto.randomUUID(),
        href,
        origin,
        mode,
        ...(page.conversationId === undefined ? {} : { conversationId: page.conversationId.toLowerCase() }),
      } satisfies CheckedPage
    }
    yield* Effect.annotateCurrentSpan({ "smithers.web.outcome": "refused" })
    yield* recordAgentOpening({ mode, outcome: "refused", reason: checked.reason })
    return yield* new WebPageRefused({ reason: checked.reason })
  }).pipe(withOpenSpan(mode))
}

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

/**
 * Where the view goes (decision 0013 §1): an agent's call is a child of its answer's run, so it goes to that answer's
 * conversation, which ChatApi looks up, however the person's tab moved since; a person's open goes to the conversation
 * pinned when they dispatched it. The execution id says which, so a resumed run decides the same.
 */
const conversationOf = (page: CheckedPage) =>
  Effect.map(FlowRuntime.FlowInstance, ({ executionId }) => {
    const requester = requesterOf(executionId)
    if (requester !== executionId && isUuid(requester)) return { answerId: requester.toLowerCase() }
    return page.conversationId === undefined ? {} : { conversationId: page.conversationId }
  })

/** What a refused add means to the step, and the outcome it is counted as. */
const failureOf = (status: number | undefined) =>
  status === 400
    ? { error: new WebPageRefused({ reason: "invalid" }), outcome: "refused" as const }
    : status === 401 || status === 403
    ? { error: new WebPageForbidden(), outcome: "forbidden" as const }
    : { error: new WebPageUnavailable(), outcome: "unavailable" as const }

/**
 * `app/web/show`: adds the view, a `webpage` for `embed` and a `link` card for `tab`. ChatApi refusing the page is
 * `WebPageRefused`, a person who may not add to the conversation `WebPageForbidden`, and anything else
 * `WebPageUnavailable`, which the step's retry policy tries again.
 */
export const show = (page: CheckedPage) =>
  Effect.gen(function* () {
    const added = yield* (yield* ViewsClient).add({
      id: page.viewId,
      template: page.mode === "embed" ? "webpage" : "link",
      props: { url: page.href },
      ...(yield* conversationOf(page)),
    }).pipe(Effect.result)
    const outcome: WebOutcome = added._tag === "Success"
      ? page.mode === "embed" ? "embedded" : "card"
      : failureOf(added.failure.status).outcome
    yield* Effect.annotateCurrentSpan({ "smithers.web.outcome": outcome })
    yield* recordAgentOpening({ mode: page.mode, outcome })
    if (added._tag === "Failure") return yield* Effect.fail(failureOf(added.failure.status).error)
    return { viewId: page.viewId, origin: page.origin, mode: page.mode } satisfies WebPageOpened
  }).pipe(withOpenSpan(page.mode))

/** Registers `app/web/open` with its steps, over the host's `WebPolicy` and `ViewsClient`. */
export const registration = Interpreter.layerWithImplementations(
  OpenWebPage,
  Layer.merge(CheckPage.toLayer(check), ShowPage.toLayer(show)),
)
