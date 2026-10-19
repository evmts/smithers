// A-2/E-4 (D38) and E-7: remote-job-host is a test fixture process.
// process.argv, its stdout and the runner (Effect.runPromise) stay TypeScript,
// verbatim from issue-sweep/test/remote-job-host.ts; remote-job-host.vibe holds
// the retained-job program.
import { Effect } from "effect"

export const argv: ReadonlyArray<string> = process.argv
export const emit = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`)

export const run = async <E>(host: () => Effect.Effect<void, E>): Promise<void> => {
  await Effect.runPromise(host())
}
