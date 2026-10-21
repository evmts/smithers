import { Effect, Option } from "effect"
import { FetchHttpClient, HttpClientRequest } from "effect/http"

// How a request goes as a run rather than as the person (decision 0017 slice 0, docs/features/sign-in.md#run-credentials):
// with the run's credential as a bearer token, and without the session cookie, so the server never mistakes it for the
// person's own press. The engine sends its runs' requests this way (src/flows/credentials.ts), and so does the tab for a
// write a run queued in its outbox (src/features/issues/writes.ts). Nothing here imports more than Effect.

/** `request` carrying run credential `token`. */
export const withBearer = (request: HttpClientRequest.HttpClientRequest, token: string) =>
  HttpClientRequest.setHeader(request, "authorization", `Bearer ${token}`)

/** `effect`, whose fetch leaves the session cookie off. */
export const withoutCookie = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.flatMap(Effect.serviceOption(FetchHttpClient.RequestInit), (init) =>
    Effect.provideService(effect, FetchHttpClient.RequestInit, {
      ...Option.getOrElse(init, () => ({})),
      credentials: "omit",
    }))
