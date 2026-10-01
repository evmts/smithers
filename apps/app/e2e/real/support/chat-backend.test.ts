import { expect, test } from "bun:test"
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { createServer } from "node:net"
import { join } from "node:path"
import { LOCAL_SESSION_HEADER } from "@smthrs/rpc/LocalSession"
import { startLocalServer } from "../../../src/bun/server"
import { randomBytes, randomUUID } from "node:crypto"
import { AgentTurnJournalReplySchema } from "@smthrs/rpc/AgentTurnJournal"
import { startRealChatBackend, realHostCredentialOptions } from "./chat-backend"
import { launchModelProvider } from "./model-provider-process"
import { PROVIDER_MODEL, PROVIDER_REPLY } from "./model-provider-behaviors"
import { inspectTurnTraffic } from "../chat-tools/traffic"

// Remote authority is deliberately not contacted here: unavailable external Cloud
// cannot be replaced with an owned backend or receive locally declared credentials.
test("explicit remote authority preserves its token and never enrolls local credentials", async () => {
  const backend = await startRealChatBackend({
    SMITHERS_CLOUD_API: "https://api.jjhub.tech", SMITHERS_CLOUD_TOKEN: " selected-token ",
    SMITHERS_MODEL_KEY_LOOPBACK: "local-private-value", SMITHERS_MODEL_KEY_LOOPBACK_ORIGIN: "http://127.0.0.1:1"
  })
  expect(backend).toMatchObject({ kind: "remote", origin: "https://api.jjhub.tech", token: "selected-token" })
  await Promise.all([backend.stop(), backend.stop()])
})

test("an invalid selected remote origin refuses instead of owning a fallback", async () => {
  await expect(startRealChatBackend({ SMITHERS_CLOUD_API: "file:///tmp/backend", SMITHERS_CLOUD_TOKEN: "selected-token" })).rejects.toThrow()
})

