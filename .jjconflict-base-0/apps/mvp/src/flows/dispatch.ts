import type { Flow as FlowTypes } from "@smthrs/flow"
import { FlowRuntime } from "@smthrs/flow"
import { BrowserEngine } from "@smthrs/platform-browser"
import { Cause, Clock, Context, Effect, Exit, Layer, Metric, Option, Schema } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"
import { FLOWS_ROUTE } from "./contract"
import { whereFor } from "./placement"
import { type Entry, type FlowName, type FlowOf, registry } from "./registry"

// Dispatch (docs/features/flows.md#dispatch): the one way the UI runs a flow. A button, a slash command, a view and
// the composer call `FlowDispatch.dispatch` with a registered name; the agent calls the same declarations from its
// cells. A client flow runs on this device's durable engine (`ClientEngine`); a remote one starts at the server's
// door (`RemoteFlows`). Every dispatch is a span, a log line and a count, and none carries the flow's input. Dispatch
// reads only a flow's reference, its tag and schemas (src/flows/registry.ts), so the tab never loads a flow's steps.

/** What started a dispatch. */
export type Door = "button" | "slash" | "view" | "composer" | "agent"

/** How a dispatch ended: the flow's value, its declared failure, started remotely, or not run at all (`error`). */
export type DispatchOutcome = "done" | "failed" | "started" | "error"

/** A flow's success and declared failure. */
export type SuccessOf<N extends FlowName> = FlowOf<N>["successSchema"]["Type"]
export type FailureOf<N extends FlowName> = FlowOf<N>["errorSchema"]["Type"]
export type PayloadOf<N extends FlowName> = FlowOf<N>["payloadSchema"]["Type"]

/** What a dispatch answers: a client flow's end, or a remote flow's start. */
export type Dispatched<N extends FlowName> =
  | { readonly _tag: "Done"; readonly value: SuccessOf<N> }
  | { readonly _tag: "Failed"; readonly error: FailureOf<N> }
  | { readonly _tag: "Started"; readonly executionId: string }

/**
 * The flow didn't run to an answer: the engine or the server refused it (`refused`), this tab has no engine because
 * its worker failed (`unavailable`), its input didn't encode (`invalid`), it died (`defect`) or was interrupted
 * (`interrupted`). Never a message: those can quote the input.
 */
export class DispatchFailed extends Schema.TaggedError<DispatchFailed>()("@smthrs/mvp/flows/DispatchFailed", {
  flow: Schema.String,
  reason: Schema.Literals(["refused", "unavailable", "invalid", "defect", "interrupted"]),
}) {}

/** This device's durable engine, as dispatch reaches it: runs a client flow to its end and answers how it ended. */
export class ClientEngine extends Context.Service<
  ClientEngine,
  {
    readonly run: (
      flow: BrowserEngine.FlowReference,
      options: { readonly executionId: string; readonly payload: unknown },
    ) => Effect.Effect<Exit.Exit<unknown, unknown>, DispatchFailed>
  }
>()("@smthrs/mvp/flows/ClientEngine") {
  /**
   * The tab's engine: the leader tab's worker, reached through `@smthrs/platform-browser`'s `BrowserEngine`
   * (decision 0011 §4). A refused request or a payload that won't encode is `DispatchFailed`.
   */
  static readonly layerBrowser = Layer.effect(
    ClientEngine,
    Effect.gen(function* () {
      const engine = yield* BrowserEngine.BrowserEngine
      return ClientEngine.of({
        run: (flow, options) =>
          engine.start(flow, options as never).pipe(
            Effect.andThen(engine.result(flow, options.executionId)),
            Effect.mapError((error) =>
              new DispatchFailed({
                flow: flow._tag,
                reason: error._tag === "SchemaError"
                  ? "invalid"
                  : error._tag === "@smthrs/platform-browser/EngineUnavailable"
                  ? "unavailable"
                  : "refused",
              })
            ),
          ),
      })
    }),
  )

  /**
   * An engine in this process: the `FlowRuntime` a Node or Bun host composes, for the native app and the tests. It
   * runs the declaration in `flows` that a dispatched reference names (src/flows/declarations.ts `clientFlows`); a
   * name none of them declares is `refused`.
   */
  static readonly layerRuntime = (flows: ReadonlyArray<FlowTypes.Any>) =>
    Layer.effect(
      ClientEngine,
      Effect.gen(function* () {
        const runtime = yield* FlowRuntime.FlowRuntime
        const declared = new Map(flows.map((flow) => [flow._tag, flow]))
        return ClientEngine.of({
          run: (flow, options) => {
            const declaration = declared.get(flow._tag)
            return declaration === undefined
              ? Effect.fail(new DispatchFailed({ flow: flow._tag, reason: "refused" }))
              : Effect.exit(runtime.execute(declaration as never, options as never) as Effect.Effect<unknown, unknown>)
          },
        })
      }),
    )
}

/** The server's door for remote flows (`POST /api/flows/<name>`), as dispatch reaches it. */
export class RemoteFlows extends Context.Service<
  RemoteFlows,
  {
    readonly start: (
      flow: BrowserEngine.FlowReference,
      options: { readonly executionId: string; readonly payload: unknown },
    ) => Effect.Effect<void, DispatchFailed>
  }
