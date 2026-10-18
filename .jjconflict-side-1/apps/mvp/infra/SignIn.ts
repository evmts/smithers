// What ChatApi needs for sign-in that the stack makes (docs/features/sign-in.md#configuration): SESSION_SECRET. The
// GitHub App's client id and secret come from the deploying environment, which ChatApi's Config reads.
import * as Alchemy from "alchemy"
import * as Output from "alchemy/Output"
import { Context, Effect, Option, type Redacted } from "effect"

/**
 * Sign-in's secret: generated once by Alchemy (32 random bytes, hexadecimal) and kept, encrypted with
 * `ALCHEMY_PASSWORD`, in the stack's state. It signs session cookies and seals GitHub's tokens; replacing it signs
 * everyone out.
 */
export const SessionSecret = Alchemy.Random("SessionSecret")

/** SESSION_SECRET for the Worker being declared. alchemy.run.ts provides it while it declares ChatApi. */
export class Secret extends Context.Service<Secret, { readonly value: Output.Output<Redacted.Redacted<string>> }>()(
  "@smthrs/mvp/infra/SignIn/Secret",
) {}

/** Binds `SESSION_SECRET` to the Worker being declared from `Secret`, so its Config reads it. Without one, nothing. */
export const bind = Effect.gen(function* () {
  const secret = yield* Effect.serviceOption(Secret)
  if (Option.isNone(secret)) return
  yield* Output.named(secret.value.value, "SESSION_SECRET")
})
