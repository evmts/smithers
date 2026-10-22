/** Real competing processes reclaim a dead owner's lock while refresh is held open. */
import { Effect } from "effect"
import { type ChildProcess, spawn } from "node:child_process"
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"
import * as CodexLogin from "../src/internal/CodexLogin.ts"

const childFile = fileURLToPath(new URL("./fixtures/codex-login-lock-race-child.ts", import.meta.url))

type State = { ready?: boolean; active?: boolean; done?: boolean }

const message = (child: ChildProcess): Promise<State> =>
  new Promise((resolve, reject) => {
    const clean = () => {
      child.off("message", received)
      child.off("error", failed)
      child.off("exit", exited)
    }
    const received = (value: unknown) => {
      clean()
      resolve(value as State)
    }
    const failed = (error: Error) => {
      clean()
      reject(error)
    }
    const exited = (code: number | null) => failed(new Error(`lock contender exited ${code}`))
    child.once("message", received)
    child.once("error", failed)
    child.once("exit", exited)
  })

it("stale-lock reclaimers never admit two refresh owners", async () => {
  const directory = mkdtempSync(join(tmpdir(), "smithers-lock-race-"))
  const file = join(directory, "auth.json")
  const children = Array.from(
    { length: 4 },
    () => spawn(process.execPath, ["--no-warnings", childFile, file], { stdio: ["ignore", "ignore", "inherit", "ipc"] })
  )
  const closed = children.map((child) => new Promise<void>((resolve) => child.once("close", () => resolve())))
  try {
    expect(await Promise.all(children.map(message))).toEqual(children.map(() => ({ ready: true })))
    for (let round = 0; round < 12; round++) {
      writeFileSync(file, JSON.stringify({ tokens: { access_token: "eyJhbGciOiJub25lIn0.eyJleHAiOjB9.signature" } }))
      // A long stale record widens the read/check/unlink race without changing
      // its ownership semantics: all contenders observe the same dead PID.
      writeFileSync(`${file}.refresh.lock`, `2147483647:${"x".repeat(16 * 1024 * 1024)}`)
      utimesSync(`${file}.refresh.lock`, 0, 0)
      const checkpoints = Promise.all(children.map(message))
      children.forEach((child) => child.send("begin"))
      let states = await checkpoints
      // Simultaneous SQLite lock attempts can all yield before a winner; drive
      // their polling clocks until one process actually owns refresh.
      for (let attempt = 0; states.every((state) => !state.active) && attempt < 20; attempt++) {
        const advanced = Promise.all(children.map(message))
        children.forEach((child) => child.send("advance"))
        states = await advanced
      }
      expect(states.filter((state) => state.active).length, `round ${round}: simultaneous refresh owners`).toBe(1)
      const done = Promise.all(children.map(message))
      children.forEach((child) => child.send("release"))
      expect(await done).toEqual(children.map(() => ({ done: true })))
    }
  } finally {
    children.forEach((child) => child.kill("SIGKILL"))
    await Promise.all(closed)
    rmSync(directory, { recursive: true, force: true })
  }
})

it("releases the reclamation guard when its process dies", async () => {
  const directory = mkdtempSync(join(tmpdir(), "smithers-reclaimer-crash-"))
  const file = join(directory, "auth.json")
  writeFileSync(file, JSON.stringify({ tokens: { access_token: "eyJhbGciOiJub25lIn0.eyJleHAiOjB9.signature" } }))
  writeFileSync(`${file}.refresh.lock`, "2147483647:dead")
  utimesSync(`${file}.refresh.lock`, 0, 0)
  const holder = spawn(process.execPath, [
    "--input-type=module",
    "-e",
    `
    import { DatabaseSync } from "node:sqlite"
    const database = new DatabaseSync(process.argv[1])
    database.exec("BEGIN EXCLUSIVE")
    process.on("message", () => {})
    process.send({ ready: true })
  `,
    `${file}.refresh.guard.sqlite`
  ], { stdio: ["ignore", "ignore", "ignore", "ipc"] })
  const closed = new Promise<void>((resolve) => holder.once("close", () => resolve()))
  try {
    expect(await message(holder)).toEqual({ ready: true })
    holder.kill("SIGKILL")
    await closed
    const rotated = `eyJhbGciOiJub25lIn0.${
      Buffer.from(JSON.stringify({ exp: 10_000_000_000 })).toString("base64url")
    }.signature`
    const refresh = Effect.sync(() => {
      writeFileSync(file, JSON.stringify({ tokens: { access_token: rotated } }))
    })
    expect(await Effect.runPromise(CodexLogin.make({ file, refresh }).auth.sign({}))).toEqual({
      Authorization: `Bearer ${rotated}`
    })
  } finally {
    holder.kill("SIGKILL")
    await closed
    rmSync(directory, { recursive: true, force: true })
  }
})
