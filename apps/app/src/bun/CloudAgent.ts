import { Cause, Effect, Fiber, FiberSet, Scope } from "effect"
import { randomBytes } from "node:crypto"
import { CANCEL_PATH, TURN_PATH } from "@smthrs/rpc/AgentApiRoutes"
import { AgentTurnJournalDeliverySchema } from "@smthrs/rpc/AgentTurnJournal"
import { CardSchema } from "@smthrs/rpc/Cards"
import type {
  AgentTurnFrame,
  FetchLike,
  StartAgentTurnRequest,
  StartAgentTurnResult
} from "@smthrs/rpc/NativeAgent"

const MAX_ERROR_BYTES = 320

/*
 * The hybrid host's agent: every turn is a leg on the shared backend's
 * canonical turn contract (`POST /api/agent/turn` on the Smithers Cloud API),
 * sent as the signed-in Cloud user. The backend composes the runtime context
 * into the model's instructions, so the turn rides the wire as the renderer
 * sent it.
 */
export interface CloudAgentConfig {
  /** The Smithers Cloud API origin (the shared backend). */
  readonly api: string
  /** The Bun-held Cloud bearer, read per turn; undefined while signed out. */
  readonly token: () => string | undefined
  readonly fetchImpl?: FetchLike
}

type PublishFrame = (frame: AgentTurnFrame) => void

const responseError = async (response: Response): Promise<string> => {
  const detail = (await response.text().catch(() => "")).trim().slice(0, MAX_ERROR_BYTES)
  return `Smithers Cloud chat failed (HTTP ${response.status})${detail === "" ? "." : `: ${detail}`}`
}

const asError = (error: unknown): Error => error instanceof Error ? error : new Error("Smithers Cloud chat failed.")

const upstreamUrl = (api: string, path: string): string => new URL(path, new URL(api).origin).toString()

/** The frame on the caller's run: the upstream leg has its own run id, the transcript never sees it. */
const onCallerRun = (frame: AgentTurnFrame, runId: string, upstreamRunId: string): AgentTurnFrame => {
  if (frame.type === "card" && "runId" in frame.card.payload && frame.card.payload.runId === upstreamRunId) {
    return { ...frame, runId, card: CardSchema.parse({ ...frame.card, payload: { ...frame.card.payload, runId } }) }
  }
  return { ...frame, runId }
}

/*
 * One turn as an interruptible Effect (Ruling B, docs/persistence.md). The
 * fetch rides tryPromise's signal, which Effect aborts on interruption, and
 * the stream reader is acquired with a release, so an interrupted turn
 * cancels its in-flight read instead of leaving the stream open. There is no
 * AbortController and no `aborted` flag: cancellation IS fiber interruption.
 */
