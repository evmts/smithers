// The repository feature's configuration (worker/RepoConfig.ts): Code Storage only when its organization and key are
// set, a key that doesn't import refused without printing it, and the clone's services built from the same settings.
import { Logger as StructuredLogger } from "@smthrs/observability"
import { ConfigProvider, Duration, Effect, Layer, Logger, Option } from "effect"
import { FetchHttpClient } from "effect/http"
import { describe, expect, test } from "vitest"
import * as RepoConfig from "./RepoConfig.ts"

/** A fresh ES256 key, as Code Storage's Keys page hands one out: a PKCS#8 PEM. */
const pem = async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey))
  const base64 = btoa(String.fromCharCode(...der)).replace(/(.{64})/g, "$1\n")
  return `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----\n`
}

type StructuredLog = ReturnType<typeof StructuredLogger.formatStructured.log>

const run = <A, E>(effect: Effect.Effect<A, E, never>, config: Record<string, string>, logs: Array<StructuredLog> = []) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown(config)),
      Effect.provide(Logger.layer([Logger.make((log) => void logs.push(StructuredLogger.formatStructured.log(log)))])),
    ),
  )

const codeStorage = RepoConfig.codeStorage.pipe(Effect.provide(FetchHttpClient.layer))

describe("RepoConfig", () => {
  test("no Code Storage organization or key: nothing clones", async () => {
    expect(await run(codeStorage, {})).toEqual(Option.none())
    expect(await run(codeStorage, { CODE_STORAGE_ORG: "smithers" })).toEqual(Option.none())
    expect(await run(RepoConfig.cloneServices(Layer.empty as never).pipe(Effect.provide(FetchHttpClient.layer)), {}))
      .toEqual(Option.none())
  })

  test("a key that doesn't import is refused and logged by code, never printed", async () => {
    const logs: Array<StructuredLog> = []
    const key = "-----BEGIN PRIVATE KEY-----\nbm90IGEga2V5\n-----END PRIVATE KEY-----\n"
    expect(await run(codeStorage, { CODE_STORAGE_ORG: "smithers", CODE_STORAGE_KEY: key }, logs)).toEqual(Option.none())
    expect(logs.find((log) => log.message === "repo.config")!.annotations).toMatchObject({ errorCode: "invalid_key" })
    expect(JSON.stringify(logs)).not.toContain("bm90IGEga2V5")
  })

  test("with an organization and a key: the client, and the clone's services with the budgets and deadline", async () => {
    const config = { CODE_STORAGE_ORG: "smithers", CODE_STORAGE_KEY: await pem(), REPO_CLONE_DEADLINE: "5 minutes" }
    expect(Option.isSome(await run(codeStorage, config))).toBe(true)
    const services = await run(
      RepoConfig.cloneServices(Layer.empty as never).pipe(Effect.provide(FetchHttpClient.layer)),
      { ...config, REPO_MAX_STORED_GB: "2" },
    )
    expect(Option.isSome(services)).toBe(true)
    const value = Option.getOrThrow(services)
    expect(Duration.toMillis(value.deadline)).toBe(5 * 60_000)
    expect(value.budgets).toEqual({
      maxRepositories: 100,
      maxStoredBytes: 2e9,
      maxReadBytes: 40e9,
      maxRepositoryBytes: 1e9,
      budgetUsd: 20,
    })
    expect(value.upstream.head).toBeTypeOf("function")
  })
})