test("owned named-model output is committed, independently replayable, private, and cancellable", async () => {
  const key = `sk-owned-${randomUUID()}`
  const provider = await launchModelProvider({ key, slowMs: 1000 })
  const dist = await mkdtemp(join(tmpdir(), "smithers-chat-backend-test-"))
  await writeFile(join(dist, "index.html"), "<!doctype html><title>Boundary fixture</title>")
  let local: Awaited<ReturnType<typeof startLocalServer>> | undefined
  let proxy: ReturnType<typeof Bun.spawn> | undefined
  let backend: Awaited<ReturnType<typeof startRealChatBackend>> | undefined
  try {
    backend = await startRealChatBackend({ SMITHERS_MODEL_KEY_LOOPBACK: key, SMITHERS_MODEL_KEY_LOOPBACK_ORIGIN: provider.origin })
    expect(backend.kind).toBe("owned")
    const origin = backend.origin
    const absentCredentials = realHostCredentialOptions({})
    const absent = await startLocalServer({ distDir: dist, home: dist, cloudMode: "offline", env: absentCredentials.env, cloudKeychain: absentCredentials.cloudKeychain, modelKeychain: absentCredentials.modelKeychain })
    try {
      const refusal = await fetch(absent.origin + "/api/agent/turn", { method: "POST", headers: { [LOCAL_SESSION_HEADER]: absent.sessionToken, "content-type": "application/json" },
        body: JSON.stringify({ runId: randomUUID(), journal: { version: 1, legId: randomUUID(), token: randomBytes(32).toString("base64url") }, messages: [], instructions: "Boundary" }) })
      expect(refusal.status).toBe(503)
      expect(await refusal.json()).toMatchObject({ status: "error", code: "storage_failed" })
    } finally { await absent.stop() }
    const ownedCredentials = realHostCredentialOptions({})
    local = await startLocalServer({ distDir: dist, home: dist, cloudMode: "offline", chatBackend: backend, env: ownedCredentials.env, cloudKeychain: ownedCredentials.cloudKeychain, modelKeychain: ownedCredentials.modelKeychain })
    const http = (path: string, body: unknown) => fetch(local!.origin + path, {
      method: "POST", headers: { [LOCAL_SESSION_HEADER]: local!.sessionToken, "content-type": "application/json" }, body: JSON.stringify(body)
    })
    const request = (modelId: string) => ({ runId: randomUUID(), journal: { version: 1 as const, legId: randomUUID(), token: randomBytes(32).toString("base64url") },
      messages: [{ role: "user", content: "Answer through the named loopback model" }], instructions: "Answer briefly.", purpose: "explain", role: "explainer",
      model: { protocol: "openai-chat", baseUrl: provider.origin, modelId, credential: "LOOPBACK" } })
    const turn = request(PROVIDER_MODEL.answers)
    const response = await http("/api/agent/turn", turn)
    expect(response.status).toBe(200)
    expect(response.headers.get("x-smithers-turn-journal")).toBe("1")
    const observation = inspectTurnTraffic(await response.text())
    expect(observation.complete).toBe(true)
    expect(observation.frames.filter(frame => frame.type === "delta").map(frame => "text" in frame ? frame.text : "").join("")).toBe(PROVIDER_REPLY.join(""))
    const replay = await http("/api/agent/turn/replay", { runId: turn.runId, journal: turn.journal })
    expect(replay.status).toBe(200)
    const receipt = AgentTurnJournalReplySchema.parse(await replay.json())
    expect(receipt.status).toBe("ok")
    if (receipt.status !== "ok") throw new Error("Missing durable replay")
    expect(receipt.terminal).toBe(true)
    if (!observation.cursor) throw new Error("Missing observed commit cursor")
    expect(receipt.head).toEqual(observation.cursor)
    expect(receipt.batches.flatMap(batch => batch.frames)).toEqual(observation.frames.map(({ journal: _journal, ...frame }) => frame))
    const before = await provider.journal()
    const duplicate = await http("/api/agent/turn", turn)
    expect(duplicate.status).toBe(200)
    await duplicate.text()
    expect(await provider.journal()).toEqual(before)
    const wrongToken = await http("/api/agent/turn/replay", { runId: turn.runId, journal: { ...turn.journal, token: randomBytes(32).toString("base64url") } })
    expect(wrongToken.ok).toBe(false)
    expect(await wrongToken.text()).not.toContain(PROVIDER_REPLY.join(""))
    const slow = request(PROVIDER_MODEL.slow)
    const running = await http("/api/agent/turn", slow)
    expect(running.status).toBe(200)
    const reader = running.body!.getReader()
    const first = await reader.read()
    expect(new TextDecoder().decode(first.value)).toContain('"type":"accepted"')
    const admissionDeadline = Date.now() + 5000
    while (!(await provider.journal()).some(entry => entry.modelId === PROVIDER_MODEL.slow)) {
      if (Date.now() >= admissionDeadline) throw new Error("Slow provider request was not observed before cancellation")
      await Bun.sleep(25)
    }
    const cancelled = await http("/api/agent/turn/cancel", { runId: slow.runId })
    expect(cancelled.ok).toBe(true)
    await cancelled.text()
    let tail = ""
    for (;;) { const chunk = await reader.read(); if (chunk.done) break; tail += new TextDecoder().decode(chunk.value) }
    expect(tail).toContain('"type":"done"')
    const cancelledReplay = await http("/api/agent/turn/replay", { runId: slow.runId, journal: slow.journal })
    expect(cancelledReplay.status).toBe(200)
    const stopped = AgentTurnJournalReplySchema.parse(await cancelledReplay.json())
    expect(stopped.status === "ok" && stopped.terminal).toBe(true)
    if (stopped.status !== "ok") throw new Error("Missing cancelled receipt")
    expect(stopped.batches.flatMap(batch => batch.frames).at(-1)).toMatchObject({ type: "done", reason: "cancelled" })
    const port = await new Promise<number>((resolvePort, reject) => {
      const reservation = createServer().once("error", reject)
      reservation.listen(0, "127.0.0.1", () => {
        const address = reservation.address()
        if (!address || typeof address === "string") throw new Error("Missing proxy port")
        reservation.close(error => error ? reject(error) : resolvePort(address.port))
      })
    })
    proxy = Bun.spawn([process.execPath, new URL("../chat-tools/upstream-proxy.ts", import.meta.url).pathname], {
      env: { ...process.env, SMITHERS_REAL_CHAT_UPSTREAM: origin, SMITHERS_REAL_CHAT_PROXY_PORT: String(port) }, stdout: "pipe", stderr: "pipe"
    })
    const proxyOrigin = `http://127.0.0.1:${port}`
    const readyDeadline = Date.now() + 5000
    for (;;) {
      if (proxy.exitCode !== null) throw new Error("Proxy exited before readiness")
      try { if ((await fetch(proxyOrigin + "/__harness_ready")).status === 204) break } catch {}
      if (Date.now() >= readyDeadline) throw new Error("Proxy readiness was not observed")
      await Bun.sleep(25)
    }
    await local.stop()
    const restoredCredentials = realHostCredentialOptions({})
    local = await startLocalServer({ distDir: dist, home: dist, cloudMode: "offline", chatBackend: { origin: proxyOrigin, token: backend.token }, env: restoredCredentials.env, cloudKeychain: restoredCredentials.cloudKeychain, modelKeychain: restoredCredentials.modelKeychain })
    const faulted = request(PROVIDER_MODEL.slow)
    const stream = await http("/api/agent/turn", faulted)
    expect(stream.status).toBe(200)
    const faultReader = stream.body!.getReader()
    expect(new TextDecoder().decode((await faultReader.read()).value)).toContain('"type":"accepted"')
    const faultDeadline = Date.now() + 5000
    while ((await provider.journal()).filter(entry => entry.modelId === PROVIDER_MODEL.slow).length < 2) {
      if (Date.now() >= faultDeadline) throw new Error("Fault provider admission was not observed")
      await Bun.sleep(25)
    }
    proxy.kill("SIGKILL")
    await proxy.exited
    // The transport is lost; only an independently read durable terminal prefix
    // can prove recovery. Do not invent missing frames from this broken stream.
    try { while (!(await faultReader.read()).done) {} } catch {}
    let recovered
    for (;;) {
      const resumed = await fetch(origin + "/api/agent/turn/replay", { method: "POST", headers: { authorization: `token ${backend.token}`, "content-type": "application/json" }, body: JSON.stringify({ runId: faulted.runId, journal: faulted.journal }) })
      expect(resumed.status).toBe(200)
      recovered = AgentTurnJournalReplySchema.parse(await resumed.json())
      if (recovered.status === "ok" && recovered.terminal) break
      if (Date.now() >= faultDeadline) throw new Error("Durable fault recovery did not become terminal")
      await Bun.sleep(25)
    }
    expect(recovered.batches.flatMap(batch => batch.frames).filter(frame => frame.type === "delta").map(frame => frame.type === "delta" ? frame.text : "").join("")).toBe(PROVIDER_REPLY.join(""))
    expect((await provider.journal()).filter(entry => entry.modelId === PROVIDER_MODEL.slow)).toHaveLength(2)
    expect(JSON.stringify(receipt)).not.toContain(key)
    expect((await provider.journal()).every(entry => entry.authorized)).toBe(true)
    await Promise.all([backend.stop(), backend.stop()])
    await expect(fetch(origin + "/readyz")).rejects.toThrow()
  } finally {
    const failures: unknown[] = []
    for (const release of [
      async () => { if (proxy && proxy.exitCode === null) { proxy.kill("SIGKILL"); await proxy.exited } },
      async () => { await local?.stop() },
      async () => { await backend?.stop() },
      () => rm(dist, { recursive: true, force: true }),
      () => provider.close()
    ]) {
      try { await release() } catch (error) { failures.push(error) }
    }
    if (failures.length) throw new AggregateError(failures, "Chat boundary test cleanup failed")
  }
}, 120_000)


