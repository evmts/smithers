/**
 * Hatch for `SandboxedFlowGuest.vibe` (D38/EK1005, EK1003, E-7/EK4402): the
 * guest's `run` is the runner boundary. It is an async function that reads
 * and writes through `node:fs/promises` and awaits `Effect.runPromise`, so it
 * stays TypeScript. The `.vibe` module passes in what the function reads of
 * it: the path check, the protocol's codecs and its own `execute`. The body
 * is the source's `run`.
 */
import * as Effect from "effect/Effect"
import { readFile, writeFile } from "node:fs/promises"

/** What `run` reads of the guest module. */
export interface Guest<Environment, Request, Result> {
  readonly required: (
    environment: Environment,
    name: "SMITHERS_SANDBOX_REQUEST_PATH" | "SMITHERS_SANDBOX_RESULT_PATH"
  ) => string
  readonly decodeRequest: (input: unknown) => Request
  readonly encodeResult: (result: Result) => unknown
  readonly execute: (entry: Readonly<Record<string, unknown>>, request: Request) => Effect.Effect<Result>
}

/** The source's `run` over the guest module's own functions. */
export const makeRun = <Environment, Request, Result>(guest: Guest<Environment, Request, Result>) =>
async (entry: Readonly<Record<string, unknown>>, environment: Environment): Promise<void> => {
  const requestPath = guest.required(environment, "SMITHERS_SANDBOX_REQUEST_PATH")
  const resultPath = guest.required(environment, "SMITHERS_SANDBOX_RESULT_PATH")
  const request = guest.decodeRequest(JSON.parse(await readFile(requestPath, "utf8")))
  const result = await Effect.runPromise(guest.execute(entry, request))
  await writeFile(
    resultPath,
    // Every failure text is redacted where it is made. A second pass over a
    // finished line is not harmless: the diagnostic rules treat the words after
    // a placeholder as the rest of a credential, so a line already redacted
    // once loses everything that follows its first placeholder.
    JSON.stringify(guest.encodeResult(result))
  )
}
