// E-5 (D38) and E-7 (EK4402): the file store's Node work (node:fs/promises,
// node:crypto, node:path, Buffer) runs behind Promise-returning helpers that
// FixtureStore.vibe hands to its `io` boundary. VibeLang has no async and no
// direct platform calls, so these helpers stay in TypeScript.
import { randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { appendFile, lstat, mkdir, open, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import type { Fixture } from "./Fixture.vibe"

// O_NOFOLLOW is absent on Windows. Inspect the entry before opening, then
// verify the opened handle names that same regular file before any IO. A new
// journal is created exclusively, so a competing link cannot be followed.
const journalRead = constants.O_RDONLY | constants.O_NOFOLLOW
const journalAppend = constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW
const journalTruncate = constants.O_WRONLY | constants.O_NOFOLLOW

const withJournal = async <A>(
  path: string,
  flags: number,
  use: (handle: Awaited<ReturnType<typeof open>>) => Promise<A>
): Promise<A> => {
  const entry = await lstat(path, { bigint: true }).catch((cause: NodeJS.ErrnoException) => {
    if (cause.code === "ENOENT" && (flags & constants.O_CREAT) !== 0) return undefined
    throw cause
  })
  if (entry !== undefined && !entry.isFile()) throw new Error(`refusing non-regular journal ${path}`)
  const handle = await open(path, entry === undefined ? flags | constants.O_EXCL : flags & ~constants.O_CREAT)
  try {
    const actual = await handle.stat({ bigint: true })
    if (!actual.isFile() || (entry !== undefined && (entry.dev !== actual.dev || entry.ino !== actual.ino))) {
      throw new Error(`journal changed while opening ${path}`)
    }
    return await use(handle)
  } finally {
    await handle.close()
  }
}

// A committed directory symlink on the fixture path (`test/fixtures -> ~/notes`)
// would carry the journal, the staging file, and the published rename into the
// link's target. Every directory between the working directory and the fixture
// is checked with lstat before the store creates or opens anything; a path
// outside the working directory has no trusted root and is not checked.
const refuseSymlinkedDirs = async (path: string): Promise<void> => {
  const root = process.cwd()
  const rel = relative(root, dirname(path))
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return
  let current = root
  for (const part of rel.split(sep)) {
    current = join(current, part)
    const stat = await lstat(current).catch((cause: NodeJS.ErrnoException) => {
      if (cause.code === "ENOENT") return undefined
      throw cause
    })
    if (stat === undefined) return
    if (stat.isSymbolicLink()) throw new Error(`refusing to record through symbolic link ${current}`)
  }
}

const truncateJournal = async (path: string, length: number): Promise<void> => {
  await withJournal(path, journalTruncate, (handle) => handle.truncate(length))
}

export const resolvePath = (path: string): string => resolve(path)

export const readOptionalText = (path: string, journal: boolean): Promise<string | undefined> =>
  (journal
    ? withJournal(path, journalRead, (handle) => readFile(handle, { encoding: "utf8" }))
    : readFile(path, { encoding: "utf8" })).catch((cause: NodeJS.ErrnoException) => {
      if (cause.code === "ENOENT") return undefined
      throw cause
    })

export const truncateToComplete = (journalPath: string, complete: string): Promise<void> =>
  truncateJournal(journalPath, Buffer.byteLength(complete))

export const publishFixture = async (path: string, fixture: Fixture): Promise<void> => {
  const staging = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(staging, `${JSON.stringify(fixture, undefined, 2)}\n`, { flag: "wx" })
    await rename(staging, path)
  } finally {
    await rm(staging, { force: true })
  }
  await rm(`${path}.journal`, { force: true })
}

export const lockFixture = async (path: string, lockPath: string): Promise<void> => {
  await refuseSymlinkedDirs(path)
  await mkdir(dirname(path), { recursive: true })
  await mkdir(lockPath)
}

export const unlockFixture = async (lockPath: string): Promise<void> => {
  await rmdir(lockPath)
}

export const appendJournalLine = (journalPath: string, line: string): Promise<void> =>
  withJournal(journalPath, journalAppend, (handle) => appendFile(handle, `${line}\n`))
