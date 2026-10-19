// E-7 (EK4402): node:child_process, node:fs and node:path are platform APIs that
// VibeLang code does not call directly. Providers.vibe's claudeCodeLogin probes
// PATH and runs `claude auth status` through these, exactly as Providers.ts does.
import { execFile, type ExecFileOptionsWithStringEncoding } from "node:child_process"
import { accessSync, constants } from "node:fs"
import { delimiter as pathDelimiter, join as pathJoin } from "node:path"

/** The platform's PATH entry separator. */
export const delimiter: string = pathDelimiter

/** `node:path` join. */
export const join = (directory: string, name: string): string => pathJoin(directory, name)

/** Throws unless `file` is executable by this process. */
export const accessExecutable = (file: string): void => accessSync(file, constants.X_OK)

/** Runs `<executable> auth status` and reports its result to `done`. */
export const execAuthStatus = (
  executable: string,
  options: ExecFileOptionsWithStringEncoding,
  done: (error: Error | null, stdout: string, stderr: string) => void
): void => {
  execFile(executable, ["auth", "status"], options, done)
}
