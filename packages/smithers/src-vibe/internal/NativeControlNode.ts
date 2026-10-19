// E-7 (EK4402): node:crypto, node:fs, node:os, node:path and process are
// platform APIs that VibeLang code does not call directly. NativeControl.vibe
// reads them through these wrappers, exactly where NativeControl.ts calls the
// functions they wrap. A-2/E-4 (D38): `runSync` is the one runner boundary
// NativeControl.ts crosses inside a plain function (its gateway approval
// authority).
import * as Effect from "effect/Effect"
import { createHash, randomUUID } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { homedir, hostname } from "node:os"
import { dirname, join, resolve } from "node:path"

/** Match the TUI's repository-bounded instruction file precedence. */
export const workspaceInstructions = (cwd: string): ReadonlyArray<{ readonly path: string; readonly text: string }> => {
  const files: Array<string> = []
  const global = join(homedir(), ".smithers", "agent", "AGENTS.md")
  if (existsSync(global)) files.push(global)
  const directories: Array<string> = []
  for (let directory = resolve(cwd);; directory = dirname(directory)) {
    directories.unshift(directory)
    if (existsSync(join(directory, ".jj")) || existsSync(join(directory, ".git"))) break
    if (dirname(directory) === directory) {
      directories.splice(0, directories.length - 1)
      break
    }
  }
  for (const directory of directories) {
    const first = ["AGENTS.override.md", "AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"]
      .map((name) => join(directory, name)).find((path) => existsSync(path))
    if (first !== undefined && !files.includes(first)) files.push(first)
  }
  return files.map((path) => ({ path, text: readFileSync(path, "utf8") }))
}

/** `resolve(...paths)` from node:path. */
export const resolvePath = (...paths: Array<string>): string => resolve(...paths)

/** `hostname()` from node:os. */
export const hostName = (): string => hostname()

/** `process.pid`. */
export const processId = (): number => process.pid

/** `process.cwd()`. */
export const processCwd = (): string => process.cwd()

/** `process.env`, the live object. */
export const processEnv = (): NodeJS.ProcessEnv => process.env

/** One real process identity: this host, this pid, a fresh nonce. */
export const processOwner = (): { readonly hostId: string; readonly pid: number; readonly nonce: string } => ({
  hostId: hostname(),
  pid: process.pid,
  nonce: randomUUID()
})

/** The hex SHA-256 of `text`. */
export const sha256Hex = (text: string): string => createHash("sha256").update(text).digest("hex")

/** `Effect.runSync`. */
export const runSync = <A, E>(effect: Effect.Effect<A, E>): A => Effect.runSync(effect)
