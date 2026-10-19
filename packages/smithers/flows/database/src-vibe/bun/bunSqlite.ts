/// <reference types="bun" />
// E-7/EK4402: bun:sqlite and node:fs are platform APIs, which VibeLang code does not
// call directly; BunDatabase reads a file's tables through this.
import { Database } from "bun:sqlite"
import { statSync } from "node:fs"
import * as SqliteOpen from "../internal/SqliteOpen.vibe"

export const readTableNames = (filename: string): ReadonlyArray<string> | undefined => {
  let db: Database | undefined
  try {
    if (!filename.startsWith("file:") && !statSync(filename).isFile()) return undefined
    db = new Database(filename, { readonly: true, create: false })
    return (db.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(
      (row) => row.name
    )
  } catch (error) {
    if (SqliteOpen.isLockedError(error)) throw error
    return undefined
  } finally {
    db?.close()
  }
}
