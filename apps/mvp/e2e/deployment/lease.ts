import { randomUUID } from "node:crypto"
import { link, realpath, unlink, writeFile } from "node:fs/promises"
import { readJson } from "./session"

// The test account's persistent browser profile holds its GitHub session, and one browser at a time may open it. The
// setup (e2e/deployment/sign-in.setup.ts) leases it for the moment it signs in.

/** Another process holds the test account's browser profile, or left a lock behind. */
export class ProfileBusy extends Error {
  override readonly name = "ProfileBusy"
}

const alive = (pid: unknown) => {
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid < 1) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

/**
 * Takes the test account's persistent browser profile for this process, as the old app's real-e2e harness did
 * (apps/app/e2e/real/auth-permissions/profile.ts), on the same lock file, so the two never share it. link(2) publishes
 * the lock atomically. A lock left by a dead process is not taken over: it fails closed and names the file.
 */
export const leaseProfile = async (profile: string) => {
  const path = await realpath(profile)
  const lock = `${path}.smithers-real-e2e.lock`
  const nonce = randomUUID()
  const candidate = `${lock}.${process.pid}.${nonce}.candidate`
  await writeFile(candidate, JSON.stringify({ pid: process.pid, nonce, acquiredAt: new Date().toISOString() }), { flag: "wx", mode: 0o600 })
  try {
    await link(candidate, lock)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    const holder = await readJson<{ pid?: unknown }>(lock).catch(() => undefined)
    throw new ProfileBusy(
      alive(holder?.pid)
        ? `The test account's browser profile is in use by process ${String(holder?.pid)}; run again when it finishes.`
        : `The test account's browser profile has a lock no running process holds (${lock}); remove it once nothing uses the profile.`,
    )
  } finally {
    await unlink(candidate).catch(() => undefined)
  }
  return {
    path,
    release: async () => {
      const holder = await readJson<{ pid?: unknown; nonce?: unknown }>(lock)
      if (holder?.pid !== process.pid || holder?.nonce !== nonce) throw new ProfileBusy(`The lock ${lock} changed hands before it was released.`)
      await unlink(lock)
    },
  }
}
