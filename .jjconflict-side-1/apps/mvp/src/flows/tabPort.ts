import { Context, Deferred, Duration, Effect, Layer, Schema } from "effect"

// The engine worker's line to its own tab (docs/features/flows.md#the-tab-port). The leader tab's dedicated worker
// runs every client flow (decision 0011 §4), but this device's collections live in the tab, so a step that writes one,
// such as the theme's, asks the tab that started the worker. That tab is open for as long as its worker runs: a
// dedicated worker ends with its tab. A call is `postMessage` both ways, and a step that doesn't hear back in time
// fails, so the engine runs it again after a crash; every handler is a setter, so running it twice is harmless.

/** How long a call waits for its tab. */
export const CALL_WITHIN = Duration.seconds(10)

const Call = Schema.Struct({
  kind: Schema.Literal("smithers/tab-call"),
  id: Schema.String,
  method: Schema.String,
  input: Schema.Json,
})

const Reply = Schema.Struct({
  kind: Schema.Literal("smithers/tab-reply"),
  id: Schema.String,
  ok: Schema.Boolean,
  output: Schema.optional(Schema.Json),
})

const isCall = Schema.is(Call)
const isReply = Schema.is(Reply)

/** The tab didn't answer in time (`timeout`), had no handler (`unknown_method`), or its handler failed (`refused`). */
export class TabCallFailed extends Schema.TaggedError<TabCallFailed>()("@smthrs/mvp/flows/TabCallFailed", {
  method: Schema.String,
  reason: Schema.Literals(["timeout", "unknown_method", "refused"]),
}) {}

/** One end of the worker's line: the worker's own global scope in the worker, the `Worker` in the tab. */
export interface Endpoint {
  postMessage(message: unknown): void
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void
}

/** What a tab answers a call with, by method: a setter over this device's state. */
export type Handlers = Readonly<Record<string, (input: Schema.Json) => Effect.Effect<Schema.Json, unknown>>>

/** The worker's side: calls into the tab that started it. */
export class TabPort extends Context.Service<
  TabPort,
  { readonly call: (method: string, input: Schema.Json) => Effect.Effect<Schema.Json, TabCallFailed> }
>()("@smthrs/mvp/flows/TabPort") {
  /** The port over the worker's own scope (`self`), answered within `within`. */
  static readonly layer = (scope: Endpoint, within: Duration.Input = CALL_WITHIN) =>
    Layer.effect(
      TabPort,
      Effect.gen(function* () {
        const waiting = new Map<string, Deferred.Deferred<typeof Reply.Type>>()
        const listener = (event: MessageEvent) => {
          if (!isReply(event.data)) return
          const reply = waiting.get(event.data.id)
          if (reply !== undefined) Deferred.doneUnsafe(reply, Effect.succeed(event.data))
        }
        yield* Effect.acquireRelease(
          Effect.sync(() => scope.addEventListener("message", listener)),
          () => Effect.sync(() => scope.removeEventListener("message", listener)),
        )
        return TabPort.of({
          call: (method, input) =>
            Effect.gen(function* () {
              const id = crypto.randomUUID()
              const reply = yield* Deferred.make<typeof Reply.Type>()
              waiting.set(id, reply)
              yield* Effect.sync(() => scope.postMessage({ kind: "smithers/tab-call", id, method, input }))
              const answered = yield* Deferred.await(reply).pipe(
                Effect.timeoutOrElse({
                  duration: within,
                  orElse: () => Effect.fail(new TabCallFailed({ method, reason: "timeout" })),
                }),
                Effect.ensuring(Effect.sync(() => waiting.delete(id))),
              )
              if (!answered.ok) {
                return yield* new TabCallFailed({
                  method,
                  reason: answered.output === "unknown_method" ? "unknown_method" : "refused",
                })
              }
              return answered.output ?? null
            }),
        })
      }),
    )
}

/**
 * The tab's side: answers `worker`'s calls with `handlers`, running each handler with the services this effect runs
 * with, until the returned `stop` is called or the worker ends. A handler's failure is answered as refused, by no more
 * than that.
 */
export const answer = (worker: Endpoint, handlers: Handlers): Effect.Effect<() => void> =>
  Effect.gen(function* () {
    const run = Effect.runForkWith(yield* Effect.context<never>())
    const listener = (event: MessageEvent) => {
      if (!isCall(event.data)) return
      const { id, method, input } = event.data
      const handler = handlers[method]
      run(
        (handler === undefined ? Effect.fail("unknown_method" as const) : handler(input)).pipe(
          Effect.match({
            onSuccess: (output) => ({ kind: "smithers/tab-reply", id, ok: true, output }),
            onFailure: (error) => ({
              kind: "smithers/tab-reply",
              id,
              ok: false,
              output: error === "unknown_method" ? "unknown_method" : "refused",
            }),
          }),
          Effect.flatMap((reply) => Effect.sync(() => worker.postMessage(reply))),
        ),
      )
    }
    worker.addEventListener("message", listener)
    return () => worker.removeEventListener("message", listener)
  })