>()("@smthrs/mvp/flows/RemoteFlows") {
  /**
   * The door on `origin`, over Effect `HttpClient`: `{ executionId, payload }` with the payload encoded by the flow's
   * own schema. 202 (started) and 200 (already started) both start it; any other answer is `refused`.
   */
  static readonly layerHttp = (origin: string) =>
    Layer.effect(
      RemoteFlows,
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient
        return RemoteFlows.of({
          start: (flow, options) =>
            Effect.gen(function* () {
              const payload = yield* Schema.encodeUnknownEffect(
                Schema.toCodecJson(flow.payloadSchema as unknown as Schema.Codec<unknown>),
              )(
                options.payload,
              ).pipe(Effect.mapError(() => new DispatchFailed({ flow: flow._tag, reason: "invalid" })))
              const request = HttpClientRequest.post(`${origin}${FLOWS_ROUTE}/${flow._tag}`).pipe(
                HttpClientRequest.bodyJsonUnsafe({ executionId: options.executionId, payload }),
              )
              const response = yield* client.execute(request).pipe(
                Effect.mapError(() => new DispatchFailed({ flow: flow._tag, reason: "refused" })),
              )
              if (response.status !== 200 && response.status !== 202) {
                return yield* new DispatchFailed({ flow: flow._tag, reason: "refused" })
              }
            }),
        })
      }),
    )
}

/** Dispatches, by `flow`, `placement`, `door` and `outcome`. */
export const dispatches = Metric.counter("smithers_flow_dispatches", {
  description: "Flows the app dispatched, by flow, placement, door and outcome",
  incremental: true,
})

/**
 * Dispatch over `entries`, a registry: runs the entry named `name` where its needs place it, and records the dispatch
 * as a span `flow.dispatch`, a log line and a count of `dispatches`, with the flow, its placement, the door and the
 * outcome, never the payload. `FlowDispatch.layer` binds the app's registry; a test binds its own.
 */
export const makeDispatch = <Entries extends Readonly<Record<string, Entry>>>(entries: Entries) =>
  Effect.gen(function* () {
    const engine = yield* ClientEngine
    const remote = yield* RemoteFlows
    return (
      name: keyof Entries & string,
      payload: unknown,
      options: { readonly door: Door; readonly executionId?: string },
    ): Effect.Effect<Dispatched<never>, DispatchFailed> => {
      const entry = entries[name]!
      const placement = whereFor(entry.needs)
      return Effect.gen(function* () {
        const startedAt = yield* Clock.currentTimeMillis
        const executionId = options.executionId ?? crypto.randomUUID()
        const fields: Record<string, string | number> = { flow: name, placement, door: options.door, executionId }
        const dispatched = yield* Effect.result(
          placement === "remote"
            ? Effect.as(remote.start(entry.flow, { executionId, payload }), { _tag: "Started" as const, executionId })
            : Effect.flatMap(engine.run(entry.flow, { executionId, payload }), (exit) => settled(name, exit)),
        )
        const outcome: DispatchOutcome = dispatched._tag === "Failure"
          ? "error"
          : dispatched.success._tag === "Done"
          ? "done"
          : dispatched.success._tag === "Failed"
          ? "failed"
          : "started"
        if (dispatched._tag === "Failure") fields.reason = dispatched.failure.reason
        fields.durationMs = (yield* Clock.currentTimeMillis) - startedAt
        yield* Metric.update(
          Metric.withAttributes(dispatches, { flow: name, placement, door: options.door, outcome }),
          1,
        )
        yield* Effect.annotateCurrentSpan({ "smithers.flow.outcome": outcome })
        yield* Effect.logWithLevel(outcome === "error" ? "Error" : outcome === "failed" ? "Warn" : "Info")(
          "flow.dispatch",
        ).pipe(Effect.annotateLogs({ ...fields, outcome }))
        return yield* (dispatched._tag === "Failure"
          ? Effect.fail(dispatched.failure)
          : Effect.succeed(dispatched.success))
      }).pipe(
        Effect.withSpan("flow.dispatch", {
          attributes: {
            "smithers.flow.name": name,
            "smithers.flow.placement": placement,
            "smithers.flow.door": options.door,
          },
        }),
      )
    }
  })

/** A client flow's end as dispatch answers it: its value, its declared failure, or `DispatchFailed`. */
const settled = (name: string, exit: Exit.Exit<unknown, unknown>): Effect.Effect<Dispatched<never>, DispatchFailed> => {
  if (Exit.isSuccess(exit)) return Effect.succeed({ _tag: "Done", value: exit.value as never })
  const error = Cause.findErrorOption(exit.cause)
  if (Option.isSome(error)) return Effect.succeed({ _tag: "Failed", error: error.value as never })
  return Effect.fail(
    new DispatchFailed({ flow: name, reason: Cause.hasInterruptsOnly(exit.cause) ? "interrupted" : "defect" }),
  )
}

/** Runs registered flows for the UI: `dispatch(name, payload, { door })`. */
export class FlowDispatch extends Context.Service<
  FlowDispatch,
  {
    readonly dispatch: <N extends FlowName>(
      name: N,
      payload: PayloadOf<N>,
      options: { readonly door: Door; readonly executionId?: string },
    ) => Effect.Effect<Dispatched<N>, DispatchFailed>
  }
>()("@smthrs/mvp/flows/FlowDispatch") {
  /** Dispatch of the app's registry over this device's engine and the server's door. */
  static readonly layer = Layer.effect(
    FlowDispatch,
    Effect.map(makeDispatch(registry), (dispatch) => FlowDispatch.of({ dispatch: dispatch as never })),
  )
}
