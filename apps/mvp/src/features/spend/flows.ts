import { Action, Flow, RetryPolicy } from "@smthrs/flow"
import { Node, Placement } from "@smthrs/plan"
import { Schema } from "effect"
import { MAX_DESTINATIONS } from "./contract"
import { AlertChannelName } from "./schema"

// Where spend alerts go outside the app, as a flow (docs/features/spend-alerts.md#channels):
//
//   alert/channel { channel, destinations }   an Admin sets email addresses or a Telegram chat; none turns it off
//     alert/channel/request ─ POST /api/alert-channels
//
// The step tries again while ChatApi can't be reached, for an hour; a refusal is final. Setting the same destinations
// twice changes nothing. What the step does is steps.ts, which only an engine's host imports.

/** ChatApi refused the setting (`status`, a 4xx, with its `code`): it can't land, so it isn't tried again. */
export class ChannelRefused extends Schema.TaggedError<ChannelRefused>()("@smthrs/mvp/spend/ChannelRefused", {
  status: Schema.Number,
  code: Schema.optional(Schema.String),
}) {}

/** ChatApi couldn't be reached, or failed: tried again. Its client's span has the HTTP status. */
export class ChannelUnsent extends Schema.TaggedError<ChannelUnsent>()("@smthrs/mvp/spend/ChannelUnsent", {}) {}

/** What setting a channel can fail with. */
export const ChannelFailure = Schema.Union([ChannelRefused, ChannelUnsent])
export type ChannelFailure = typeof ChannelFailure.Type

/** 500 ms doubling to 30 s, for an hour: a setting saved offline lands once the device is back. A refusal is final. */
export const CHANNEL_RETRY = RetryPolicy.make({
  initialMs: 500,
  factor: 2,
  maxMs: 30_000,
  expirationMs: 60 * 60 * 1000,
  nonRetryable: ["@smthrs/mvp/spend/ChannelRefused"],
})

const payload = {
  channel: AlertChannelName,
  destinations: Schema.Array(Schema.String).check(Schema.isMaxLength(MAX_DESTINATIONS)),
}

/** The step: ask ChatApi to set the channel. */
export const ChannelRequestStep = Action.make("alert/channel/request", {
  payload,
  success: Schema.Struct({ saved: Schema.Boolean }),
  error: ChannelFailure,
  retryPolicy: CHANNEL_RETRY,
})

/** `alert/channel`: set where spend alerts go on one channel. */
export const AlertChannelSet = Flow.make("alert/channel", {
  description: "Set where the deployment's spend alerts go on one channel: email addresses, or one Telegram chat id. " +
    "No destinations turns the channel off. Admins only.",
  modelInvocable: false,
  payload,
  success: Schema.Struct({ saved: Schema.Boolean }),
  error: ChannelFailure,
  body: Node.capture({ action: ChannelRequestStep.name }, (request) => ChannelRequestStep.call(request)),
}).annotate(Flow.Placement, Placement.client())
