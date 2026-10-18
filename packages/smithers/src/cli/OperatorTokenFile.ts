import { randomBytes } from "node:crypto"
import { open, rename, rm } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"

/** Publish a session credential without exposing a partial or world-readable file. */
export const writeOperatorTokenFile = async (path: string, token: string): Promise<void> => {
  const destination = resolve(path)
  const temporary = join(dirname(destination), `.operator-token-${randomBytes(16).toString("hex")}`)
  try {
    const file = await open(temporary, "wx", 0o600)
    try {
      await file.chmod(0o600)
      await file.writeFile(`${token}\n`, "utf8")
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
  }
}
