// E-7: platform APIs called by plain synchronous TypeScript helpers.
import { createHash } from "node:crypto"
import { DatabaseSync } from "node:sqlite"
import { resolve as resolvePath, isAbsolute as absolutePath } from "node:path"
export const digest = (bytes: string | Uint8Array): string => createHash("sha256").update(bytes).digest("hex")
export const openDatabase = (file: string): DatabaseSync => new DatabaseSync(file, { readOnly: true })
export const resolve = (file: string): string => resolvePath(file)
export const isAbsolute = (file: string): boolean => absolutePath(file)

import { normalize as normalizePath, parse as parsePath, sep as pathSeparator } from "node:path"
export const normalize = (file: string): string => normalizePath(file)
export const parse = (file: string) => parsePath(file)
export const sep = pathSeparator
