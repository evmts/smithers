// E-7 (EK4402): the CLI's synchronous node:fs and node:path reads. VibeLang code
// does not call platform APIs directly, so ModelServerCli.vibe calls these.
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

export const readText = (path: string): string => readFileSync(path, "utf8")

export const exists = (path: string): boolean => existsSync(path)

export const besideConfig = (path: string, file: string): string => resolve(dirname(path), file)
