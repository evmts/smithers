import { describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MODEL_CATALOG_PATH, TURN_REPLAY_PATH } from "@smthrs/rpc/AgentApiRoutes"
import { ModelCatalogSchema } from "@smthrs/rpc/ConfiguredModel"
import { LOCAL_SESSION_HEADER } from "@smthrs/rpc/LocalSession"
import { createChatStub } from "../../e2e/support/ChatStub"
import { browserTestOptions, startBrowserTestHost } from "../../scripts/browser-test-host"
import { createModelCredentials, MODEL_KEYCHAIN_SERVICE, modelKeychainAccount } from "./ModelCredentials"
import { DEFAULT_CLOUD_API, startLocalServer } from "./server"

describe("browser tests separate fixture ownership from real-host authority", () => {
  test("explicit real-tier selection forwards proof refusal only to the selected authenticated HTTP backend", async () => {
    const root = await mkdtemp(join(tmpdir(), "smithers-selected-browser-backend-"))
    await writeFile(join(root, "index.html"), "<body>owned test UI</body>")
    const seen: Array<{ path: string; authorization: string | null; cookie: string | null; body: string }> = []
    // Controlled protocol refusal validates relay routing; it does not qualify real account authentication or inference.
    const backend = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: async (request) => {
      const path = new URL(request.url).pathname
      seen.push({ path, authorization: request.headers.get("authorization"), cookie: request.headers.get("cookie"), body: await request.text() })
      if (path === "/api/user/workspaces") return Response.json([])
      return Response.json({ status: "error", code: "invalid_access" }, { status: 403 })
    } })
    let host: Awaited<ReturnType<typeof startBrowserTestHost>> | undefined
    try {
      host = await startBrowserTestHost(root, {
        SMITHERS_CHAT_STUB: "0", SMITHERS_CLOUD_API: backend.url.origin,
        SMITHERS_CLOUD_TOKEN: "explicit-synthetic-token", OPENAI_API_KEY: "unrelated-ambient-key"
      })
      const proof = { runId: "proof-refusal", journal: { version: 1, legId: "test-leg", token: "wrong-proof" } }
      const response = await fetch(`${host.origin}${TURN_REPLAY_PATH}`, { method: "POST", headers: {
        [LOCAL_SESSION_HEADER]: host.sessionToken, "content-type": "application/json",
        authorization: "Bearer unrelated-renderer-token", cookie: "smithers_session=unrelated"
      }, body: JSON.stringify(proof) })
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ status: "error", code: "invalid_access" })
      const replay = seen.filter(request => request.path === TURN_REPLAY_PATH)
      expect(replay).toEqual([{ path: TURN_REPLAY_PATH, authorization: "token explicit-synthetic-token", cookie: null, body: JSON.stringify(proof) }])
      expect(seen.every(request => request.authorization?.includes("explicit-synthetic-token"))).toBe(true)
    } finally {
      await host?.stop()
      backend.stop(true)
      await rm(root, { recursive: true, force: true })
    }
  })
  test("default options cannot discover host credentials or inherit hybrid cloud configuration", async () => {
    const options = browserTestOptions("/fixture/owned", "/fixture/dist", {
      SMITHERS_LOCAL_MODE: "hybrid",
      SMITHERS_CLOUD_API: "https://not-a-test.invalid",
      CODEX_HOME: "/fixture/personal-credentials",
      OPENAI_API_KEY: "fixture-only-not-a-credential"
    })
    expect(options).toMatchObject({
      home: "/fixture/owned",
      stateDir: "/fixture/owned/state",
      agent: createChatStub,
      cloudMode: "offline",
      cloudApi: null,
      identityUpstream: null,
      env: {}
    })
    const credentials = await createModelCredentials({
      env: options.env!,
      scope: options.stateDir!,
      keychain: options.modelKeychain!
    })
    expect(credentials.read("OPENAI_API_KEY")).toBeUndefined()
  })

  test("model credentials stay in each test host's own memory", async () => {
    const first = browserTestOptions("/fixture/first", "/fixture/dist", { OPENAI_API_KEY: "fixture-only" })
    const second = browserTestOptions("/fixture/second", "/fixture/dist", {})
    expect(first.env).toEqual({})
    expect(second.env).toEqual({})
    await first.modelKeychain!.write("models", "account", "fixture-value")
    expect(await first.modelKeychain!.read("models", "account")).toBe("fixture-value")
    expect(await second.modelKeychain!.read("models", "account")).toBeNull()
    await first.modelKeychain!.remove("models", "account")
    expect(await first.modelKeychain!.read("models", "account")).toBeNull()
  })

  test("a running fixture reads only its private model vault, never ambient model env", async () => {
    const root = await mkdtemp(join(tmpdir(), "smithers-browser-credential-test-"))
    const dist = join(root, "dist")
    await mkdir(dist)
    await writeFile(join(dist, "index.html"), "<!doctype html><title>Fixture</title>")
    const options = browserTestOptions(root, dist, { OPENAI_API_KEY: "ambient-fixture-only" })
    await options.modelKeychain!.write(MODEL_KEYCHAIN_SERVICE, modelKeychainAccount(options.stateDir!), JSON.stringify({
      version: 1,
      entries: [{ name: "LOOPBACK", origin: "http://127.0.0.1:12345", value: "private-fixture-only" }],
      receipts: []
    }))
    try {
      const server = await startLocalServer(options)
      try {
        const response = await fetch(`${server.origin}${MODEL_CATALOG_PATH}`, {
          headers: { [LOCAL_SESSION_HEADER]: server.sessionToken }
        })
        expect(response.status).toBe(200)
        const catalog = ModelCatalogSchema.parse(await response.json())
        expect(catalog.credentials.find(row => row.name === "OPENAI_API_KEY")?.present).toBe(false)
        expect(catalog.credentials.find(row => row.name === "LOOPBACK")?.present).toBe(true)
      } finally {
        await server.stop()
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("real chat is a separate explicit opt-in and never imports real identity authority", async () => {
    const options = browserTestOptions("/fixture/owned", "/fixture/dist", {
      SMITHERS_CHAT_STUB: "0",
      SMITHERS_CLOUD_TOKEN: "explicit-synthetic-cloud-token",
      OPENAI_API_KEY: "ambient-key-must-not-pass",
      SMITHERS_MODEL_KEY_LOOPBACK: "explicit-fixture-key",
      SMITHERS_MODEL_KEY_LOOPBACK_ORIGIN: "http://127.0.0.1:12345"
    })
    expect(options.agent).toBeUndefined()
    expect(options.cloudMode).toBe("hybrid")
    expect(options.home).toBe("/fixture/owned")
    expect(options.cloudApi).toBe(DEFAULT_CLOUD_API)
    expect(options.chatBackend).toEqual({ origin: DEFAULT_CLOUD_API, token: "explicit-synthetic-cloud-token" })
    // The Cloud user is the explicit SMITHERS_CLOUD_TOKEN, never a stored login.
    expect(await options.cloudKeychain!.read("smithers-cloud", "account")).toBeNull()
    expect(options.identityUpstream).toBeNull()
    expect(options.env).toEqual({
      SMITHERS_MODEL_KEY_LOOPBACK: "explicit-fixture-key",
      SMITHERS_MODEL_KEY_LOOPBACK_ORIGIN: "http://127.0.0.1:12345"
    })
    expect(() => browserTestOptions("/fixture/owned", "/fixture/dist", { SMITHERS_LOCAL_PORT: "NaN" })).toThrow("port")
    expect(() => browserTestOptions("/fixture/owned", "/fixture/dist", { SMITHERS_CHAT_STUB: "0" })).toThrow("explicitly supplied")
    expect(() => browserTestOptions("/fixture/owned", "/fixture/dist", {
      SMITHERS_CHAT_STUB: "0", SMITHERS_CLOUD_TOKEN: "fixture-only", SMITHERS_CLOUD_API: "https://user:password@invalid.test"
    })).toThrow("Native API origin")
  })
})
