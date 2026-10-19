// A-2/E-4 (D38) and E-7: vm-capacity is a command-line script. process.argv,
// process.env, the runner (Effect.runPromise) and stdout stay TypeScript;
// vm-capacity.vibe holds the benchmark program and its summary.
import { Effect } from "effect"

export const argv: ReadonlyArray<string> = process.argv
export const env: Readonly<Record<string, string | undefined>> = process.env

export const run = async <E>(capacity: () => Effect.Effect<string, E>): Promise<void> => {
  process.stdout.write(await Effect.runPromise(capacity()))
}
