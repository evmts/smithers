import { Layer } from "effect"
import * as Clone from "./clone"
import * as Copy from "./copy"
import * as Reads from "./flows"
import { readerLayer } from "./reader"

// Every repository flow's registration with its steps (docs/features/repo.md#flows): the reads `repo/tree`, `repo/read`
// and `repo/refs`, `repo/clone`, and `repo/copy`. Only an engine's host imports this module: the engine worker through
// src/flows/registrations.ts, and the tests' devices.

/**
 * The repository flows, reading through RepoApi's GET routes (src/features/repo/reader.ts). Needs the host's
 * `RepoClient`, which reaches RepoApi, and `TabClipboard`, where a copy goes.
 */
export const registration = Layer.mergeAll(Reads.registration, Clone.registration, Copy.registration).pipe(
  Layer.provide(readerLayer),
)
