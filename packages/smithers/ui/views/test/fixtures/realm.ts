/** Runs effects against a realm over the test bundle. */
import type { QuickJSVariant } from "@smthrs/harness"
import { Effect, Layer, type Scope } from "effect"
import { PresentationRealm, ViewCode } from "../../src/index.ts"
import { bundle } from "./bundle.ts"
import { components } from "./modules.ts"
import { layerSingleFile } from "./quickjs.ts"

/** A checked module, failing the test when the checker refuses it. */
export const checked = (source: string): ViewCode.CheckedModule =>
  Effect.runSync(ViewCode.check(source, { components }))

/** A module that skips the checker, for what the realm alone must refuse. */
export const unchecked = (compiled: string, reduces = false): ViewCode.CheckedModule =>
  new ViewCode.CheckedModule({ source: compiled, compiled, digest: "0".repeat(64), interactions: {}, reduces })

/** Runs `use` with a realm over the test bundle, inside one scope. */
export const withRealm = async <A, E>(
  use: (realm: PresentationRealm.Realm) => Effect.Effect<A, E, Scope.Scope>,
  options: {
    readonly limits?: Partial<PresentationRealm.Limits>
    readonly bundle?: string
    readonly variant?: Layer.Layer<QuickJSVariant.Variant>
  } = {}
): Promise<A> => {
  const source = options.bundle ?? await bundle()
  return Effect.gen(function*() {
    const realm = yield* PresentationRealm.make({ bundle: source, limits: options.limits })
    return yield* use(realm)
  }).pipe(Effect.scoped, Effect.provide(options.variant ?? layerSingleFile), Effect.runPromise)
}
