// E-7 (EK4402): node:crypto, node:fs, node:path and Buffer are platform APIs
// that VibeLang code does not call directly. RoleProfile.vibe reads, measures,
// hashes and resolves profile files through these wrappers, exactly as
// RoleProfile.ts calls the Node functions they wrap.
import { createHash } from "node:crypto"
import { existsSync, readFileSync, realpathSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"

/** `readFileSync(path, "utf8")`. */
export const readUtf8 = (path: string): string => readFileSync(path, "utf8")

/** `existsSync(path)`. */
export const exists = (path: string): boolean => existsSync(path)

/** `realpathSync(path)`. */
export const realPath = (path: string): string => realpathSync(path)

/** `Buffer.byteLength(text, "utf8")`. */
export const byteLength = (text: string): number => Buffer.byteLength(text, "utf8")

/** The hex SHA-256 of `text`. */
export const sha256Hex = (text: string): string => createHash("sha256").update(text).digest("hex")

/** `join(...parts)` from node:path. */
export const pathJoin = (...parts: Array<string>): string => join(...parts)

/** `resolve(...parts)` from node:path. */
export const pathResolve = (...parts: Array<string>): string => resolve(...parts)

/** `relative(from, to)` from node:path. */
export const pathRelative = (from: string, to: string): string => relative(from, to)

/** `dirname(path)` from node:path. */
export const pathDirname = (path: string): string => dirname(path)

/** `isAbsolute(path)` from node:path. */
export const pathIsAbsolute = (path: string): boolean => isAbsolute(path)
