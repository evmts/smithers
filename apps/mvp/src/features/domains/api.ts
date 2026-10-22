import { Context, Data, type Duration, Effect, Layer, Option, Schema } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"
import { domainRoute, domainsRoute } from "./contract"
import { Taken } from "./flows"
import type { DomainRequest } from "./schema"

// ChatApi's domain routes as the flow steps call them (docs/features/domains.md), through Effect's HttpClient, with one
// deadline covering the whole exchange.

/** How long a route gets to answer: it answers once its flow has started. */
export const DOMAIN_WITHIN: Duration.Input = "15 seconds"

/**
 * ChatApi didn't take the write: no whole answer within the deadline, or no network (`status` absent), or a refusal
 * (`status`, with ChatApi's `code` when its body had one).
 */
export class DomainNotTaken extends Data.TaggedError("DomainNotTaken")<{
  readonly status?: number
  readonly code?: string
}> {}

const Refusal = Schema.Struct({ code: Schema.String })
const decodeRefusal = Schema.decodeUnknownEffect(Refusal)
const decodeTaken = Schema.decodeUnknownEffect(Taken)

/** The domain routes on ChatApi at `origin`. */
export class DomainsClient extends Context.Service<
  DomainsClient,
  {
    /** `POST /api/repos/<owner>/<name>/domains { hostname }`: add the domain, or check it again. */
    readonly add: (request: DomainRequest) => Effect.Effect<Taken, DomainNotTaken>
    /** `DELETE /api/repos/<owner>/<name>/domains/<hostname>`: remove it. */
    readonly remove: (request: DomainRequest) => Effect.Effect<Taken, DomainNotTaken>
  }
>()("@smthrs/mvp/domains/DomainsClient") {
  /** The client over the host's `HttpClient`: a `202` took the write; anything else is refused. */
  static readonly layer = (options: { readonly origin: string; readonly within?: Duration.Input }) =>
    Layer.effect(
      DomainsClient,
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient
        const send = (op: "add" | "remove", request: HttpClientRequest.HttpClientRequest) =>
          Effect.gen(function* () {
            const response = yield* client.execute(request).pipe(Effect.mapError(() => new DomainNotTaken({})))
            yield* Effect.annotateCurrentSpan({ "http.response.status_code": response.status })
            if (response.status !== 202) {
              const refusal = yield* response.json.pipe(Effect.flatMap(decodeRefusal), Effect.option)
              return yield* new DomainNotTaken({
                status: response.status,
                ...Option.match(refusal, { onNone: () => ({}), onSome: ({ code }) => ({ code }) }),
              })
            }
            return yield* response.json.pipe(
              Effect.flatMap(decodeTaken),
              Effect.mapError(() => new DomainNotTaken({ status: response.status })),
            )
          }).pipe(
            (effect) =>
              // Interrupting the request aborts its fetch, so a stalled body stops too.
              Effect.timeoutOrElse(effect, {
                duration: options.within ?? DOMAIN_WITHIN,
                orElse: () => Effect.fail(new DomainNotTaken({})),
              }),
            Effect.withSpan(op === "add" ? "domain.add.send" : "domain.remove.send", { kind: "client" }),
          )
        return DomainsClient.of({
          add: ({ owner, name, hostname }) =>
            send(
              "add",
              HttpClientRequest.post(`${options.origin}${domainsRoute(owner, name)}`).pipe(
                HttpClientRequest.bodyJsonUnsafe({ hostname }),
              ),
            ),
          remove: ({ owner, name, hostname }) =>
            send("remove", HttpClientRequest.delete(`${options.origin}${domainRoute(owner, name, hostname)}`)),
        })
      }),
    )
}
