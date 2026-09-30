import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MODEL_CREDENTIAL_ENV_PREFIX } from "@smthrs/rpc/ConfiguredModel"
import { startFixtureChatBackend } from "../e2e/fixtures/chat-backend"
import { createChatStub } from "../e2e/support/ChatStub"
import { startLocalServer } from "../src/bun/server"
import type { LocalServerOptions } from "../src/bun/server"

/** Test-only composition. A stubbed model is not permission to inspect host credentials. */
export const browserTestOptions = (
  root: string,
  distDir: string,
  env: Readonly<Record<string, string | undefined>>
): LocalServerOptions => {
  const port = Number(env.SMITHERS_LOCAL_PORT ?? "0")
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid browser-test server port")
  const realChat = env.SMITHERS_CHAT_STUB === "0"
  const modelVault = new Map<string, string>()
  // The real-model tier explicitly passes named fixture providers. Neither
  // ordinary browser tests nor that tier inherit unrelated host model keys.
  const modelEnv = realChat ? Object.fromEntries(Object.entries(env).filter(
    (entry): entry is [string, string] => entry[0].startsWith(MODEL_CREDENTIAL_ENV_PREFIX) && entry[1] !== undefined
  )) : {}
  return {
    port,
    distDir,
    ...(realChat ? {} : { agent: createChatStub }),
    cloudMode: realChat ? "hybrid" : "offline",
    cloudApi: null,
    identityUpstream: null,
    env: modelEnv,
    modelKeychain: {
      read: async (service, account) => modelVault.get(`${service}\0${account}`) ?? null,
      write: async (service, account, value) => { modelVault.set(`${service}\0${account}`, value) },
      remove: async (service, account) => { modelVault.delete(`${service}\0${account}`) }
    },
    home: root,
    stateDir: join(root, "state")
  }
}

export const startBrowserTestHost = async (
  distDir: string,
  env: Readonly<Record<string, string | undefined>> = process.env
) => {
  const root = await mkdtemp(join(tmpdir(), "smithers-browser-test-"))
  // Retain the owned fixture if startup fails: a partial server startup has
  // not yet handed us its shutdown handle, so deleting underneath it is unsafe.
  if (env.SMITHERS_CHAT_STUB === "0") throw new Error("Real-model browser chat requires an explicitly composed canonical backend")
  const backend = await startFixtureChatBackend({ mode: "browser" })
  let server: Awaited<ReturnType<typeof startLocalServer>>
  try {
    server = await startLocalServer({ ...browserTestOptions(root, distDir, env), chatBackend: { origin: backend.origin, token: backend.token } })
  } catch (error) {
    await backend.stop()
    throw error
  }
  let stopping: Promise<void> | undefined
  return {
    ...server,
    stop: (): Promise<void> => stopping ??= (async () => {
      try { await server.stop() }
      finally { try { await backend.stop() } finally { await rm(root, { recursive: true, force: true }) } }
    })()
  }
}
