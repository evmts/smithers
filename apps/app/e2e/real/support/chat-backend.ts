import { customModelCredentials, modelCredentialEnvName, ModelCredentialResultSchema, MODEL_CREDENTIAL_ENV_PREFIX } from "@smthrs/rpc/ConfiguredModel"
import { startFullBackend } from "../../fixtures/full-backend"
import { parseNativeApiOrigin } from "../../../src/bun/NativeApiOrigin"
import { DEFAULT_CLOUD_API } from "../../../src/bun/server"
import type { LocalServerOptions } from "../../../src/bun/server"

/** Per-host credential storage; real authentication never reads the operator's keychain. */
export const realHostCredentialOptions = (
  env: Readonly<Record<string, string | undefined>> = process.env
): Pick<LocalServerOptions, "env" | "cloudKeychain" | "modelKeychain"> => {
  const values = new Map<string, string>()
  const keychain = {
    read: async (service: string, account: string) => values.get(`${service}\0${account}`) ?? null,
    write: async (service: string, account: string, value: string) => { values.set(`${service}\0${account}`, value) },
    remove: async (service: string, account: string) => { values.delete(`${service}\0${account}`) }
  }
  return {
    env: Object.fromEntries(Object.entries(env).filter(
      (entry): entry is [string, string] => entry[0].startsWith(MODEL_CREDENTIAL_ENV_PREFIX) && entry[1] !== undefined
    )),
    cloudKeychain: keychain,
    modelKeychain: keychain
  }
}

/** Select an explicit Cloud authority, or own the public backend for local model scenarios. */
export const startRealChatBackend = async (env: Readonly<Record<string, string | undefined>> = process.env) => {
  const token = env.SMITHERS_CLOUD_TOKEN?.trim()
  if (token) return {
    origin: parseNativeApiOrigin(env.SMITHERS_CLOUD_API ?? DEFAULT_CLOUD_API).origin,
    token,
    kind: "remote" as const,
    stop: async (): Promise<void> => {}
  }

  const backend = await startFullBackend()
  let stopping: Promise<void> | undefined
  const stop = () => stopping ??= backend.stop()
  try {
    // Only operator-declared, origin-pinned names reach the owned authority.
    // Never enroll these fixture credentials into a selected remote backend.
    for (const { name, origin } of customModelCredentials(env)) {
      const value = env[modelCredentialEnvName(name)]?.trim()
      if (!value) continue
      const response = await backend.http("/api/model/credential", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "enroll", requestId: crypto.randomUUID(), name, origin, value })
      })
      if (!response.ok) throw new Error(`Real model credential enrollment failed (${response.status}).`)
      const result = ModelCredentialResultSchema.safeParse(await response.json())
      if (!result.success || !result.data.ok) throw new Error("Real model credential enrollment was not committed.")
    }
    // No default model is invented. Grounded/tool-using live chat still needs
    // its explicitly selected real authority and provider configuration.
    return { origin: backend.origin, token: backend.token, kind: "owned" as const, stop }
  } catch (error) {
    try { await stop() }
    catch (cleanup) { throw new AggregateError([error, cleanup], "Real chat startup and cleanup failed") }
    throw error
  }
}
