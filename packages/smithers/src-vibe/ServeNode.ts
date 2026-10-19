// E-7 (EK4402): node:crypto, node:path and process.pid are platform APIs that
// VibeLang code does not call directly. Serve.vibe's plain workspaceHash and
// health read them here, exactly as Serve.ts does.
import { createHash } from "node:crypto"
import { resolve } from "node:path"

/** The hex SHA-256 of a workspace root, resolved against the working directory. */
export const sha256Hex = (root: string): string => createHash("sha256").update(resolve(root)).digest("hex")

/** This process's id. */
export const processId = (): number => process.pid
