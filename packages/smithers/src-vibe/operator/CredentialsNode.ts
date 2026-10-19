// E-7 (EK4402): process.env, node:fs, node:path and Buffer are platform APIs
// that VibeLang code does not call directly; Credentials.vibe reads the secret
// sources and decodes the key here, exactly as Credentials.ts does.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/** One host environment variable. */
export const environmentValue = (name: string): string | undefined => process.env[name]

/** The UTF-8 text of `file`, resolved against `root`. */
export const readSecretFile = (root: string, file: string): string => readFileSync(resolve(root, file), "utf8")

/** How many bytes a base64 key decodes to. */
export const decodedKeyBytes = (key: string): number => Buffer.from(key, "base64").byteLength
