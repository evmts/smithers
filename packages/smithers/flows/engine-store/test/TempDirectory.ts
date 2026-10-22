import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"

/** Test-owned scratch; registered before database and engine resources so it is removed after they close. */
export const tempDirectory = (prefix: string) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) => fs.makeTempDirectoryScoped({ prefix })).pipe(
    Effect.provide(NodeFileSystem.layer)
  )
