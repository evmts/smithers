/**
 * A private directory of JSON records: owner-only permissions, no symbolic
 * links, and atomic replacement of every record.
 * @since 1.0.0
 */

import { randomBytes } from "node:crypto"
import * as NodeFs from "node:fs"
import * as NodePath from "node:path"

const recordName = /^[a-z]+\/[a-f0-9]{64}\.json$/

const privateDirectory = (path: string): void => {
  NodeFs.mkdirSync(path, { recursive: true, mode: 0o700 })
  const stats = NodeFs.lstatSync(path)
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`Review finding store is not a directory: ${path}`)
  }
  if (process.platform !== "win32") NodeFs.chmodSync(path, 0o700)
}

/**
 * Creates or opens a store directory readable only by its owner and returns its canonical path.
 * @category store
 * @since 1.0.0
 */
export const ensure = (directory: string): string => {
  if (!NodePath.isAbsolute(directory)) throw new Error("Review finding store directory must be absolute")
  privateDirectory(directory)
  return NodeFs.realpathSync(directory)
}

/** A collection is a real directory inside the store, never a link out of it. */
const collection = (directory: string, name: string): string | undefined => {
  const path = NodePath.join(directory, name)
  const stats = NodeFs.lstatSync(path, { throwIfNoEntry: false })
  if (stats === undefined) return undefined
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`Review finding store collection is not a directory: ${name}`)
  }
  return path
}

const recordPath = (directory: string, name: string): string => {
  if (!recordName.test(name)) throw new Error(`Review finding store record name is not usable: ${name}`)
  return NodePath.join(directory, name)
}

/**
 * Atomically replaces one record, readable only by its owner.
 * @category store
 * @since 1.0.0
 */
export const write = (directory: string, name: string, value: unknown): void => {
  const path = recordPath(directory, name)
  privateDirectory(NodePath.dirname(path))
  const temporary = `${path}.${randomBytes(8).toString("hex")}.tmp`
  NodeFs.writeFileSync(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600, flag: "wx" })
  NodeFs.renameSync(temporary, path)
}

/**
 * Reads one record, or undefined when it does not exist. A symbolic link or other non-file fails.
 * @category store
 * @since 1.0.0
 */
const invalidRecord = (name: string, cause?: unknown): Error =>
  new Error(`Review finding store record is not a regular file: ${name}`, { cause })

export const read = (directory: string, name: string): unknown => {
  const path = recordPath(directory, name)
  if (collection(directory, NodePath.dirname(name)) === undefined) return undefined
  let descriptor: number
  let expected: NodeFs.BigIntStats
  try {
    expected = NodeFs.lstatSync(path, { bigint: true })
    if (!expected.isFile()) throw invalidRecord(name)
    // O_NOFOLLOW is unavailable on Windows. Verify the opened identity against
    // the non-following stat before reading; O_NONBLOCK never waits on a FIFO.
    descriptor = NodeFs.openSync(
      path,
      NodeFs.constants.O_RDONLY | NodeFs.constants.O_NOFOLLOW | NodeFs.constants.O_NONBLOCK
    )
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw invalidRecord(name, cause)
  }
  try {
    const opened = NodeFs.fstatSync(descriptor, { bigint: true })
    if (!opened.isFile() || opened.dev !== expected.dev || opened.ino !== expected.ino) {
      throw invalidRecord(name)
    }
    return JSON.parse(NodeFs.readFileSync(descriptor, "utf8")) as unknown
  } finally {
    NodeFs.closeSync(descriptor)
  }
}

/**
 * Reads every record in one collection, in name order.
 * @category store
 * @since 1.0.0
 */
export const list = (directory: string, name: string): ReadonlyArray<unknown> => {
  const path = collection(directory, name)
  if (path === undefined) return []
  return NodeFs.readdirSync(path).filter((entry) => entry.endsWith(".json")).sort().map((entry) =>
    read(directory, `${name}/${entry}`)
  )
}
