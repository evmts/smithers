// E-7 (EK4402): node:path and node:fs are platform APIs; reads.vibe calls each where reads.ts does.
// The sync filesystem calls run inside reads.vibe's `try` hatches where reads.ts ran them inside
// Effect.suspend, so their exceptions map to the same PlatformError.
import { lstatSync } from "node:fs"
import { join, resolve } from "node:path"

/** `join(...paths)`. */
export const joinPath = (...paths: ReadonlyArray<string>): string => join(...paths)

/** `resolve(...paths)`. */
export const resolvePath = (...paths: ReadonlyArray<string>): string => resolve(...paths)

/** `lstatSync(path).isSymbolicLink()`; throws as lstatSync does. */
export const isSymbolicLink = (path: string): boolean => lstatSync(path).isSymbolicLink()
