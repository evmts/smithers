// E-7 (EK4402): node:path and node:crypto are platform APIs that VibeLang code
// does not call directly; SuggestFlow.vibe checks its root and mints execution
// ids through these, exactly as SuggestFlow.ts does.
import { randomUUID as nodeRandomUUID } from "node:crypto"
import { isAbsolute as nodeIsAbsolute } from "node:path"

/** `path.isAbsolute`. */
export const isAbsolute = (path: string): boolean => nodeIsAbsolute(path)

/** `crypto.randomUUID`. */
export const randomUUID = (): string => nodeRandomUUID()
