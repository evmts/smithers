import { readFileSync } from "node:fs"
import { join } from "node:path"

/** The smithersai/jj commit the workspace pins, and the `jj --version` it builds. */
export interface JjPin {
  readonly repository: string
  readonly revision: string
  readonly version: string
}

const source = /^source = "git\+(https:\/\/github\.com\/smithersai\/jj)\?rev=([0-9a-f]{40})#\2"$/m

/**
 * Reads the jj-lib pin from Cargo.lock text. The native bundle builds the jj
 * CLI from this same commit, so the CLI and the library always match.
 */
export const parseJjPin = (lockfile: string): JjPin => {
  const block = lockfile.split("\n[[package]]\n").find((entry) => /^name = "jj-lib"$/m.test(entry))
  const version = block?.match(/^version = "([^"]+)"$/m)?.[1]
  const pinned = block?.match(source)
  if (version === undefined || pinned === null || pinned === undefined) {
    throw new Error("Cargo.lock must pin jj-lib to a full smithersai/jj git revision.")
  }
  const [, repository, revision] = pinned
  return { repository, revision, version: `jj ${version}-${revision}` }
}

/** Reads the jj-lib pin from `<root>/Cargo.lock`. */
export const readJjPin = (root: string): JjPin => parseJjPin(readFileSync(join(root, "Cargo.lock"), "utf8"))