test("rejected public credential enrollment releases its owned backend and PostgreSQL state", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "smithers-chat-enrollment-failure-"))
  try {
    // An isolated process gives this assertion exclusive ownership of TMPDIR.
    // The real credential HTTP schema rejects this value before any provider call.
    const child = Bun.spawn([process.execPath, "--eval", `
      const { startRealChatBackend } = await import(${JSON.stringify(new URL("./chat-backend.ts", import.meta.url).pathname)});
      try {
        await startRealChatBackend({ SMITHERS_MODEL_KEY_LOOPBACK: "x".repeat(8193), SMITHERS_MODEL_KEY_LOOPBACK_ORIGIN: "http://127.0.0.1:1" });
        process.exitCode = 1;
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "Real model credential enrollment was not committed.") throw error;
        console.log("public-enrollment-refused");
      }
    `], { env: { ...process.env, TMPDIR: scratch }, stdout: "pipe", stderr: "pipe" })
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    if (code !== 0) throw new Error(`Owned enrollment child failed: ${stderr}`)
    expect(stdout).toContain("public-enrollment-refused")
    expect(await readdir(scratch)).toEqual([])
  } finally { await rm(scratch, { recursive: true, force: true }) }
}, 120_000)


test("real host credential vault isolates namespaces, removal, and separate host lifetimes", async () => {
  const first = realHostCredentialOptions({
    SMITHERS_MODEL_KEY_LOOPBACK: "fixture-only-value",
    SMITHERS_MODEL_KEY_LOOPBACK_ORIGIN: "http://127.0.0.1:1",
    OPENAI_API_KEY: "must-not-inherit", GITHUB_TOKEN: "must-not-inherit", SMITHERS_CLOUD_TOKEN: "must-not-inherit"
  })
  expect(first.env).toEqual({ SMITHERS_MODEL_KEY_LOOPBACK: "fixture-only-value", SMITHERS_MODEL_KEY_LOOPBACK_ORIGIN: "http://127.0.0.1:1" })
  const cloud = first.cloudKeychain!
  const model = first.modelKeychain!
  await cloud.write("cloud", "owner-a", "cloud-a")
  await model.write("model", "owner-a", "model-a")
  await model.write("model", "owner-b", "model-b")
  expect(await cloud.read("cloud", "owner-a")).toBe("cloud-a")
  expect(await model.read("model", "owner-a")).toBe("model-a")
  expect(await cloud.read("cloud", "owner-b")).toBeNull()
  await model.remove("model", "owner-a")
  expect(await model.read("model", "owner-a")).toBeNull()
  expect(await model.read("model", "owner-b")).toBe("model-b")
  expect(await cloud.read("cloud", "owner-a")).toBe("cloud-a")
  const second = realHostCredentialOptions({})
  expect(await second.cloudKeychain!.read("cloud", "owner-a")).toBeNull()
  expect(await second.modelKeychain!.read("model", "owner-b")).toBeNull()
})
