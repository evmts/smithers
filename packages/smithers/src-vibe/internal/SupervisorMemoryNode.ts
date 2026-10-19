// E-7 (EK4402): node:crypto and node:path are platform APIs that VibeLang code
// does not call directly. SupervisorMemory.vibe's plain `options` names the
// project bank through these, exactly as SupervisorMemory.ts does.
import { createHash } from "node:crypto"
import { resolve as resolvePath } from "node:path"

/** `node:path` resolve of one path. */
export const resolve = (path: string): string => resolvePath(path)

/** The hex SHA-256 of a text. */
export const sha256Hex = (text: string): string => createHash("sha256").update(text).digest("hex")
