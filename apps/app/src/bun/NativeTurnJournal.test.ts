import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { TURN_PATH, CANCEL_PATH, TURN_REPLAY_PATH, TURN_RETIRE_PATH, TURN_ERASE_PATH } from "@smthrs/rpc/AgentApiRoutes"
import { AgentTurnJournalDeliverySchema, AgentTurnJournalReplySchema, agentTurnJournalDigestInput } from "@smthrs/rpc/AgentTurnJournal"
import { LOCAL_SESSION_HEADER } from "@smthrs/rpc/LocalSession"
import { startFixtureChatBackend } from "../../e2e/fixtures/chat-backend"
import { startLocalServer } from "./server"
import type { LocalServer } from "./server"

const journal = { version: 1 as const, legId: "native-leg", token: "native_private_capability_12345678901234567890" }
const turn = (content = "hello") => ({ runId: "native-turn", instructions: "Briefly.", messages: [{ role: "user", content }], journal })
const access = { runId: "native-turn", journal }
const post = (host: LocalServer, path: string, body: unknown, token = host.sessionToken) => fetch(`${host.origin}${path}`, {
  method: "POST", headers: { "content-type": "application/json", [LOCAL_SESSION_HEADER]: token, authorization: "Bearer untrusted-renderer", cookie: "smithers_session=untrusted" }, body: JSON.stringify(body)
})
const fixture = async () => {
  const backend = await startFixtureChatBackend()
  const root = await mkdtemp(join(tmpdir(), "smithers-native-journal-"))
  await writeFile(join(root, "index.html"), "<!doctype html><title>Test</title>")
  const hosts: LocalServer[] = []
  let factories = 0
  const boot = async (configured = true) => {
    const host = await startLocalServer({ port: 0, distDir: root, home: root, stateDir: join(root, "drafts"), cloudMode: "offline",
      ...(configured ? { chatBackend: { origin: backend.origin, token: backend.token } } : {}),
      agent: () => { factories++; throw new Error("Alternate local producer must not be constructed") }, log: () => {} })
    hosts.push(host)
    return host
  }
  return { backend, boot, factories: () => factories, close: async () => {
    await Promise.all(hosts.map(host => host.stop()))
    await backend.stop()
    await rm(root, { recursive: true, force: true })
  } }
}
const readOutput = async (response: Response) => {
  expect(response.status).toBe(200)
  return (await response.text()).trim().split("\n").map(line => AgentTurnJournalDeliverySchema.parse(JSON.parse(line)))
    .flatMap(delivery => delivery.type === "batch" ? delivery.batch.frames : [])
}

test("canonical durable chat survives renderer and backend restart, replays more than 1000 frames and never repeats inference", async () => {
  const f = await fixture()
  try {
    const first = await f.boot()
    const live = await readOutput(await post(first, TURN_PATH, turn("__many__")))
    expect(live.length).toBe(1006)
    expect(await f.backend.calls()).toBe(1)
    expect(f.factories()).toBe(0)
    await first.stop()
    await f.backend.restart()
    const second = await f.boot()
    expect((await post(second, TURN_REPLAY_PATH, access, first.sessionToken)).status).toBe(401)
    expect((await post(second, TURN_REPLAY_PATH, { ...access, journal: { ...journal, token: "wrong_private_capability_12345678901234567890" } })).status).toBe(403)
    const frames: unknown[] = []
    let after: import("@smthrs/rpc/AgentTurnJournal").AgentTurnCursor | null = null
    let more = true
    while (more) {
      const response = await post(second, TURN_REPLAY_PATH, { ...access, after })
      expect(response.status).toBe(200)
      const page = AgentTurnJournalReplySchema.parse(await response.json())
      expect(page.status).toBe("ok")
      if (page.status !== "ok") throw new Error("Canonical replay refused")
      frames.push(...page.batches.flatMap(batch => batch.frames))
      after = page.next
      more = page.more
    }
    expect(frames).toEqual(live)
    expect(await (await post(second, TURN_PATH, turn("__many__"))).json()).toMatchObject({ status: "existing", terminal: true })
    expect(await f.backend.calls()).toBe(1)
    expect((await post(second, TURN_RETIRE_PATH, access)).status).toBe(200)
    expect((await post(second, TURN_REPLAY_PATH, access)).status).toBe(410)
    await second.stop()
    await f.backend.restart()
    const third = await f.boot()
    expect((await post(third, TURN_PATH, turn("__many__"))).status).toBe(410)
    expect(await f.backend.calls()).toBe(1)
  } finally { await f.close() }
}, 60_000)

