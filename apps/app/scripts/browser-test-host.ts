import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MODEL_CREDENTIAL_ENV_PREFIX } from "@smthrs/rpc/ConfiguredModel"
import { startFixtureChatBackend } from "../e2e/fixtures/chat-backend"
import { createChatStub } from "../e2e/support/ChatStub"
import { DEFAULT_CLOUD_API, startLocalServer } from "../src/bun/server"
import { createCloudAuth } from "../src/bun/CloudAuth"
import { parseNativeApiOrigin } from "../src/bun/NativeApiOrigin"
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
  const realToken = realChat ? env.SMITHERS_CLOUD_TOKEN?.trim() : undefined
  if (realChat && !realToken) throw new Error("Real browser chat requires an explicitly supplied SMITHERS_CLOUD_TOKEN")
  const realOrigin = realChat ? parseNativeApiOrigin(env.SMITHERS_CLOUD_API ?? DEFAULT_CLOUD_API).origin : undefined
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
    ...(realChat ? { chatBackend: { origin: realOrigin!, token: realToken! } } : {}),
    cloudMode: realChat ? "hybrid" : "offline",
    // Real chat is a backend turn (`/api/agent/turn`) as the Cloud user that
    // SMITHERS_CLOUD_TOKEN names; the empty keychain never reads a stored login.
    cloudApi: realOrigin ?? null,
    cloudKeychain: {
      read: async () => null,
      write: async () => {},
      remove: async () => {}
    },
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
  const selection = browserTestOptions("", distDir, env)
  const root = await mkdtemp(join(tmpdir(), "smithers-browser-test-"))
  // Retain the owned fixture if startup fails: a partial server startup has
  // not yet handed us its shutdown handle, so deleting underneath it is unsafe.
  const backend = selection.chatBackend === undefined ? await startFixtureChatBackend({ mode: "browser" }) : undefined
  const options = browserTestOptions(root, distDir, env)
  const cloudAuth = selection.chatBackend === undefined ? undefined : await createCloudAuth({
    api: selection.chatBackend.origin, envToken: selection.chatBackend.token, keychain: options.cloudKeychain
  })
  let server: Awaited<ReturnType<typeof startLocalServer>>
  try {
    server = await startLocalServer({ ...options,
      ...(cloudAuth === undefined ? {} : { cloudAuth }),
      chatBackend: selection.chatBackend ?? { origin: backend!.origin, token: backend!.token }
    })
  } catch (error) {
    await cloudAuth?.stop()
    await backend?.stop()
    throw error
  }
  let stopping: Promise<void> | undefined
  return {
    ...server,
    stop: (): Promise<void> => stopping ??= (async () => {
      try { await server.stop() }
      finally { try { await backend?.stop() } finally { await rm(root, { recursive: true, force: true }) } }
    })()
  }
}