const streamTurn = (
  request: StartAgentTurnRequest,
  upstreamRunId: string,
  bearer: string,
  publish: PublishFrame,
  config: CloudAgentConfig
): Effect.Effect<void, Error, Scope.Scope> =>
  Effect.gen(function*() {
    const response = yield* Effect.tryPromise({
      try: (signal) =>
        (config.fetchImpl ?? fetch)(upstreamUrl(config.api, TURN_PATH), {
          method: "POST",
          signal,
          headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` },
          body: JSON.stringify({
            // Each leg is its own backend run and journal: a tool-loop
            // continuation re-POSTs the caller's run id, never the upstream's.
            runId: upstreamRunId,
            journal: { version: 1, legId: crypto.randomUUID(), token: randomBytes(32).toString("base64url") },
            messages: request.messages,
            instructions: request.instructions,
            ...(request.context === undefined ? {} : { context: request.context }),
            ...(request.tools === undefined ? {} : { tools: request.tools }),
            ...(request.tier === undefined ? {} : { tier: request.tier }),
            ...(request.purpose === undefined ? {} : { purpose: request.purpose }),
            ...(request.role === undefined ? {} : { role: request.role })
          })
        }),
      catch: asError
    })
    if (!response.ok) return yield* Effect.fail(new Error(yield* Effect.promise(() => responseError(response))))
    if (response.body === null || !(response.headers.get("content-type") ?? "").includes("application/x-ndjson")) {
      return yield* Effect.fail(new Error("Smithers Cloud returned no response stream."))
    }

    const reader = yield* Effect.acquireRelease(
      Effect.sync(() => (response.body as ReadableStream<Uint8Array>).getReader()),
      (acquired) => Effect.promise(() => acquired.cancel().catch(() => {}))
    )
    const decoder = new TextDecoder()
    let buffer = ""
    let settled = false
    const readLine = (line: string): void => {
      if (line.trim() === "") return
      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        return
      }
      const delivery = AgentTurnJournalDeliverySchema.safeParse(parsed)
      if (!delivery.success || delivery.data.cursor.runId !== upstreamRunId) return
      if (delivery.data.type === "caught-up") {
        if (delivery.data.terminal && !settled) {
          settled = true
          publish({ runId: request.runId, type: "done" })
        }
        return
      }
      if (delivery.data.type !== "batch") return
      for (const frame of delivery.data.batch.frames) {
        if (settled) return
        publish(onCallerRun(frame, request.runId, upstreamRunId))
        if (frame.type === "done") settled = true
      }
    }

    for (;;) {
      const { value, done } = yield* Effect.promise(() => reader.read())
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split("\n")
      buffer = done ? "" : (lines.pop() ?? "")
      for (const line of lines) readLine(line)
      if (done || settled) break
    }
    if (!settled) return yield* Effect.fail(new Error("The response stream ended before Smithers finished the turn."))
  })

export interface CloudAgent {
  readonly start: (request: StartAgentTurnRequest) => StartAgentTurnResult
  readonly cancel: (runId: string) => { readonly status: "cancelled" | "not-found" }
}

export const createCloudAgent = (
  publish: PublishFrame,
  config: CloudAgentConfig
): CloudAgent => {
  /*
   * The scoped transport: one FiberSet owned by a Scope this agent holds, so
   * every turn it starts is a supervised fiber, and closing the scope would
   * interrupt them all. `cancel` interrupts the one fiber — the release on
   * the reader and the signal on the fetch do the rest. Interruption is not
   * an error, so a cancelled turn publishes no error frame (the old
   * `signal.aborted` check, now a Cause check).
   */
  const scope = Effect.runSync(Scope.make())
  const turns = Effect.runSync(FiberSet.make<void, unknown>().pipe(Effect.provideService(Scope.Scope, scope)))
  /*
   * Registered by identity, not by run id alone: a turn's teardown runs after
   * `cancel` already dropped it, and by then the same run id may hold the
   * turn that replaced it. Deleting by run id evicted that live turn, leaving
   * it uncancellable (`not-found`) and a second `start` for it permitted.
   */
  interface TurnEntry {
    readonly upstreamRunId: string
    readonly bearer: string
    fiber?: Fiber.Fiber<void, unknown>
  }
  const activeTurns = new Map<string, TurnEntry>()
  return {
    start: (request) => {
      if (activeTurns.has(request.runId)) {
        return { status: "error", message: "That Smithers turn is already running." }
      }
      const bearer = config.token()
      if (bearer === undefined) {
        const message = "Sign in to Smithers Cloud to chat — /cloud.sign-in."
        return { status: "error", message, refusal: { code: "sign_in_required", message, retryAt: null } }
      }
      // Registered before the fork so a turn that settles without ever
      // suspending deregisters itself instead of leaving a stale entry.
      const entry: TurnEntry = { upstreamRunId: crypto.randomUUID(), bearer }
      activeTurns.set(request.runId, entry)
      const turn = Effect.scoped(streamTurn(request, entry.upstreamRunId, bearer, publish, config)).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.void
            : Effect.sync(() => {
              const failure = Cause.findError(cause)
              publish({
                runId: request.runId,
                type: "done",
                error: failure._tag === "Success" ? failure.success.message : "Smithers Cloud chat failed."
              })
            })
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (activeTurns.get(request.runId) === entry) activeTurns.delete(request.runId)
          })
        )
      )
      entry.fiber = Effect.runSync(FiberSet.run(turns, turn))
      return { status: "started" }
    },
    cancel: (runId) => {
      const active = activeTurns.get(runId)
      if (active === undefined) return { status: "not-found" }
      activeTurns.delete(runId)
      if (active.fiber !== undefined) Effect.runFork(Fiber.interrupt(active.fiber))
      // Closing the stream only detaches this host; the backend's producer
      // keeps running until the leg is cancelled there too.
      void (config.fetchImpl ?? fetch)(upstreamUrl(config.api, CANCEL_PATH), {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${active.bearer}` },
        body: JSON.stringify({ runId: active.upstreamRunId })
      }).catch(() => {})
      return { status: "cancelled" }
    }
  }
}
