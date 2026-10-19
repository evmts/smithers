// E-7 (EK4402): statSync, Buffer.from, spawn and process.kill are platform APIs; search.vibe calls
// each where search.ts does, with the same arguments.
import { spawn } from "node:child_process"
import { statSync } from "node:fs"

/** `statSync(path).isDirectory()`; throws as statSync does. */
export const isDirectory = (path: string): boolean => statSync(path).isDirectory()

/** `Buffer.from(value, encoding)`. */
export const bufferFrom = (value: string, encoding: BufferEncoding): Buffer => Buffer.from(value, encoding)

/** `spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"], detached: true })`. */
export const spawnDetached = (command: string, args: ReadonlyArray<string>, cwd: string) =>
  spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"], detached: true })

/** `process.kill(pid, signal)`. */
export const kill = (pid: number, signal: NodeJS.Signals): void => {
  process.kill(pid, signal)
}
