// A-2/E-4 (D38), E-7 (EK4402): wiki/main.ts is a script. Its runner boundary (Effect.runPromise,
// whose rejection the module leaves unhandled as the TypeScript's top-level await did), its
// arguments, the environment, the working directory and the process id stay TypeScript;
// main.vibe holds the program the script runs.
import { Effect } from "effect"
import { parseArgs as nodeParseArgs } from "node:util"

/** `util.parseArgs`. */
export const parseArgs: typeof nodeParseArgs = nodeParseArgs

/** `process.cwd()`. */
export const cwd = (): string => process.cwd()

/** `process.env`. */
export const env = (): NodeJS.ProcessEnv => process.env

/** `process.pid`. */
export const pid = (): number => process.pid

/** `crypto.randomUUID()`. */
export const randomUUID = (): string => crypto.randomUUID()

/** Runs the script's program; a failure rejects, and the caller leaves it unhandled. */
export const runScript = <E>(program: () => Effect.Effect<void, E, never>): Promise<void> => Effect.runPromise(program())
