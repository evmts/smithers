import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"

/** Media scratch belongs to the recorded run, including when rendering fails. */
export const withMediaDirectory = async <A>(output: string, use: (directory: string) => Promise<A>): Promise<A> => {
  mkdirSync(output, { recursive: true })
  const directory = mkdtempSync(join(output, "e2e-media-"))
  try {
    return await use(directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
