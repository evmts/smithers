// E-7 (EK4402): process.stdout, node:fs and node:os are platform APIs that
// VibeLang code does not call directly; Suggest.vibe writes its JSON lines,
// checks a directory and finds the home directory through these, exactly as
// Suggest.ts does.
import { statSync as nodeStatSync, type Stats } from "node:fs"
import { homedir as nodeHomedir } from "node:os"

/** Writes text to standard output. */
export const writeStdout = (text: string): void => {
  process.stdout.write(text)
}

/** `fs.statSync`. */
export const statSync = (path: string): Stats => nodeStatSync(path)

/** `os.homedir`. */
export const homedir = (): string => nodeHomedir()
