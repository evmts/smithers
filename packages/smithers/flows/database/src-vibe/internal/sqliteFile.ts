// E-7/EK4402: node:fs and node:path are platform APIs, which VibeLang code does not call
// directly; `SqliteOpen.createDatabaseFile` creates the file before SQLite does.
import { closeSync, lstatSync, openSync, readlinkSync } from "node:fs"
import { dirname, resolve } from "node:path"

export const createDatabaseFileImpl = (filename: string, create: boolean, mode = 0o600): void => {
  if (!create || filename === "" || filename === ":memory:" || filename.startsWith("file:")) return
  let path = filename
  for (let links = 0; links <= 40; links++) {
    let descriptor: number
    try {
      descriptor = openSync(path, "wx", mode)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      // An existing file, or a link SQLite will follow: only a link's target
      // can still be missing.
      if (!lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink()) return
      path = resolve(dirname(path), readlinkSync(path))
      continue
    }
    closeSync(descriptor)
    return
  }
}
