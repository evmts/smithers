// What GitHub REST reads of public repositories go out as (worker/github/ReadToken.ts): `GITHUB_TOKEN`, else the App's
// installation token for the deployment's own repository, else none. The App is `GitHub.AppAuth` over the scripted
// GitHub (worker/github/test/scriptedGitHub.ts) on the `HttpClient` seam; nothing intercepts a request.
import { ConfigProvider, Effect, Option, Redacted } from "effect"
import { describe, expect, test, vi } from "vitest"
import * as ReadToken from "./ReadToken.ts"
import { APP_ID, appKey, INSTALLATION_ID, SCRIPTED_API, scriptedApp, scriptedGitHub } from "./test/scriptedGitHub.ts"

const value = (token: Option.Option<Redacted.Redacted<string>>) => Option.getOrUndefined(Option.map(token, Redacted.value))

describe("ReadToken.fromApp", () => {
  test("mints the App's token for the deployment's repository with metadata: read only, and keeps it while it lasts", async () => {
    const github = scriptedGitHub("acme", "widgets")
    const token = await Effect.runPromise(ReadToken.fromApp(await Effect.runPromise(scriptedApp(github, await appKey())), github))
    expect(value(await Effect.runPromise(token))).toBe("ghs_scripted_1")
    expect(value(await Effect.runPromise(token))).toBe("ghs_scripted_1")
    expect(github.minted.map((minted) => minted.body)).toEqual([
      { repositories: ["widgets"], permissions: { metadata: "read" } },
    ])
  })

  test("a token within five minutes of its expiry is minted again", async () => {
    const github = scriptedGitHub("acme", "widgets")
    // GitHub's clock is 56 minutes behind: what it mints expires in 4.
    github.now = Date.now() - 56 * 60 * 1000
    const token = await Effect.runPromise(ReadToken.fromApp(await Effect.runPromise(scriptedApp(github, await appKey())), github))
    expect(value(await Effect.runPromise(token))).toBe("ghs_scripted_1")
    github.now = Date.now()
    expect(value(await Effect.runPromise(token))).toBe("ghs_scripted_2")
    expect(value(await Effect.runPromise(token))).toBe("ghs_scripted_2")
  })

  test("concurrent first reads share one installation token mint", async () => {
    const github = scriptedGitHub("acme", "widgets")
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    github.faults.push({
      match: (method, path) => method === "POST" && path === `/app/installations/${INSTALLATION_ID}/access_tokens`,
      hold: () => held,
    })
    const token = await Effect.runPromise(ReadToken.fromApp(await Effect.runPromise(scriptedApp(github, await appKey())), github))
    const first = Effect.runPromise(token)
    await vi.waitFor(() => expect(github.calls.some((call) => call.method === "POST" && call.path.endsWith("/access_tokens"))).toBe(true))
    const second = Effect.runPromise(token)
    await new Promise((resolve) => setTimeout(resolve, 20))
    release()
    expect((await Promise.all([first, second])).map(value)).toEqual(["ghs_scripted_1", "ghs_scripted_1"])
    expect(github.minted).toHaveLength(1)
  })

  test("an App GitHub won't mint for reads anonymously this once, and the next read mints again", async () => {
    const github = scriptedGitHub("acme", "widgets")
    github.installed = false
    const token = await Effect.runPromise(ReadToken.fromApp(await Effect.runPromise(scriptedApp(github, await appKey())), github))
    expect(await Effect.runPromise(token)).toEqual(Option.none())
    github.installed = true
    expect(value(await Effect.runPromise(token))).toBe("ghs_scripted_1")
  })
})

describe("ReadToken.fromConfig", () => {
  const read = async (config: Record<string, string>) => {
    const github = scriptedGitHub("acme", "widgets")
    const token = await Effect.runPromise(
      ReadToken.fromConfig.pipe(
        Effect.flatMap((made) => made),
        Effect.provide(github.layer),
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(config))),
      ),
    )
    return { token: value(token), calls: github.calls.length }
  }

  test("the App's token for GITHUB_REPOSITORY when the App is configured and GITHUB_TOKEN isn't", async () => {
    // Before, no GITHUB_TOKEN meant anonymous: 60 calls an hour shared with every Worker on Cloudflare's addresses.
    const app = {
      GITHUB_APP_ID: APP_ID,
      GITHUB_APP_PRIVATE_KEY: Redacted.value(await appKey()),
      GITHUB_API_URL: SCRIPTED_API,
      GITHUB_REPOSITORY: "acme/widgets",
    }
    expect(await read(app)).toEqual({ token: "ghs_scripted_1", calls: 2 })
    expect(await read({ ...app, GITHUB_TOKEN: "   " })).toEqual({ token: "ghs_scripted_1", calls: 2 })
    // GITHUB_TOKEN, when set, wins, and GitHub isn't asked.
    expect(await read({ ...app, GITHUB_TOKEN: "ghp_bot" })).toEqual({ token: "ghp_bot", calls: 0 })
  })

  test("neither, an App key that doesn't import, or an App configuration that doesn't read: anonymous", async () => {
    expect(await read({})).toEqual({ token: undefined, calls: 0 })
    expect(await read({ GITHUB_APP_ID: APP_ID, GITHUB_APP_PRIVATE_KEY: "not a key", GITHUB_API_URL: SCRIPTED_API }))
      .toEqual({ token: undefined, calls: 0 })
    expect(await read({ GITHUB_APP_ID: APP_ID, GITHUB_APP_PRIVATE_KEY: "not a key", GITHUB_API_URL: "not a url" }))
      .toEqual({ token: undefined, calls: 0 })
  })
})
