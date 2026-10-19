// E-7 (EK4402): node:fs, node:path and process.cwd are platform APIs that
// VibeLang code does not call directly. Project.vibe resolves and probes
// project paths through these, exactly as Project.ts does. `existsSync` is
// node's own function: Project.ts passes it as the default probe.
import { readdirSync, statSync, type Stats } from "node:fs"
import * as path from "node:path"

export { existsSync } from "node:fs"

/** `path.basename`. */
export const basename = (value: string): string => path.basename(value)

/** `path.dirname`. */
export const dirname = (value: string): string => path.dirname(value)

/** `path.isAbsolute`. */
export const isAbsolute = (value: string): boolean => path.isAbsolute(value)

/** `path.join`. */
export const join = (...values: Array<string>): string => path.join(...values)

/** `path.resolve`. */
export const resolve = (...values: Array<string>): string => path.resolve(...values)

/** `process.cwd()`. */
export const currentDirectory = (): string => process.cwd()

/** `readdirSync(directory, { withFileTypes: true })`. */
export const readDirectoryEntries = (directory: string) => readdirSync(directory, { withFileTypes: true })

/** `statSync(file)`. */
export const statPath = (file: string): Stats => statSync(file)
