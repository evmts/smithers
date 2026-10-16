/**
 * Checks three capabilities against one unattended policy: an allowed read,
 * a denied lockfile write, and a spawn no rule mentions.
 *
 * Run it with `node examples/check-a-policy.ts` from the package directory.
 */
import { Capability, GrantStore, Permission, Workspace } from "@smthrs/kernel"
import { Effect, Layer } from "effect"

const policy = [
  new Permission.Rule({
    effect: "allow",
    pattern: new Capability.CapabilityPattern({ action: "fs:read", resource: "/workspace/**" })
  }),
  new Permission.Rule({
    effect: "allow",
    pattern: new Capability.CapabilityPattern({ action: "fs:write", resource: "/workspace/**" })
  }),
  // Rules are last-match-wins, so this deny beats the broad write allow.
  new Permission.Rule({
    effect: "deny",
    pattern: new Capability.CapabilityPattern({ action: "fs:write", resource: "/workspace/pnpm-lock.yaml" })
  })
]

const store = GrantStore.layer({ attended: false, rules: policy }).pipe(
  Layer.provide(Workspace.layer("/workspace"))
)

/** What the store decided for one capability: `allowed`, or the refusal's code. */
const decide = (action: Capability.Action, resource: string) =>
  Effect.gen(function*() {
    const grants = yield* GrantStore.GrantStore
    return yield* grants.check(Capability.make(action, resource)).pipe(
      Effect.as<string>("allowed"),
      // Every refusal (denied, required, or an undecidable store) carries a code.
      Effect.catch((error) => Effect.succeed(error.code))
    )
  })

/**
 * Runs the three checks and returns each decision.
 *
 * @since 1.0.0
 */
export const checkAPolicy = () =>
  Effect.runPromise(
    Effect.all({
      read: decide("fs:read", "/workspace/src/index.ts"),
      lockfile: decide("fs:write", "/workspace/pnpm-lock.yaml"),
      spawn: decide("proc:spawn", "npm test")
    }).pipe(Effect.provide(store))
  )

if (import.meta.main) {
  // eslint-disable-next-line no-console -- the example prints its decisions
  console.log(await checkAPolicy())
}
