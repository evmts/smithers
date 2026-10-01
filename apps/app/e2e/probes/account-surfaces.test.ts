import { expect, test } from "bun:test"
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { key, Tui } from "../../../tui/e2e/tmux"
import { startFullBackend } from "../fixtures/full-backend"

// Public selfhost first-owner authority, real Go/PostgreSQL, CLI and terminal.
// The model flag only permits startup; no Chat submission or provider is configured.
test("Account uses the selected public PAT across CLI, terminal and request-only reload", async () => {
  const root = await mkdtemp(join(tmpdir(), "smithers-account-surfaces-"))
  let backend: Awaited<ReturnType<typeof startFullBackend>> | undefined
  let tui: Tui | undefined
  let token: string | undefined
  let tokenID: number | undefined
  const sessions = join(root, "sessions")
  const environment = () => ({
    PATH: process.env.PATH ?? "",
    HOME: root,
    XDG_CONFIG_HOME: root,
    SMITHERS_DISABLE_SYSTEM_KEYRING: "1",
    SMITHERS_API_ORIGIN: backend!.origin,
    SMITHERS_TUI_SESSION_DIR: sessions,
    ...(token === undefined ? {} : { SMITHERS_TOKEN: token })
  })
  const cli = async () => {
    const child = Bun.spawn([
      "node",
      resolve(import.meta.dir, "../../../../packages/smithers/bin/smithers.mjs"),
      "account",
      "show",
      "--json"
    ], {
      cwd: root,
      env: environment(),
      stdout: "pipe",
      stderr: "pipe"
    })
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text()
    ])
    return { status, stdout, stderr }
  }
  const start = async (continuing = false) => {
    tui = await Tui.start({
      cwd: root,
      cols: 110,
      rows: 40,
      command: `bun ${resolve(import.meta.dir, "../../../tui/src/main.tsx")} --model cerebras:qwen-3.8-27b${
        continuing ? " --continue" : ""
      }`,
      env: environment()
    })
    await tui.until((screen) => /↑\S+ ↓\S+/.test(screen), 20000, "Account terminal startup")
  }
  const open = async (expected: string) => {
    await tui!.type("/account.show")
    await tui!.press(key.enter)
    await tui!.until((screen) => screen.includes(expected), 5000, "selected Account presentation")
    expect(token === undefined || !tui!.screen().includes(token)).toBe(true)
  }
  const history = async () => {
    const files = await readdir(sessions, { recursive: true })
    return (await Promise.all(
      files.filter((file) => file.endsWith(".jsonl")).map((file) => readFile(join(sessions, file), "utf8"))
    )).join("\n")
  }
  try {
    backend = await startFullBackend()
    const owner = await backend!.http("/api/user")
    expect(owner.status).toBe(200)
    expect(await owner.json()).toMatchObject({ username: backend!.username, is_admin: true })
    expect((await cli()).status).not.toBe(0)
    await start()
    await open("smthrs auth login")
    await tui!.stop()
    tui = undefined
    const created = await backend!.http("/api/user/tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "owned-account-acceptance", scopes: ["read:user"] })
    })
    expect(created.status).toBe(201)
    const credential = await created.json() as { id: number; token: string }
    expect(Number.isSafeInteger(credential.id)).toBe(true)
    expect(typeof credential.token).toBe("string")
    token = credential.token
    tokenID = credential.id
    const selected = await fetch(backend!.origin + "/api/user", { headers: { authorization: `token ${token}` } })
    expect(selected.status).toBe(200)
    expect(await selected.json()).toMatchObject({ username: backend!.username, is_admin: true })
    const result = await cli()
    expect(result.status).toBe(0)
    expect((result.stdout + result.stderr).includes(token)).toBe(false)
    expect(JSON.parse(result.stdout)).toEqual({ login: backend!.username })
    await start()
    await open(`@${backend!.username}`)
    await tui!.type("owned unsent Account draft")
    await tui!.until((screen) => screen.includes("owned unsent Account draft"), 5000, "Chat remains editable")
    await tui!.stop()
    tui = undefined
    const durable = await history()
    const receipts = durable.split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((record) =>
      record.type === "account"
    )
    expect(receipts.some((record) => record.receipt.state === "requested")).toBe(true)
    expect(receipts.some((record) => record.receipt.state === "complete")).toBe(true)
    for (const record of receipts) {
      expect(Object.keys(record.receipt).sort()).toEqual(["actor", "id", "origin", "owner", "state"])
    }
    expect(durable.includes(token)).toBe(false)
    expect(durable).not.toContain(backend!.username)
    expect(durable).not.toContain("\"model-requested\"")
    await start(true)
    await open(`@${backend!.username}`) // Explicit reselection under the continued request-only journal.
    const resumed = await history()
    const after = resumed.split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((record) =>
      record.type === "account"
    )
    expect(after.filter((record) => record.receipt.state === "complete").length).toBeGreaterThan(
      receipts.filter((record) => record.receipt.state === "complete").length
    )
    expect(after.at(-1).receipt.id).not.toBe(receipts.at(-1).receipt.id)
    const revoked = await backend!.http(`/api/user/tokens/${tokenID}`, { method: "DELETE" })
    expect(revoked.status).toBe(204)
    tokenID = undefined
    expect((await fetch(backend!.origin + "/api/user", { headers: { authorization: `token ${token}` } })).status).toBe(
      401
    )
    expect((await cli()).status).not.toBe(0)
    await tui!.type("/account.show")
    await tui!.press(key.enter)
    await tui!.until((screen) => screen.includes("That command could not run."), 5000, "revoked authority refusal")
    expect(tui!.screen().includes(token)).toBe(false)
    expect(tui!.screen()).not.toContain(`@${backend!.username}`)
    await tui!.stop()
    tui = undefined
    const replacement = await backend!.http("/api/user/tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "owned-account-recovery", scopes: ["read:user"] })
    })
    expect(replacement.status).toBe(201)
    const renewed = await replacement.json() as { id: number; token: string }
    token = renewed.token
    tokenID = renewed.id
    await start(true)
    await open(`@${backend!.username}`)
    expect((await cli()).status).toBe(0)
  } finally {
    try {
      await tui?.stop()
    } finally {
      try {
        if (tokenID !== undefined) {
          expect((await backend!.http(`/api/user/tokens/${tokenID}`, { method: "DELETE" })).status).toBe(204)
        }
      } finally {
        try {
          await backend?.stop()
        } finally {
          await rm(root, { recursive: true, force: true })
        }
      }
    }
  }
}, 120000)
