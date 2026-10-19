// E-7/EK4402: node:fs, node:sqlite and process.versions are platform APIs, which VibeLang
// code does not call directly; NodeDatabase reads a file's tables and its runtime through these.
import { statSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import * as SqliteOpen from "../internal/SqliteOpen.vibe"

export const readTableNames = (filename: string): ReadonlyArray<string> | undefined => {
  let db: DatabaseSync | undefined
  try {
    if (!filename.startsWith("file:") && !statSync(filename).isFile()) return undefined
    db = new DatabaseSync(filename, { readOnly: true })
    return db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all()
      .map((row) => String((row as { readonly name: unknown }).name))
  } catch (error) {
    if (SqliteOpen.isLockedError(error)) throw error
    return undefined
  } finally {
    db?.close()
  }
}

export const isBun = (): boolean => process.versions.bun !== undefined
