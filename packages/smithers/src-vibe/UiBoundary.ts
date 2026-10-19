// A-2/E-4 (D38): renderChecklist runs the checklist program with Effect.runSync,
// a runner boundary, on a node:stream Writable it constructs (E-7, EK4402).
// E-7 (EK4402): the process's own streams and environment are platform reads.
// Ui.vibe calls these exactly where Ui.ts reads process.* or runs the effect.
import { Effect } from "effect"
import { Writable as WritableStream } from "node:stream"
import type { Check, Options, Service } from "./Ui.vibe"

/** `process.stdout`. */
export const stdout = () => process.stdout

/** `process.stdin`. */
export const stdin = () => process.stdin

/** `process.stderr`. */
export const stderr = () => process.stderr

/** `process.env`. */
export const processEnv = () => process.env

/** The body of `Ui.renderChecklist`, given the module's `make`. */
export const renderChecklistWith = (
  make: (options: Options) => Service,
  title: string,
  checks: ReadonlyArray<Check>,
  options: { readonly interactive: boolean; readonly columns?: number | undefined }
): string => {
  const chunks: Array<string> = []
  const sink = new WritableStream({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk))
      callback()
    }
  })
  Object.assign(sink, { columns: options.columns ?? 80 })
  Effect.runSync(make({ output: sink, interactive: options.interactive }).checklist(title, checks))
  return chunks.join("").replace(/\n+$/, "")
}
