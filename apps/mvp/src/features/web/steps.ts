import { FlowRuntime, Interpreter } from "@smthrs/flow"
import { Context, Effect, Layer } from "effect"
import { requesterOf } from "../../flows/requests"
import { ViewsClient } from "../views/api"
import { PreviewClient } from "./api"
import type { WebOutcome } from "./contract"
import {
  CheckPage,
  type CheckedPage,
  OpenWebPage,
  type PreviewedPage,
  PreviewPage,
  ShowPage,
  WebPageForbidden,
  type WebPageOpened,
  WebPageRefused,
  WebPageUnavailable,
} from "./flows"
import { type Opening, recordOpening, withOpenSpan } from "./metrics"
import { checkUrl, type Policy } from "./url"

// What `app/web/open`'s steps run on (docs/features/web-pages.md#the-flow): the host's URL policy (`WebPolicy`), ChatApi's
// page check (`PreviewClient`) and ChatApi's views route (`ViewsClient`). Each step runs in a span `web.page.open`. The agent's openings are counted and
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

/** What a refused request to ChatApi means to the step, and the outcome it is counted as. */
const failureOf = (status: number | undefined) =>
  status === 400
    ? { error: new WebPageRefused({ reason: "invalid" }), outcome: "refused" as const }
    : status === 401 || status === 403
    ? { error: new WebPageForbidden(), outcome: "forbidden" as const }
    : { error: new WebPageUnavailable(), outcome: "unavailable" as const }

/**
 * `app/web/preview`: ChatApi checks the page, as a frame would request it, and answers whether a frame shows it and
 * what a card shows instead. ChatApi refusing the page is `WebPageRefused`, a person who may not add to the conversation
 * `WebPageForbidden`, and anything else `WebPageUnavailable`, which the step's retry policy tries again; each failed
 * attempt of the agent's is recorded.
 */
export const preview = (page: CheckedPage) =>
  Effect.gen(function* () {
    const checked = yield* (yield* PreviewClient).check({ url: page.href, mode: page.mode }).pipe(Effect.result)
    if (checked._tag === "Success") {
      yield* Effect.annotateCurrentSpan({ "smithers.web.framing": checked.success.framing })
      return checked.success
    }
    const failed = failureOf(checked.failure.status)
    yield* Effect.annotateCurrentSpan({ "smithers.web.outcome": failed.outcome })
    yield* recordAgentOpening({ mode: page.mode, outcome: failed.outcome })
    return yield* Effect.fail(failed.error)
  }).pipe(withOpenSpan(page.mode))

/** What a card or a framed page shows of the page while it loads: its title, description and icon, when it has them. */
const previewProps = ({ title, description, icon }: PreviewedPage["preview"]) => ({
  ...(title === undefined ? {} : { title }),
  ...(description === undefined ? {} : { description }),
  ...(icon === undefined ? {} : { icon }),
})

/**
 * `app/web/show`: adds the view: a `webpage` for an `embed` a frame shows, and a `link` card for `tab` or for an `embed`
 * of a page that refuses framing or couldn't be checked, so the person never sees a blank frame. ChatApi refusing the
 * page is `WebPageRefused`, a person who may not add to the conversation `WebPageForbidden`, and anything else
 * `WebPageUnavailable`, which the step's retry policy tries again.
 */
export const show = ({ page, preview }: PreviewedPage) =>
  Effect.gen(function* () {
    const framed = page.mode === "embed" && preview.framing === "allowed"
    const added = yield* (yield* ViewsClient).add({
      id: page.viewId,
      template: framed ? "webpage" : "link",
      props: { url: page.href, ...previewProps(preview) },
      ...(yield* conversationOf(page)),
    }).pipe(Effect.result)
    const outcome: WebOutcome = added._tag === "Success"
      ? framed ? "embedded" : "card"
      : failureOf(added.failure.status).outcome
    yield* Effect.annotateCurrentSpan({ "smithers.web.outcome": outcome })
    yield* recordAgentOpening({ mode: page.mode, outcome, framing: preview.framing })
    if (added._tag === "Failure") return yield* Effect.fail(failureOf(added.failure.status).error)
    return {
      viewId: page.viewId,
      origin: page.origin,
      mode: page.mode,
      shown: framed ? "page" : "card",
      framing: preview.framing,
      ...(preview.title === undefined ? {} : { title: preview.title }),
    } satisfies WebPageOpened
  }).pipe(withOpenSpan(page.mode))

/** Registers `app/web/open` with its steps, over the host's `WebPolicy`, `PreviewClient` and `ViewsClient`. */
export const registration = Interpreter.layerWithImplementations(
  OpenWebPage,
  Layer.mergeAll(CheckPage.toLayer(check), PreviewPage.toLayer(preview), ShowPage.toLayer(show)),
)
