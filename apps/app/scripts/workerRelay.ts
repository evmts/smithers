import { isGatewayWorkspaceId } from "@smthrs/rpc/GatewayWorkspace"
import { Effect, Layer, Result } from "effect"
import { WORKER_FAILURES } from "@smthrs/rpc/WorkerFailureCodes"
import type { WorkerFailureCode } from "@smthrs/rpc/WorkerFailureCodes"
import { BodyTooLarge, BodyUnreadable } from "smithers-server/Failures"
import type { ServerResponse } from "node:http"
import { discardBody, fetchWithDeadline, readBoundedJson, Transport, transportFrom } from "smithers-server/Http"
import { decodeGatewayResponse, encodeGatewayRequest, GATEWAY_PROCEDURE_MOUNTS } from "./gatewayFrames"

/*
 * The local stand-in for `POST /api/workflow/rpc`, which the box's coding host
 * on the Smithers backend serves in production: the same request envelope,
 * the same answer shape and the same Worker refusals, relayed to a loopback
 * gateway with a bearer this process holds.
 */

// This adapter translates only the test NodeGateway framing. Repository syntax
// follows packages/backend/internal/compose/browser_flow.go; authorization stays
// with the actual backend in production, not with this owned fixture relay.
const isRelayRepoName = (value: string): boolean => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)
const json = (status: number, body: unknown): Response => Response.json(body, { status })
const refuse = (code: WorkerFailureCode, message: string): Response =>
  json(WORKER_FAILURES[code].status, { status: "error", code, message })
const readBody = (request: Request): Effect.Effect<unknown> => readBoundedJson(request, 1024 * 1024).pipe(
  Effect.catch(failure => Effect.succeed(refuse(
    failure._tag === "BodyTooLarge" ? "request_body_too_large" : failure._tag === "BodyNotJson" ? "request_body_not_json" : "request_body_unreadable",
    "The relay could not read that request."
  )))
)

// Gateway responses are NDJSON rather than JSON. Bound the bytes while reading
// and cancel an unfinished stream on a ceiling, read failure, or interruption.
const readBoundedText = (response: Response, limit: number): Effect.Effect<string, BodyTooLarge | BodyUnreadable> => {
  if (Number(response.headers.get("content-length") ?? "0") > limit)
    return Effect.andThen(discardBody(response), Effect.fail(new BodyTooLarge({ limit })))
  if (response.body === null) return Effect.succeed("")
  return Effect.acquireUseRelease(
    Effect.sync(() => ({ reader: response.body!.getReader(), finished: false })),
    held => Effect.gen(function* () {
      const chunks: Uint8Array[] = []
      let size = 0
      for (;;) {
        const part = yield* Effect.tryPromise({ try: () => held.reader.read(), catch: cause => new BodyUnreadable({ cause }) })
        if (part.done) { held.finished = true; break }
        size += part.value.byteLength
        if (size > limit) return yield* Effect.fail(new BodyTooLarge({ limit }))
        chunks.push(part.value)
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      return new TextDecoder().decode(bytes)
    }),
    held => Effect.promise(() => held.finished ? Promise.resolve() : held.reader.cancel().catch(() => undefined)).pipe(
      Effect.ensuring(Effect.sync(() => held.reader.releaseLock()))
    )
  )
}

/** The most of one gateway answer the relay reads, as the Worker bounds a box answer. */
const ANSWER_MAX_BYTES = 4 * 1024 * 1024

const relayCall = (body: unknown) => {
  const candidate = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : undefined
  const repo = typeof candidate?.repo === "string" && isRelayRepoName(candidate.repo) ? candidate.repo : undefined
  const procedure = typeof candidate?.procedure === "string" ? candidate.procedure : ""
  if (repo === undefined || procedure === "") {
    return refuse("request_invalid", "Body must be { repo, procedure, payload? }.")
  }
  if (!isGatewayWorkspaceId(candidate?.workspaceId)) {
    return refuse("request_invalid", "Body must name a box: workspaceId.")
  }
  const mount = Object.hasOwn(GATEWAY_PROCEDURE_MOUNTS, procedure) ? GATEWAY_PROCEDURE_MOUNTS[procedure] : undefined
  if (mount === undefined) {
    return refuse("procedure_not_relayed", `The flow seam does not relay ${procedure}.`)
  }
  return { procedure, mount, text: encodeGatewayRequest(procedure, candidate?.payload) }
}

const relayResponse = (response: Response): Effect.Effect<Response> => Effect.gen(function* () {
  if (response.status !== 200) {
    yield* discardBody(response)
    return json(200, { ok: false, error: { message: `The workspace answered HTTP ${response.status}.` } })
  }
  const read = yield* Effect.result(readBoundedText(response, ANSWER_MAX_BYTES))
  if (Result.isFailure(read)) {
    return read.failure._tag === "BodyTooLarge"
      ? refuse("upstream_malformed", "The workspace answer is larger than 4 MiB.")
      : refuse("upstream_unreachable", "The workspace answer broke off before it ended.")
  }
  return json(200, decodeGatewayResponse(read.success))
})

/** Only authentication and gateway discovery differ from the deployed route. */
export const relayRpc = (request: Request, gatewayUrl: string, credential: string, forwarded?: (procedure: string) => void, deadlineMs = 30_000): Promise<Response> =>
  Effect.runPromise(Effect.gen(function* () {
    const body = yield* readBody(request)
    if (body instanceof Response) return body
    const call = relayCall(body)
    if (call instanceof Response) return call
    forwarded?.(call.procedure)
    const response = yield* fetchWithDeadline("workspace", `${gatewayUrl}${call.mount}`, {
      method: "POST", headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" }, body: call.text, signal: request.signal
    }, deadlineMs)
    return yield* relayResponse(response)
  }).pipe(Effect.catch(failure => Effect.succeed(refuse(failure._tag === "UpstreamTimeout" ? "upstream_timeout" : "upstream_unreachable", "The workspace could not be reached."))), Effect.provide(Layer.succeed(Transport, transportFrom(fetch)))))

export const writeResponse = async (response: Response, target: ServerResponse): Promise<void> => {
  target.writeHead(response.status, Object.fromEntries(response.headers))
  target.end(Buffer.from(await response.arrayBuffer()))
}
