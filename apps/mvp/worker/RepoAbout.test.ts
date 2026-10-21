// What GitHub says of a repository (worker/RepoAbout.ts), read through `@smthrs/integrations`' real client over a
// scripted GitHub (worker/test/githubRest.ts): GitHub's odd shapes, each part GitHub may leave out, and the settings.
// RepoApi's route over the same read is in worker/RepoApi.test.ts.
import { ConfigProvider, Duration, Effect, Layer, Option, Redacted } from "effect"
import { FetchHttpClient } from "effect/http"
import { describe, expect, test } from "vitest"
import * as RepoAbout from "./RepoAbout.ts"
import { GITHUB_API, scriptedGitHub, spoonKnife } from "./test/githubRest.ts"

const SLUG = "smithers"

/** The about read for `owner/name` over `github`, through the client the route builds. */
const readOver = (github: ReturnType<typeof scriptedGitHub>, owner = "octocat", name = "Spoon-Knife") =>
  Effect.runPromise(
    Effect.flatMap(
      RepoAbout.client({ token: Option.none(), apiBaseUrl: GITHUB_API, appSlug: SLUG, freshFor: Duration.hours(1) }),
      (client) => Effect.result(RepoAbout.read(client, owner, name, SLUG)),
    ).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provide(Layer.succeed(FetchHttpClient.Fetch, ((input: RequestInfo | URL, init?: RequestInit) =>
        github.fetch(new Request(input, init))) as typeof globalThis.fetch)),
    ),
  )

const ok = async (github: ReturnType<typeof scriptedGitHub>, owner?: string, name?: string) => {
  const result = await readOver(github, owner, name)
  if (result._tag === "Failure") throw new Error(`refused ${result.failure.code}`)
  return result.success
}

describe("RepoAbout.read", () => {
  test("GitHub's odd shapes: a commit by an email, a README not in base64 or not base64, an unreadable newest commit", async () => {
    const github = scriptedGitHub()
    github.publish("octocat", "Spoon-Knife", spoonKnife({
      commits: [{ sha: "a".repeat(40), message: "m", name: "Mona", date: null, login: null }],
      watchers: undefined as unknown as number,
      languages: { HTML: 10, CSS: 10, Empty: 0 },
      release: { tag: "v2", name: "  ", publishedAt: "2026-10-01T00:00:00Z" },
    }))
    const about = await ok(github)
    // No login: the commit's own author name; no date: none.
    expect(about.head).toEqual({ sha: "a".repeat(40), message: "m", author: "Mona", at: "" })
    // Ties in size sort by name; empty languages are left out.
    expect(about.languages).toEqual([{ name: "CSS", bytes: 10 }, { name: "HTML", bytes: 10 }])
    expect(about.release).toEqual({ tag: "v2", name: null, publishedAt: "2026-10-01T00:00:00Z" })
    github.answer("/readme", { path: "README.md", size: 3, encoding: "utf-8", content: "abc" })
    expect((await ok(github)).readme).toBeNull()
    github.answer("/readme", { path: "README.md", size: 3, encoding: "base64", content: "@@@not base64@@@" })
    expect((await ok(github)).readme).toBeNull()
    github.answer("/readme", { path: "README.md", size: 3, encoding: "base64" })
    expect((await ok(github)).readme).toBeNull()
    github.answer("/commits", [{ sha: 1 }])
    expect((await ok(github)).head).toBeNull()
    github.answer("/commits", [{ sha: "b".repeat(40), commit: { message: "x", author: null }, author: null }])
    expect((await ok(github)).head).toEqual({ sha: "b".repeat(40), message: "x", author: "", at: "" })
    github.clear()
    // A repository GitHub sends with none of its optional fields: nothing invented.
    github.answer("", {
      full_name: "octocat/Bare",
      stargazers_count: 1,
      forks_count: 2,
      watchers_count: 3,
      default_branch: "main",
    })
    expect(await ok(github)).toMatchObject({
      name: "octocat/Bare",
      description: null,
      homepage: null,
      topics: [],
      watchers: 3,
      license: null,
      archived: false,
    })
  })

  test("parts GitHub doesn't give are left out: no README, lists it won't count, a bare release, odd entries", async () => {
    const github = scriptedGitHub()
    github.publish("octocat", "Spoon-Knife", spoonKnife({
      readme: null,
      root: [{ name: "vendor", type: "submodule" }, { name: "x", type: "unknown" }, { name: "link", type: "symlink" }],
    }))
    for (const list of ["/releases", "/contributors", "/commits", "/branches", "/tags"]) github.fail(list, 404)
    github.answer("/releases/latest", { tag_name: "v3", name: null })
    expect(await ok(github)).toMatchObject({
      readme: null,
      release: { tag: "v3", name: null, publishedAt: null },
      releases: null,
      contributors: [],
      contributorCount: null,
      commits: null,
      branches: null,
      tags: null,
      head: null,
      // A submodule is a folder, a symlink a file; a type GitHub may add later isn't shown.
      root: [{ name: "vendor", kind: "dir" }, { name: "link", kind: "file" }],
    })
  })

  test("a name GitHub couldn't have is not found before any request", async () => {
    const github = scriptedGitHub()
    const result = await readOver(github, "octo_ca_t", "x")
    expect(result._tag === "Failure" && result.failure.code).toBe("not_found")
    expect(github.calls).toEqual([])
  })

  test("the settings: GitHub's token only when set and not blank, the API URL, the App and the window", async () => {
    const read = (values: Record<string, string>) =>
      Effect.runPromise(RepoAbout.settings.pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(values)))))
    const defaults = await read({})
    expect(defaults).toEqual({
      token: Option.none(),
      apiBaseUrl: "https://api.github.com",
      appSlug: "smithers",
      freshFor: Duration.minutes(60),
    })
    expect((await read({ GITHUB_TOKEN: "   " })).token).toEqual(Option.none())
    const set = await read({
      GITHUB_TOKEN: "ghs_token",
      GITHUB_API_URL: "https://ghe.example/api/v3",
      GITHUB_APP_SLUG: "smithers-dev",
      REPO_ABOUT_FRESH_MINUTES: "5",
    })
    expect(Option.map(set.token, Redacted.value)).toEqual(Option.some("ghs_token"))
    expect([set.apiBaseUrl, set.appSlug, Duration.toMinutes(set.freshFor)]).toEqual(["https://ghe.example/api/v3", "smithers-dev", 5])
    await expect(read({ GITHUB_APP_SLUG: "Not A Slug" })).rejects.toBeDefined()
    // A client builds with the token as its credential, and without one.
    for (const settings of [set, defaults]) {
      const client = await Effect.runPromise(RepoAbout.client(settings).pipe(Effect.provide(FetchHttpClient.layer)))
      expect(Object.keys(client).sort()).toEqual(["count", "paginate", "request"])
    }
  })

  test("the window: one key and the seconds left in it, for any moment", () => {
    const hour = Duration.hours(1)
    expect(RepoAbout.window(0, hour)).toEqual({ bucket: "0", maxAgeSeconds: 3600 })
    expect(RepoAbout.window(3_599_500, hour)).toEqual({ bucket: "0", maxAgeSeconds: 1 })
    expect(RepoAbout.window(3_600_000 + 60_000, hour)).toEqual({ bucket: "1", maxAgeSeconds: 3540 })
  })
})