test("proof-only erasure before admission survives restart and cannot be undone by a delayed request", async () => {
  const f = await fixture()
  try {
    const retirementProof = createHash("sha256").update(agentTurnJournalDigestInput("access", journal.token)).digest("hex")
    const erased = await fetch(`${f.backend.origin}${TURN_ERASE_PATH}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: access.runId, legId: journal.legId, retirementProof }) })
    expect(erased.status).toBe(200)
    expect(await erased.json()).toEqual({ status: "retired" })
    await f.backend.restart()
    const host = await f.boot()
    expect((await post(host, TURN_PATH, turn())).status).toBe(410)
    expect(await f.backend.calls()).toBe(0)
  } finally { await f.close() }
}, 60_000)

test("cancelling through the native adapter closes durable output and restart cannot launch it again", async () => {
  const f = await fixture()
  try {
    const host = await f.boot()
    const response = await post(host, TURN_PATH, turn("__block__"))
    expect(response.status).toBe(200)
    const reader = response.body!.getReader()
    const accepted = await reader.read()
    expect(new TextDecoder().decode(accepted.value)).toContain('"type":"accepted"')
    const startedBy = Date.now() + 10_000
    while (await f.backend.calls() === 0 && Date.now() < startedBy) { /* actual provider-start readback */ }
    expect(await f.backend.calls()).toBe(1)
    const cancelled = await post(host, CANCEL_PATH, { runId: access.runId })
    expect(cancelled.status).toBe(200)
    let output = ""
    for (;;) { const part = await reader.read(); if (part.done) break; output += new TextDecoder().decode(part.value) }
    expect(output).toContain('"type":"done"')
    const calls = await f.backend.calls()
    expect(calls).toBe(1)
    await host.stop()
    await f.backend.restart()
    const second = await f.boot()
    const replay = await (await post(second, TURN_REPLAY_PATH, access)).json()
    expect(replay).toMatchObject({ status: "ok", terminal: true })
    expect(await (await post(second, TURN_PATH, turn("__block__"))).json()).toMatchObject({ status: "existing", terminal: true })
    expect(await f.backend.calls()).toBe(calls)
  } finally { await f.close() }
}, 60_000)

test("canonical erasure deletes retained private output and fences reuse after restart", async () => {
  const f = await fixture()
  try {
    const host = await f.boot()
    const privateTurn = turn("private-native-input-marker")
    const frames = await readOutput(await post(host, TURN_PATH, privateTurn))
    expect(JSON.stringify(frames)).toContain("private-native-fixture-output")
    expect(await f.backend.storedPrivateOutput()).toBe(true)
    expect(await f.backend.storedPrivateOutput("prompt")).toBe(true)
    const retirementProof = createHash("sha256").update(agentTurnJournalDigestInput("access", journal.token)).digest("hex")
    const erased = await post(host, TURN_ERASE_PATH, { runId: access.runId, legId: journal.legId, retirementProof })
    expect(erased.status).toBe(200)
    expect(await erased.json()).toEqual({ status: "retired" })
    expect(await f.backend.storedPrivateOutput()).toBe(false)
    expect(await f.backend.storedPrivateOutput("prompt")).toBe(false)
    expect((await post(host, TURN_REPLAY_PATH, access)).status).toBe(410)
    await host.stop()
    await f.backend.restart()
    const second = await f.boot()
    expect((await post(second, TURN_PATH, privateTurn)).status).toBe(410)
    expect(await f.backend.storedPrivateOutput()).toBe(false)
    expect(await f.backend.storedPrivateOutput("prompt")).toBe(false)
    expect(await f.backend.calls()).toBe(1)
  } finally { await f.close() }
}, 60_000)

test("missing canonical storage refuses a recorded turn before any model request", async () => {
  const root = await mkdtemp(join(tmpdir(), "smithers-native-no-backend-"))
  await writeFile(join(root, "index.html"), "<!doctype html><title>Test</title>")
  let calls = 0
  const model = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => { calls++; return new Response("unused") } })
  const host = await startLocalServer({ port: 0, distDir: root, home: root, stateDir: join(root, "drafts"), cloudMode: "hybrid", cloudApi: null, identityUpstream: null, chat: { chatUrl: model.url.origin }, log: () => {} })
  try {
    const response = await post(host, TURN_PATH, turn())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ status: "error", code: "storage_failed" })
    expect(calls).toBe(0)
  } finally { await host.stop(); await model.stop(true); await rm(root, { recursive: true, force: true }) }
})

test("the configured backend's authentication refusal cannot select an alternate local producer", async () => {
  const f = await fixture()
  const root = await mkdtemp(join(tmpdir(), "smithers-native-refused-backend-"))
  await writeFile(join(root, "index.html"), "<!doctype html><title>Test</title>")
  let factories = 0
  const host = await startLocalServer({ port: 0, distDir: root, home: root, cloudMode: "offline", chatBackend: { origin: f.backend.origin, token: `smithers_${"0".repeat(40)}` }, agent: () => { factories++; throw new Error("Alternate producer selected") }, log: () => {} })
  try {
    const response = await post(host, TURN_PATH, turn())
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ code: "unauthorized", fault: "user", message: "invalid or expired token" })
    expect(factories).toBe(0)
    expect(await f.backend.calls()).toBe(0)
  } finally { await host.stop(); await f.close(); await rm(root, { recursive: true, force: true }) }
}, 60_000)
