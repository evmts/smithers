// D38/EK1005 (A-2, E-4): the model host's Fetch handler is a runner boundary. It
// awaits each request's bounded body and runs each route's program with
// Effect.runPromiseExit under the request's signal, then answers a Response, so it
// stays TypeScript. The programs, the grants, the body decoding and the failure
// classification are HostServer.vibe's, handed in as `TurnRoutes`.
import type * as Model from "@smthrs/model/Model"
import type { ModelError } from "@smthrs/model/ModelError"
import type { ContextPreflightInput } from "@smthrs/rpc/ContextPreflight"
import type { StartAgentTurnRequest } from "@smthrs/rpc/NativeAgent"
import { Effect, Exit } from "effect"
import type * as Cause from "effect/Cause"
import type { ContextPreflightAnswer } from "./ContextPreflight.vibe"
import type { DurableChatGrant } from "./DurableChatProducer.vibe"
import type { HostDiagnostics } from "./HostDiagnostics.ts"
import type { ModelTurnResolution } from "./HostServer.vibe"
import { boundedJson } from "./internal/BoundedJson.ts"
import type { ProducerError, ResolveFailed, StreamTooLarge } from "./ModelHostError.vibe"

type TurnCause = Cause.Cause<ResolveFailed | ProducerError | Model.ModelFailure | StreamTooLarge>

/** What one handler routes to: HostServer.vibe's programs and helpers, bound to its options. */
export interface TurnRoutes<Failure extends { readonly response: string; readonly transport?: object }> {
  readonly paths: { readonly health: string; readonly stream: string; readonly select: string; readonly turn: string }
  readonly protocol: string
  readonly authorized: (request: Request) => boolean
  readonly streamRequest: (value: unknown) => StartAgentTurnRequest | undefined
  readonly streamGrant: (body: StartAgentTurnRequest) => DurableChatGrant
  readonly diagnostics: (turnId: string) => HostDiagnostics
  readonly resolve: (grant: DurableChatGrant) => Effect.Effect<ModelTurnResolution, ResolveFailed>
  readonly streamLines: (
    resolved: ModelTurnResolution,
    body: StartAgentTurnRequest,
    diagnostics: HostDiagnostics
  ) => Effect.Effect<ReadonlyArray<string>, Model.ModelFailure | ModelError | StreamTooLarge>
  readonly streamRefused: (
    diagnostics: HostDiagnostics,
    stage: "resolve" | "stream",
    cause: Cause.Cause<ResolveFailed | Model.ModelFailure | StreamTooLarge>
  ) => Response
  readonly selectionRequest: (
    value: unknown
  ) => { readonly runId: string; readonly ownerId: number; readonly contextSelection: ContextPreflightInput } | undefined
  readonly selectionGrant: (body: { readonly runId: string; readonly ownerId: number }) => DurableChatGrant
  readonly selectContext: (
    grant: DurableChatGrant,
    contextSelection: ContextPreflightInput
  ) => Effect.Effect<ContextPreflightAnswer, ResolveFailed | Model.ModelFailure | ModelError>
  readonly decodeGrant: (value: unknown) => DurableChatGrant | undefined
  readonly durableTurn: (grant: DurableChatGrant) => Effect.Effect<void, ResolveFailed | ProducerError | Model.ModelFailure>
  readonly classify: (cause: TurnCause) => Failure
  readonly recordSuccess: (elapsed: number) => Effect.Effect<void>
  readonly recordFailure: (failed: Failure, grant: DurableChatGrant, elapsed: number) => Effect.Effect<void>
}

export const serveModelTurns = <Failure extends { readonly response: string; readonly transport?: object }>(
  routes: TurnRoutes<Failure>
): (request: Request) => Promise<Response> =>
async (request) => {
  const url = new URL(request.url)
  if (url.pathname === routes.paths.health && request.method === "GET") {
    return Response.json({ protocol: routes.protocol })
  }
  if (url.pathname === routes.paths.stream) {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 })
    if (!routes.authorized(request)) {
      return Response.json({ status: "error", code: "forbidden" }, { status: 401 })
    }
    const body = routes.streamRequest(await boundedJson(request))
    if (body === undefined) return Response.json({ status: "error", code: "request_invalid" }, { status: 400 })
    const grant = routes.streamGrant(body)
    const diagnostics = routes.diagnostics(grant.turnId)
    const resolveExit = await Effect.runPromiseExit(routes.resolve(grant), { signal: request.signal })
    if (Exit.isFailure(resolveExit)) return routes.streamRefused(diagnostics, "resolve", resolveExit.cause)
    const streamExit = await Effect.runPromiseExit(routes.streamLines(resolveExit.value, body, diagnostics), {
      signal: request.signal
    })
    if (Exit.isFailure(streamExit)) return routes.streamRefused(diagnostics, "stream", streamExit.cause)
    return new Response(streamExit.value.join(""), {
      status: 200,
      headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" }
    })
  }
  if (url.pathname === routes.paths.select) {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 })
    if (!routes.authorized(request)) {
      return Response.json({ status: "error", code: "forbidden" }, { status: 401 })
    }
    const body = routes.selectionRequest(await boundedJson(request))
    if (body === undefined) return Response.json({ status: "error", code: "request_invalid" }, { status: 400 })
    const exit = await Effect.runPromiseExit(routes.selectContext(routes.selectionGrant(body), body.contextSelection), {
      signal: request.signal
    })
    if (Exit.isSuccess(exit)) return Response.json(exit.value.result)
    return Response.json({ status: "error", code: routes.classify(exit.cause).response }, { status: 502 })
  }
  if (url.pathname !== routes.paths.turn) return new Response("Not found", { status: 404 })
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 })
  if (!routes.authorized(request)) {
    return Response.json({ status: "error", code: "forbidden" }, { status: 401 })
  }
  const grant = routes.decodeGrant(await boundedJson(request))
  if (grant === undefined) return Response.json({ status: "error", code: "request_invalid" }, { status: 400 })
  const started = performance.now()
  const exit = await Effect.runPromiseExit(routes.durableTurn(grant), { signal: request.signal })
  const elapsed = performance.now() - started
  if (Exit.isSuccess(exit)) {
    await Effect.runPromise(routes.recordSuccess(elapsed))
    return new Response(null, { status: 204 })
  }
  // The durable Go boundary records the generic terminal receipt after this refusal.
  const failed = routes.classify(exit.cause)
  await Effect.runPromise(routes.recordFailure(failed, grant, elapsed))
  return Response.json({
    status: "error",
    code: failed.response,
    ...(failed.transport === undefined ? {} : { transport: failed.transport })
  }, { status: 502 })
}
