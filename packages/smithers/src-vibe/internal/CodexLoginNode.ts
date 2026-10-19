// E-7 (EK4402): node:os, node:fs, node:path, process.kill and Buffer are
// platform APIs that VibeLang code does not call directly. CodexLogin.vibe's
// plain helpers (locate, executable, expiryMillis, lockOwnerAlive) reach them
// here, exactly as CodexLogin.ts calls them.
import { accessSync, constants } from "node:fs"
import { homedir as osHomedir } from "node:os"
import { delimiter as pathDelimiter, join as pathJoin } from "node:path"

/** The platform's PATH entry separator. */
export const delimiter: string = pathDelimiter

/** `node:os` homedir. */
export const homedir = (): string => osHomedir()

/** `node:path` join. */
export const join = (...segments: Array<string>): string => pathJoin(...segments)

/** Throws unless `file` is executable by this process. */
export const accessExecutable = (file: string): void => accessSync(file, constants.X_OK)

/** `process.kill(pid, 0)`: throws when the process cannot be signalled. */
export const probeProcess = (pid: number): void => {
  process.kill(pid, 0)
}

/** Decodes base64url text as UTF-8. */
export const decodeBase64Url = (payload: string): string => Buffer.from(payload, "base64url").toString("utf8")
