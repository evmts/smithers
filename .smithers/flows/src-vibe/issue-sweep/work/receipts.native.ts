// E-7 (EK4402): the Node crypto and filesystem primitives receipts.vibe's hatch
// bodies call, verbatim from issue-sweep/work/receipts.ts.
import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"

export const receiptName = (key: string) => `${createHash("sha256").update(key).digest("hex")}.json`
export const missing = (cause: unknown) => (cause as NodeJS.ErrnoException).code === "ENOENT"

/** Fsync both file contents and the directory entry that publishes or removes them. */
export const syncDirectory = async (directory: string) => {
  const handle = await fs.open(directory, "r")
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}
