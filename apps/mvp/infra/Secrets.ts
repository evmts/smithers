// What ChatApi needs for repository secrets that the stack makes (docs/features/secrets.md#keys): SECRETS_KEY.
import * as Alchemy from "alchemy"
import * as Output from "alchemy/Output"
import { Context, Effect, Option, type Redacted } from "effect"

/**
 * The secrets key: generated once by Alchemy (32 random bytes, hexadecimal) and kept, encrypted with
 * `ALCHEMY_PASSWORD`, in the stack's state. Every repository secret is sealed under a key derived from it, and every
 * sandbox placeholder is derived from it. Replacing it makes every stored secret unreadable: Admins set them again.
 */
export const SecretsKey = Alchemy.Random("SecretsKey")

/** SECRETS_KEY for the Worker being declared. alchemy.run.ts provides it while it declares ChatApi. */
export class Secret extends Context.Service<Secret, { readonly value: Output.Output<Redacted.Redacted<string>> }>()(
  "@smthrs/mvp/infra/Secrets/Secret",
) {}

/** Binds `SECRETS_KEY` to the Worker being declared from `Secret`, so its Config reads it. Without one, nothing. */
export const bind = Effect.gen(function* () {
  const secret = yield* Effect.serviceOption(Secret)
  if (Option.isNone(secret)) return
  yield* Output.named(secret.value.value, "SECRETS_KEY")
})
