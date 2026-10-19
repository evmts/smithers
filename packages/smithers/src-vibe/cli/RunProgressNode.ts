// E-7 (EK4402): node:util and process.stderr are platform APIs that VibeLang
// code does not call directly. RunProgress.vibe sanitizes journal text and
// picks its default sink through these, exactly as RunProgress.ts does.
import { stripVTControlCharacters as strip } from "node:util"

/** `util.stripVTControlCharacters`. */
export const stripVTControlCharacters = (value: string): string => strip(value)

/** `process.stderr`. */
export const stderr = () => process.stderr
