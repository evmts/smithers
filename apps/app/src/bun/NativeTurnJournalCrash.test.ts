import { expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { TURN_PATH, TURN_REPLAY_PATH } from "@smthrs/rpc/AgentApiRoutes"
import { AgentTurnJournalDeliverySchema, AgentTurnJournalReplySchema } from "@smthrs/rpc/AgentTurnJournal"
import { LOCAL_SESSION_HEADER } from "@smthrs/rpc/LocalSession"
import { startFixtureChatBackend } from "../../e2e/fixtures/chat-backend"
import { createAppStore } from "../mainview/state/AppStore"
import { startLocalServer } from "./server"
import type { LocalServer } from "./server"

const journal = { version: 1 as const, legId: "killed-host-leg", token: "synthetic_crash_capability_12345678901234567890" }
const post = (origin: string, token: string, path: string, body: unknown) => fetch(`${origin}${path}`, {
  method: "POST", headers: { "content-type": "application/json", [LOCAL_SESSION_HEADER]: token }, body: JSON.stringify(body)
})
const nextLine = (stream: ReadableStream<Uint8Array>, reader = stream.getReader()) => {
  const decoder = new TextDecoder()
  let pending = ""
  return async (): Promise<string> => {
    for (;;) {
      const newline = pending.indexOf("\n")
      if (newline !== -1) { const line = pending.slice(0, newline); pending = pending.slice(newline + 1); return line }
      const next = await reader.read()
      if (next.done) throw new Error("Crash fixture closed before its expected receipt")
      pending += decoder.decode(next.value, { stream: true })
    }
  }
}

for (const boundary of ["acceptance", "batch"] as const) test(`SIGKILL of the renderer after canonical ${boundary} preserves committed replay and never replaces inference`, async () => {
  const backend = await startFixtureChatBackend()
  const root = await mkdtemp(join(tmpdir(), "smithers-killed-turn-"))
  await writeFile(join(root, "index.html"), "<!doctype html><title>Crash fixture</title>")
  const turn = { runId: "killed-host-turn", instructions: "Fixture only.", messages: [{ role: "user", content: boundary === "acceptance" ? "__held__" : "__many__" }], journal }
  const child = Bun.spawn([process.execPath, join(import.meta.dir, "fixtures/NativeTurnJournalCrashHost.ts"), root, backend.origin, boundary], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, SMITHERS_CHAT_FIXTURE_OWNER_TOKEN: backend.token }, stdout: "pipe", stderr: "pipe"
  })
  const stderr = new Response(child.stderr).text()
  const receipt = nextLine(child.stdout)
  const bytes = new Map<string, string>()
  const store = await createAppStore({ kind: "localStorage", storage: { getItem: key => bytes.get(key) ?? null,
    setItem: (key, value) => { bytes.set(key, value) }, removeItem: key => { bytes.delete(key) } } })
  let reopened: LocalServer | undefined
  try {
    const ready = JSON.parse(await receipt()) as { type: string; origin: string; token: string }
    expect(ready.type).toBe("ready")
    await store.dispatch({ type: "http.turn.started", actor: "user", turnId: turn.runId, attemptId: "attempt", text: "hello", retry: false, journal }).isPersisted.promise
    const response = await post(ready.origin, ready.token, TURN_PATH, turn)
    expect(response.status).toBe(200)
    const visible = nextLine(response.body!)
    const accepted = AgentTurnJournalDeliverySchema.parse(JSON.parse(await visible()))
    if (accepted.type !== "accepted") throw new Error("Expected actual acceptance before output")
    await store.dispatch({ type: "http.leg.accepted", actor: "system", attemptId: "attempt", legId: journal.legId, cursor: accepted.cursor }).isPersisted.promise
    const cut = JSON.parse(await receipt()) as { type: string; delivery: unknown }
    expect(cut.type).toBe("boundary")
    const committed = AgentTurnJournalDeliverySchema.parse(cut.delivery)
    expect(committed.type).toBe(boundary === "acceptance" ? "accepted" : "batch")
    child.kill("SIGKILL")
    await child.exited
    expect(child.signalCode).toBe("SIGKILL")
    await expect(visible()).rejects.toThrow()
    expect(await stderr).toBe("")
    expect(store.collections.httpTurnLegs.get(journal.legId)?.cursor).toEqual(accepted.cursor)
    reopened = await startLocalServer({ port: 0, distDir: root, home: root, stateDir: join(root, "drafts"), cloudMode: "offline", chatBackend: { origin: backend.origin, token: backend.token }, log: () => {} })
    expect((await post(reopened.origin, ready.token, TURN_REPLAY_PATH, { runId: turn.runId, journal })).status).toBe(401)
    if (boundary === "acceptance") {
      const parked = await (await post(reopened.origin, reopened.sessionToken, TURN_REPLAY_PATH, { runId: turn.runId, journal })).json()
      expect(parked).toMatchObject({ status: "ok", terminal: false, batches: [] })
      await backend.release()
    }
    const deadline = Date.now() + 10_000
    let cursor = accepted.cursor
    let terminal = false
    const replayed: unknown[] = []
    while (!terminal && Date.now() < deadline) {
      const replay = await post(reopened.origin, reopened.sessionToken, TURN_REPLAY_PATH, { runId: turn.runId, journal, after: cursor })
      expect(replay.status).toBe(200)
      const page = AgentTurnJournalReplySchema.parse(await replay.json())
      if (page.status !== "ok") throw new Error("Expected canonical committed replay")
      for (const batch of page.batches) {
        replayed.push(...batch.frames)
        await store.dispatch({ type: "http.turn.batch.received", actor: "system", attemptId: "attempt", legId: journal.legId, batch }).isPersisted.promise
        const text = store.collections.messages.get(`message-${turn.runId}-smithers`)?.text
        await store.dispatch({ type: "http.turn.batch.received", actor: "system", attemptId: "attempt", legId: journal.legId, batch }).isPersisted.promise
        expect(store.collections.messages.get(`message-${turn.runId}-smithers`)?.text).toBe(text)
      }
      cursor = page.next
      terminal = page.terminal && !page.more
    }
    expect(terminal).toBe(true)
    expect(replayed.length).toBe(boundary === "acceptance" ? 2 : 1006)
    if (committed.type === "batch") expect(replayed.slice(0, committed.batch.frames.length)).toEqual(committed.batch.frames)
    expect(store.collections.httpTurnLegs.get(journal.legId)?.cursor).toEqual(cursor)
    expect((await store.verifyState()).valid).toBe(true)
    expect(await backend.calls()).toBe(1)
    expect(await (await post(reopened.origin, reopened.sessionToken, TURN_PATH, turn)).json()).toEqual({ status: "existing", cursor, terminal: true })
    expect((await post(reopened.origin, reopened.sessionToken, TURN_PATH, { ...turn, instructions: "replacement inference" })).status).toBe(409)
    expect(await backend.calls()).toBe(1)
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL")
    await child.exited
    await reopened?.stop()
    await store.dispose?.()
    await backend.stop()
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)

for (const boundary of ["before-inference", "acceptance", "batch"] as const) test(`SIGKILL of the canonical owner at ${boundary} preserves receipts and fences duplicate inference`, async () => {
  const backend = await startFixtureChatBackend()
  const root = await mkdtemp(join(tmpdir(), "smithers-killed-owner-"))
  await writeFile(join(root, "index.html"), "<!doctype html><title>Owner crash fixture</title>")
  const host = await startLocalServer({ port: 0, distDir: root, home: root, stateDir: join(root, "drafts"), cloudMode: "offline", chatBackend: { origin: backend.origin, token: backend.token }, log: () => {} })
  const turn = { runId: `killed-owner-${boundary}`, instructions: "Fixture only.", messages: [{ role: "user", content: boundary === "before-inference" ? "__before-inference__" : boundary === "batch" ? "__partial__" : "__held__" }], journal }
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const response = await post(host.origin, host.sessionToken, TURN_PATH, turn)
    expect(response.status).toBe(200)
    reader = response.body!.getReader()
    const accepted = AgentTurnJournalDeliverySchema.parse(JSON.parse(await nextLine(response.body!, reader)()))
    expect(accepted.type).toBe("accepted")
    const before = Date.now() + 10_000
    while (await backend.grants() === 0 && Date.now() < before) { /* real grant-admission readback */ }
    expect(await backend.grants()).toBe(1)
    if (boundary !== "before-inference") {
      while (await backend.calls() === 0 && Date.now() < before) { /* actual model stream boundary */ }
      expect(await backend.calls()).toBe(1)
    } else expect(await backend.calls()).toBe(0)
    let prefix: unknown[] = []
    if (boundary === "batch") {
      while (prefix.length === 0 && Date.now() < before) {
        const page = AgentTurnJournalReplySchema.parse(await (await post(host.origin, host.sessionToken, TURN_REPLAY_PATH, { runId: turn.runId, journal })).json())
        if (page.status !== "ok") throw new Error("Expected actual committed prefix")
        prefix = page.batches.flatMap(batch => batch.frames)
      }
      expect(prefix.length).toBeGreaterThan(0)
      expect(prefix.every(frame => typeof frame === "object" && frame !== null && "type" in frame && frame.type === "delta")).toBe(true)
    }
    await backend.crashBackend()
    await reader.cancel().catch(() => {})
    await backend.restart()
    if (boundary === "before-inference") await backend.release()
    const deadline = Date.now() + 10_000
    let terminal = false
    let frames: unknown[] = []
    let after: import("@smthrs/rpc/AgentTurnJournal").AgentTurnCursor | null = null
    while (!terminal && Date.now() < deadline) {
      const replay = await post(host.origin, host.sessionToken, TURN_REPLAY_PATH, { runId: turn.runId, journal, after })
      expect(replay.status).toBe(200)
      const page = AgentTurnJournalReplySchema.parse(await replay.json())
      if (page.status !== "ok") throw new Error("Canonical owner recovery refused")
      terminal = page.terminal && !page.more
      frames.push(...page.batches.flatMap(batch => batch.frames))
      after = page.next
    }
    expect(terminal).toBe(true)
    expect(frames.slice(0, prefix.length)).toEqual(prefix)
    expect(await backend.calls()).toBe(1)
    if (boundary === "before-inference") expect(frames).toContainEqual(expect.objectContaining({ type: "done", reason: "stop" }))
    else expect(frames).toContainEqual(expect.objectContaining({ type: "done", error: expect.any(String) }))
    expect(await (await post(host.origin, host.sessionToken, TURN_PATH, turn)).json()).toMatchObject({ status: "existing", terminal: true })
    expect(await backend.calls()).toBe(1)
  } finally {
    await reader?.cancel().catch(() => {})
    await host.stop()
    await backend.stop()
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)
