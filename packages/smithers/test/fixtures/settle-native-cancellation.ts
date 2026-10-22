/** Drive only the recorded native cancellation, without registering or importing a flow body. */
import { NodeRuntime } from "@smthrs/platform-node"
import { Effect, Layer, Schedule } from "effect"
import { hostname } from "node:os"
import { join } from "node:path"

export const settleNativeCancellation = (root: string, settled: () => boolean): Promise<void> =>
  Effect.runPromise(
    Effect.sync(settled).pipe(
      Effect.repeat({ while: (done) => !done, schedule: Schedule.spaced("25 millis") }),
      Effect.asVoid,
      Effect.provide(NodeRuntime.layerHost({
        filename: join(root, ".flows", "engine.db"),
        workspaceRoot: root,
        signals: [],
        owner: { hostId: hostname() }
      }, Layer.empty)),
      Effect.scoped,
      Effect.timeout("10 seconds")
    )
  )
