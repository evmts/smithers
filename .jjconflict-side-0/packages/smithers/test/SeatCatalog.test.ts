/**
 * The seats a native host offers the routing graph for an `auto` run: every
 * graph seat whose provider the seat resolver holds a credential for, a Claude
 * seat on a key or on Claude Code, and never Jev.
 */
import * as SeatRouter from "@smthrs/agent/SeatRouter"
import { Effect } from "effect"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import * as NodeControl from "../src/NodeControl.ts"
import * as Providers from "../src/Providers.ts"

/** The login file `codex login` writes for a ChatGPT subscription; the token is fabricated. */
const codexLogin = JSON.stringify({
  auth_mode: "chatgpt",
  tokens: { access_token: "fake-access", refresh_token: "fake-refresh", account_id: "acct-fake" }
})

const ids = (
  environment: Readonly<Record<string, string | undefined>>,
  files: Readonly<Record<string, string>> = {}
): Promise<ReadonlyArray<string>> =>
  NodeControl.seatCandidates({ environment, homeDirectory: "/home/op", readFile: (path) => files[path] })

describe("NodeControl.seatCandidates", () => {
  it("offers the Claude seats for an Anthropic key", async () => {
    expect(await ids({ ANTHROPIC_API_KEY: "sk-ant-secret-value" })).toEqual(["opus", "fable", "sonnet"])
  })

  it("offers the Claude seats for a Claude subscription signed in to Claude Code, never as claude-code seats", async () => {
    const login = { executable: "/bin/claude", loggedIn: true, authMethod: "claude.ai", subscriptionType: "max" }
    const candidates = (environment: Readonly<Record<string, string | undefined>>, signedIn = login) =>
      NodeControl.seatCandidates({
        environment,
        homeDirectory: "/home/op",
        readFile: () => undefined,
        claudeCode: () => signedIn
      })
    expect(await candidates({})).toEqual(["opus", "fable", "sonnet"])
    expect(await candidates({ ANTHROPIC_API_KEY: "a" })).toEqual(["opus", "fable", "sonnet"])
    expect(await candidates({}, { ...login, authMethod: "api_key" })).toEqual([])
    // A subscription token in the environment is Claude Code's, never a route of ours.
    expect(await ids({ CLAUDE_CODE_OAUTH_TOKEN: "oauth", ANTHROPIC_AUTH_TOKEN: "token" })).toEqual([])
  })

  it("offers the OpenAI aliases for the Codex subscription the resolver signs with", async () => {
    const signedIn = { "/codex/auth.json": codexLogin }
    const chatgpt = { CODEX_HOME: "/codex", SMITHERS_OPENAI_AUTH: "chatgpt" }
    expect(await ids(chatgpt, signedIn)).toEqual(["luna", "sol"])
    // The default login directory is read when CODEX_HOME names none.
    expect(await ids({ SMITHERS_OPENAI_AUTH: "chatgpt" }, { "/home/op/.codex/auth.json": codexLogin }))
      .toEqual(["luna", "sol"])
    // Without the mode the resolver signs `openai:` seats with OPENAI_API_KEY.
    expect(await ids({ CODEX_HOME: "/codex" }, signedIn)).toEqual([])
    // No login file, an API-key login, or a file that is not JSON offers nothing.
    expect(await ids(chatgpt)).toEqual([])
    expect(await ids(chatgpt, { "/codex/auth.json": JSON.stringify({ OPENAI_API_KEY: "sk-fake" }) })).toEqual([])
    expect(await ids(chatgpt, { "/codex/auth.json": "{broken" })).toEqual([])
  })

  it("offers a provider's aliases through an account pool configured for its route, only with the pool credential", async () => {
    const pool = {
      SMITHERS_ACCOUNT_POOL_URL: "https://pool.example/provider-pool",
      SMITHERS_ACCOUNT_POOL_PROVIDERS: "chatgpt,anthropic"
    }
    // The pool is asked which routes have accounts when a seat resolves, so a
    // configured route is offered without a key of the provider's own: the
    // anthropic route serves connected Anthropic API keys.
    expect(await ids({ ...pool, SMITHERS_ACCOUNT_POOL_KEY: "pool-credential" })).toEqual(
      SeatRouter.seats.filter((id) => ["opus", "fable", "sonnet", "luna", "sol"].includes(id))
    )
    expect(
      await ids({ ...pool, SMITHERS_ACCOUNT_POOL_KEY: "pool-credential", SMITHERS_ACCOUNT_POOL_PROVIDERS: "chatgpt" })
    )
      .toEqual(["luna", "sol"])
    // The configured subscription pool takes precedence over stale API-key mode.
    expect(
      await ids({
        ...pool,
        SMITHERS_ACCOUNT_POOL_KEY: "pool-credential",
        SMITHERS_ACCOUNT_POOL_PROVIDERS: "chatgpt",
        SMITHERS_OPENAI_AUTH: "api-key"
      })
    )
      .toEqual([
        "luna",
        "sol"
      ])
    // A route the pool is not offered keeps the host's own key.
    expect(
      await ids({
        ...pool,
        SMITHERS_ACCOUNT_POOL_KEY: "pool-credential",
        SMITHERS_ACCOUNT_POOL_PROVIDERS: "anthropic",
        OPENAI_API_KEY: "repository-key"
      })
    ).toEqual(SeatRouter.seats.filter((id) => ["opus", "fable", "sonnet", "luna", "sol"].includes(id)))
    expect(await ids(pool)).toEqual([])
  })

  it("offers the OpenAI aliases behind the model proxy only with its credential", async () => {
    const proxied = { SMITHERS_OPENAI_AUTH: "chatgpt", SMITHERS_MODEL_PROXY_URL: "https://proxy.example" }
    expect(await ids({ ...proxied, OPENAI_API_KEY: "proxy-credential" })).toEqual(["luna", "sol"])
    expect(await ids(proxied)).toEqual([])
  })

  it("offers the OpenAI aliases for an API key in api-key mode only", async () => {
    expect(await ids({ OPENAI_API_KEY: "sk" })).toEqual(["luna", "sol"])
    expect(await ids({ OPENAI_API_KEY: "sk", SMITHERS_OPENAI_AUTH: "api-key" })).toEqual(["luna", "sol"])
    expect(await ids({ OPENAI_API_KEY: "sk", SMITHERS_OPENAI_AUTH: "bogus" })).toEqual([])
  })

  it("offers no seat off the routing graph, and nothing on a bare machine", async () => {
    expect(await ids({ CEREBRAS_API_KEY: "c", GEMINI_API_KEY: "g" })).toEqual([])
    expect(await ids({})).toEqual([])
  })

  it("offers every graph seat, and never Jev, when every provider has a key", async () => {
    const all = await ids({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o", MOONSHOT_API_KEY: "m", CEREBRAS_API_KEY: "c" })
    expect(all).toEqual(SeatRouter.seats)
    expect(all.some((id) => Providers.isDecisionSeat(id) || Providers.isDecisionSeat(Providers.expandSeat(id)))).toBe(
      false
    )
  })
})

describe("NodeControl.layerSeatCatalog", () => {
  const read = (environment: Readonly<Record<string, string | undefined>>) =>
    Effect.runPromise(
      Effect.gen(function*() {
        const catalog = yield* SeatRouter.Catalog
        return { candidates: yield* catalog.candidates, variants: catalog.variants }
      }).pipe(Effect.provide(NodeControl.layerSeatCatalog(environment)))
    )

  it("reads the Codex login from disk afresh, with the default variants", async () => {
    const home = mkdtempSync(join(tmpdir(), "seat-catalog-"))
    try {
      const missing = await read({ SMITHERS_OPENAI_AUTH: "api-key", CODEX_HOME: home, ANTHROPIC_API_KEY: "a" })
      expect(missing.candidates).toEqual(["opus", "fable", "sonnet"])
      expect(missing.variants).toBe(SeatRouter.defaultVariants)
      expect((await read({ SMITHERS_OPENAI_AUTH: "chatgpt", CODEX_HOME: home })).candidates).toEqual([])
      // `codex login` after startup counts: the file is read each time a run is routed.
      writeFileSync(join(home, "auth.json"), codexLogin, { mode: 0o600 })
      expect((await read({ SMITHERS_OPENAI_AUTH: "chatgpt", CODEX_HOME: home })).candidates).toEqual(["luna", "sol"])
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
