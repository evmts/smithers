import { Context, Data, type Duration, Effect, Layer, Option, Schema } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"
import { TERMINALS_ROUTE } from "./contract"
import { Opened, Refused } from "./schema"

// ChatApi's `POST /api/terminals` as `terminal/open`'s step calls it (docs/features/branch-workspace.md#the-terminal),
// through Effect's HttpClient, with one deadline covering the whole exchange.

/** ChatApi didn't open the terminal: a refusal (`status`, with its `code`), or no whole answer in time (neither). */
export class OpenRefused extends Data.TaggedError("OpenRefused")<{
  readonly status?: number
  readonly code?: string
}> {}

/** How long a step gives ChatApi to admit an open. The machine wakes after, in the remote `terminal/Open`. */
export const OPEN_WITHIN = "15 seconds"

const decodeRefused = Schema.decodeUnknownOption(Schema.fromJsonString(Refused))
const decodeOpened = Schema.decodeUnknownEffect(Opened)

/** Opens terminals through ChatApi on `origin`. */
export class TerminalClient extends Context.Service<
  TerminalClient,
  {
    readonly open: (request: {
      readonly terminalId: string
      readonly branchId: string
      readonly cols: number
      readonly rows: number
    }) => Effect.Effect<Opened, OpenRefused>
  }
>()("@smthrs/mvp/terminal/TerminalClient") {
  /** The client over the host's `HttpClient`: `202` opening, `200` the person's open one; anything else is refused. */
  static readonly layer = (options: { readonly origin: string; readonly within?: Duration.Input }) =>
    Layer.effect(
      TerminalClient,
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient
        return TerminalClient.of({
          open: Effect.fn("terminal.open.post")(function* (request) {
            const response = yield* client.execute(
              HttpClientRequest.post(`${options.origin}${TERMINALS_ROUTE}`).pipe(
                HttpClientRequest.bodyJsonUnsafe(request),
              ),
            ).pipe(Effect.mapError(() => new OpenRefused({})))
            yield* Effect.annotateCurrentSpan({ "http.response.status_code": response.status })
            if (response.status !== 200 && response.status !== 202) {
              const body = decodeRefused(yield* Effect.orElseSucceed(response.text, () => ""))
              return yield* new OpenRefused({
                status: response.status,
                ...Option.match(body, { onNone: () => ({}), onSome: ({ code }) => ({ code }) }),
              })
            }
            return yield* response.json.pipe(
              Effect.flatMap(decodeOpened),
              Effect.mapError(() => new OpenRefused({ status: response.status })),
            )
          }, (effect) =>
            Effect.timeoutOrElse(effect, {
              duration: options.within ?? OPEN_WITHIN,
              orElse: () => Effect.fail(new OpenRefused({})),
            })),
        })
      }),
    )
}
