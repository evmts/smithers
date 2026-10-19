// E-7 (EK4402): process.versions, existsSync and join are platform APIs; target-approvals.vibe reads
// them where target-approvals.ts does.
// A-2/E-4 (D38): `runControl` is the Promise boundary `make`'s port hands to the TUI: it runs a
// control-plane program with Effect.runPromiseExit, as target-approvals.ts `run` does, unchanged.
import { Control, type ControlError } from "@smthrs/control"
import { Cause, Effect, Exit, type Layer } from "effect"
import { existsSync } from "node:fs"
import { join } from "node:path"

/** `process.versions.bun`. */
export const bunVersion = (): string | undefined => process.versions.bun

/** `existsSync(join(...paths))`. */
export const existsAt = (...paths: ReadonlyArray<string>): boolean => existsSync(join(...paths))

/** target-approvals.ts `run`: `use` over a fresh control plane, its failure thrown squashed. */
export const runControl = async <A>(
  layer: () => Layer.Layer<Control.Control, ControlError.ControlError>,
  use: (control: Control.Service) => Effect.Effect<A, unknown>
): Promise<A> => {
  const exit = await Effect.runPromiseExit(
    Control.Control.pipe(
      Effect.flatMap(use),
      Effect.provide(layer())
    )
  )
  if (Exit.isSuccess(exit)) return exit.value
  throw Cause.squash(exit.cause)
}
