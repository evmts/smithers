// E-7 (EK4402): node:fs reads and process.env/process.cwd are platform APIs that
// VibeLang code does not call directly. NodeControl.vibe's plain configuration
// and layer helpers reach them here, exactly as NodeControl.ts does.
import { existsSync, readFileSync } from "node:fs"

/** `node:fs` existsSync. */
export const fileExists = (path: string): boolean => existsSync(path)

/** `node:fs` readFileSync as UTF-8; throws what it throws. */
export const readUtf8 = (path: string): string => readFileSync(path, "utf8")

/** This process's environment record. */
export const processEnvironment = (): NodeJS.ProcessEnv => process.env

/** This process's working directory. */
export const currentDirectory = (): string => process.cwd()
