// What ChatApi needs to find Electric in production, and nothing else: the container and its gateway Worker live in
// infra/ElectricGateway.ts, which alchemy.run.ts declares. Under `alchemy dev` ChatApi reaches the compose Electric.
import * as Alchemy from "alchemy"
import * as Output from "alchemy/Output"
import { Context, Effect, Option, type Redacted } from "effect"

/**
 * Electric's secret: generated once by Alchemy and kept, encrypted with `ALCHEMY_PASSWORD`, in the stack's state.
 * The gateway refuses a shape request without it (infra/ElectricAccess.ts); only ChatApi and the gateway hold it.
 */
export const ElectricSecret = Alchemy.Random("ElectricSecret")

/** Where ChatApi finds Electric in production. alchemy.run.ts provides it while it declares ChatApi. */
export class Endpoint extends Context.Service<Endpoint, {
  readonly url: Output.Output<string | undefined>
  readonly secret: Output.Output<Redacted.Redacted<string>>
}>()("@smthrs/mvp/infra/Electric/Endpoint") {}

/**
 * Binds `ELECTRIC_URL`, `ELECTRIC_SECRET` and `ELECTRIC_SECRET_AS=bearer` to the Worker being declared from
 * `Endpoint`, so its Effect `Config` (`ShapeProxy.config`) reads them at runtime and sends the secret to the gateway as
 * a bearer token, never in a URL (infra/ElectricAccess.ts). Without an `Endpoint` it does nothing: under
 * `alchemy dev` the Worker keeps the compose Electric, and at runtime the bindings are already there.
 */
export const bind = Effect.gen(function* () {
  const endpoint = yield* Effect.serviceOption(Endpoint)
  if (Option.isNone(endpoint)) return
  yield* Output.named(endpoint.value.url, "ELECTRIC_URL")
  yield* Output.named(endpoint.value.secret, "ELECTRIC_SECRET")
  yield* Output.named(Output.literal("bearer"), "ELECTRIC_SECRET_AS")
})
