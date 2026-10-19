// E-7 (EK4402): spend.vibe's plain helpers read the environment, the home directory, paths
// and the day files through these Node platform calls, one call each, exactly as spend.ts does.
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join as nodeJoin } from "node:path"

/** `process.env[name]`. */
export const env = (name: string): string | undefined => process.env[name]
/** `os.homedir()`. */
export const home = (): string => homedir()
/** `path.join`. */
export const join = (...paths: Array<string>): string => nodeJoin(...paths)
/** `fs.existsSync`. */
export const exists = (file: string): boolean => existsSync(file)
/** `fs.readFileSync(file, "utf8")`. */
export const readText = (file: string): string => readFileSync(file, "utf8")
