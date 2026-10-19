// E-7 (EK4402): node:crypto, node:fs, node:os, node:path and Buffer are platform
// APIs that VibeLang code does not call directly; Verify.vibe makes and removes
// its scratch directory and names its copies through these, exactly as
// Verify.ts does.
import { randomBytes } from "node:crypto"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname as nodeDirname, join as nodeJoin, resolve as nodeResolve } from "node:path"

/** A fresh scratch directory under the system temporary directory. */
export const makeScratch = (): string => mkdtempSync(nodeJoin(tmpdir(), "smthrs-verify-"))

/** Four random bytes as hex. */
export const randomId = (): string => randomBytes(4).toString("hex")

/** `mkdirSync(path, { recursive: true })`. */
export const makeDirectory = (path: string): void => {
  mkdirSync(path, { recursive: true })
}

/** `rmSync(path, { recursive: true, force: true })`. */
export const removeScratch = (path: string): void => {
  rmSync(path, { recursive: true, force: true })
}

/** `Buffer.byteLength(text)`. */
export const byteLength = (text: string): number => Buffer.byteLength(text)

/** `path.join`. */
export const join = (...parts: ReadonlyArray<string>): string => nodeJoin(...parts)

/** `path.dirname`. */
export const dirname = (path: string): string => nodeDirname(path)

/** `path.resolve`. */
export const resolve = (path: string): string => nodeResolve(path)
