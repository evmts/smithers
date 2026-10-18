import type { Flow } from "@smthrs/flow"
import { Cause, Clock, Context, Effect, Metric, Option, Schema } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import { MAX_FLOW_BODY_BYTES } from "../src/flows/contract.ts"
import { Sessions } from "./Actor.ts"
import { readBounded } from "./Body.ts"
import { codeOf } from "./ErrorCode.ts"

// The remote door (docs/features/flows.md#the-remote-door): `POST /api/flows/<name> { executionId, payload }` starts a
// remote flow. Only a flow the app registered as remote and startable may start here (src/flows/registry.ts), only for
// a signed-in person, and only with a payload its own schema decodes. The device picks the execution id once and keeps
// it with its outbox entry, so a replayed start is byte-identical and changes nothing. Where an execution runs is
// injected (`FlowStarter`): a Durable Object in ChatApi (worker/ExecutionHost.ts), anything else in a test.

/** The execution id already holds a start with another payload. */
export class StartConflict extends Schema.TaggedError<StartConflict>()("@smthrs/mvp/flows/StartConflict", {}) {}

/** The remote host couldn't record the start. */
export class StartUnavailable extends Schema.TaggedError<StartUnavailable>()("@smthrs/mvp/flows/StartUnavailable", {
  errorCode: Schema.String,
}) {}

/** Where a remote execution starts: records the start, and the execution runs from there. */
export class FlowStarter extends Context.Service<
  FlowStarter,
  {
    readonly start: (
      flow: Flow.Any,
      options: { readonly executionId: string; readonly payload: unknown },
    ) => Effect.Effect<void, StartConflict | StartUnavailable>
  }
>()("@smthrs/mvp/flows/FlowStarter") {}

/** Door requests, by `flow` (empty for an unknown one) and `status`. */
export const requests = Metric.counter("smithers_flow_door_requests", {
  description: "Starts the remote door answered, by flow and status",
  incremental: true,
})

const Body = Schema.Struct({ executionId: Schema.String.check(Schema.isUUID()), payload: Schema.Json })

const decodeBody = Schema.decodeUnknownEffect(Schema.fromJsonString(Body))

const answer = (status: number, body: unknown) =>
  HttpServerResponse.jsonUnsafe(body, { status, headers: { "cache-control": "no-store" } })

/**
 * The door over `startable`, the flows it may start, by name. Each request is a log line `flow.door`, a span and a
 * count, with the flow, the execution id and the status, never the payload.
 */
export const make = (startable: ReadonlyArray<Flow.Any>) => {
  const byName = new Map(startable.map((flow) => [flow._tag, flow]))
  return (name: string) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const startedAt = yield* Clock.currentTimeMillis
      const flow = byName.get(name)
      const fields: Record<string, string | number> = { flow: flow === undefined ? "" : name }
      const response = yield* Effect.gen(function* () {
        if (flow === undefined) return answer(404, { code: "not_found" })
        if (request.method !== "POST") {
          return HttpServerResponse.empty({ status: 405, headers: { allow: "POST" } })
        }
        const actor = yield* (yield* Sessions).resolve
        if (Option.isNone(actor)) return answer(401, { code: "authentication" })
        const text = yield* readBounded(request, MAX_FLOW_BODY_BYTES).pipe(Effect.result)
        if (text._tag === "Failure") {
          return text.failure.reason === "too_large"
            ? answer(413, { code: "too_large" })
            : answer(400, { code: "invalid" })
        }
        const body = yield* decodeBody(text.success).pipe(Effect.option)
        if (Option.isNone(body)) return answer(400, { code: "invalid" })
        const executionId = body.value.executionId.toLowerCase()
        fields.executionId = executionId
        const payload = yield* Schema.decodeUnknownEffect(
          Schema.toCodecJson(flow.payloadSchema as unknown as Schema.Codec<unknown>),
        )(
          body.value.payload,
        ).pipe(Effect.option)
        if (Option.isNone(payload)) return answer(400, { code: "invalid_payload" })
        return yield* (yield* FlowStarter).start(flow, { executionId, payload: payload.value }).pipe(
          Effect.as(answer(202, { executionId })),
          Effect.catchTag("@smthrs/mvp/flows/StartConflict", () => Effect.succeed(answer(409, { code: "conflict" }))),
        )
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.sync(() => {
            fields.errorCode = errorCodeOf(cause)
            return answer(503, { code: "unavailable" })
          })
        ),
      )
      fields.status = response.status
      fields.durationMs = (yield* Clock.currentTimeMillis) - startedAt
      yield* Metric.update(
        Metric.withAttributes(requests, { flow: String(fields.flow), status: String(response.status) }),
        1,
      )
      yield* Effect.annotateCurrentSpan({ "http.response.status_code": response.status })
      yield* Effect.logWithLevel(response.status >= 500 ? "Error" : response.status >= 400 ? "Warn" : "Info")(
        "flow.door",
      ).pipe(Effect.annotateLogs(fields))
      return response
    }).pipe(Effect.withSpan("flow.door", { kind: "server", attributes: { "smithers.flow.name": name } }))
}

/** A failure's code: a `StartUnavailable`'s own, else the failure's `codeOf`. */
const errorCodeOf = (cause: Cause.Cause<unknown>): string => {
  const error = Cause.squash(cause)
  return error instanceof StartUnavailable ? error.errorCode : codeOf(error)
}
