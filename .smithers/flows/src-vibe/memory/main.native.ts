// E-7 (EK4402): the command line, the environment and standard streams are platform APIs that
// VibeLang code does not call directly. memory/main.vibe reads its arguments, prints and exits
// through these, exactly as memory/main.ts does.
import { parseArgs as nodeParseArgs } from "node:util"

/** `util.parseArgs`. */
export const parseArgs: typeof nodeParseArgs = nodeParseArgs

/** `process.env`. */
export const env = (): NodeJS.ProcessEnv => process.env

/** Writes `text` to standard error. */
export const writeStderr = (text: string): void => {
  process.stderr.write(text)
}

/** Writes `text` to standard output. */
export const writeStdout = (text: string): void => {
  process.stdout.write(text)
}

/** `process.exit`; annotated so control flow knows it never returns. */
export const exit: (code: number) => never = (code) => process.exit(code)
