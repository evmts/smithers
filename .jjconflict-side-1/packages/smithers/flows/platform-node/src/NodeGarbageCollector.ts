/**
 * Node's full garbage collection, as the `GarbageCollector` that
 * `@smthrs/sandbox`'s Microsandbox provider gives finished command handles
 * back to the guest with.
 *
 * Node exposes its collector only to a process started with `--expose-gc`.
 * This one sets that V8 flag on its first collection and takes the collector
 * from a fresh VM context, which V8 now builds with `gc` on its global, so it
 * works whether or not the process was started with the flag. Nothing runs
 * before the first collection.
 *
 * @since 1.0.0
 */

import { MicrosandboxSandbox } from "@smthrs/sandbox"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { setFlagsFromString } from "node:v8"
import { runInNewContext } from "node:vm"

let gc: (() => void) | undefined

/** V8's collector, exposed once. */
const exposed = (): () => void => {
  if (gc === undefined) {
    setFlagsFromString("--expose-gc")
    gc = runInNewContext("gc") as () => void
  }
  return gc
}

/**
 * The process's collector. It is one value, so every Microsandbox provider in
 * the process counts its command starts toward the same collections.
 *
 * @category constructors
 * @since 1.0.0
 */
export const collector: MicrosandboxSandbox.GarbageCollector = {
  collect: Effect.sync(() => exposed()())
}

/**
 * Provides {@link collector}.
 *
 * @category layers
 * @since 1.0.0
 */
export const layer: Layer.Layer<MicrosandboxSandbox.GarbageCollector> = Layer.succeed(
  MicrosandboxSandbox.GarbageCollector
)(collector)
