import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll } from "vitest"

// A suite owns its files across device reloads; closing one tab must not erase another tab's database.
export const tempDirectory = (prefix: string): string => {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  afterAll(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}
