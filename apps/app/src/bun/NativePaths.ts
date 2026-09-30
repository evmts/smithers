import { existsSync } from "node:fs"
import { join, resolve } from "node:path"

/**
 * The SPA directory for a caller in `fromDir`. SMITHERS_DIST_DIR wins; a
 * packaged app finds the copied views next to its main bundle; a source
 * checkout falls back to apps/app/dist.
 */
export const defaultDistDir = (fromDir: string, env: Readonly<Record<string, string | undefined>> = Bun.env): string => {
  const explicit = env.SMITHERS_DIST_DIR?.trim()
  if (explicit !== undefined && explicit !== "") return resolve(explicit)
  const candidates = [
    resolve(fromDir, "..", "views", "mainview"),
    resolve(fromDir, "..", "..", "dist")
  ]
  return candidates.find((dir) => existsSync(join(dir, "index.html"))) ?? candidates[candidates.length - 1]!
}
