// E-7 (EK4402): node:path is a platform API that VibeLang code does not call
// directly; Gc.vibe places the objects directory through these, exactly as
// Gc.ts does.
import { dirname as nodeDirname, join as nodeJoin } from "node:path"

/** `path.dirname`. */
export const dirname = (path: string): string => nodeDirname(path)

/** `path.join`. */
export const join = (...parts: ReadonlyArray<string>): string => nodeJoin(...parts)
