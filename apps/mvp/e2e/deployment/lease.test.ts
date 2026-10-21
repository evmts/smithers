import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { leaseProfile, ProfileBusy } from "./lease"

describe("the profile's lease", () => {
  // The lock sits beside the profile's real path, as leaseProfile resolves it (macOS's tmpdir is a symlink).
  const root = realpathSync(mkdtempSync(join(tmpdir(), "e2e-profile-")))
  const profile = join(root, "profile")
  mkdirSync(profile)
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it("is one process's at a time, and free again once released", async () => {
    const lease = await leaseProfile(profile)
    await expect(leaseProfile(profile)).rejects.toThrow(`in use by process ${process.pid}`)
    await lease.release()
    const again = await leaseProfile(profile)
    await again.release()
  })

  it("left by a process that ended is not taken over: it names the lock to remove", async () => {
    const ended = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"]).stdout.toString()
    const lock = `${profile}.smithers-real-e2e.lock`
    writeFileSync(lock, JSON.stringify({ pid: Number(ended), nonce: "gone" }))
    const refused = await leaseProfile(profile).catch((error: unknown) => error)
    expect(refused).toBeInstanceOf(ProfileBusy)
    expect((refused as Error).message).toContain(`a lock no running process holds (${lock})`)
    writeFileSync(lock, "not json")
    await expect(leaseProfile(profile)).rejects.toThrow("a lock no running process holds")
    rmSync(lock)
  })

  it("held by a process this user can't signal, such as one run by root, counts as in use", async () => {
    const lock = `${profile}.smithers-real-e2e.lock`
    writeFileSync(lock, JSON.stringify({ pid: 1, nonce: "root" }))
    await expect(leaseProfile(profile)).rejects.toThrow("in use by process 1")
    rmSync(lock)
  })

  it("can't be released by a process that no longer holds it", async () => {
    const lease = await leaseProfile(profile)
    writeFileSync(`${profile}.smithers-real-e2e.lock`, JSON.stringify({ pid: process.pid, nonce: "someone else" }))
    await expect(lease.release()).rejects.toThrow("changed hands before it was released")
    rmSync(`${profile}.smithers-real-e2e.lock`)
  })

  it("needs the profile to exist", async () => {
    await expect(leaseProfile(join(root, "missing"))).rejects.toMatchObject({ code: "ENOENT" })
  })
})
