import { ConfigProvider, Effect, Layer, Schedule } from "effect"
import { FetchHttpClient } from "effect/http"
import { describe, expect, test } from "vitest"
import { CodeStorage, GitRemote } from "../src/index.ts"

// The real services. GitHub's smart HTTP needs no credential, so its check runs whenever github.com answers. The Code
// Storage round trip needs an organization: CODE_STORAGE_ORG and CODE_STORAGE_KEY (and optionally
// CODE_STORAGE_API_URL). Each skips, saying what is missing, only when that service or credential is absent.

const REMOTE = "https://github.com/octocat/Spoon-Knife.git"

const githubUp = await fetch(`${REMOTE}/info/refs?service=git-upload-pack`, { signal: AbortSignal.timeout(5_000) })
  .then(
    () => true,
    (error: unknown) => {
      console.warn(`The live GitHub check is skipped: github.com did not answer (${(error as Error).name}).`)
      return false
    }
  )

const missing = ["CODE_STORAGE_ORG", "CODE_STORAGE_KEY"].filter((name) => process.env[name] === undefined)
if (missing.length > 0) console.warn(`The live Code Storage round trip is skipped: ${missing.join(" and ")} unset.`)

describe("live", () => {
  test.skipIf(!githubUp)("reads a public GitHub repository's HEAD with no credential", async () => {
    const head = await Effect.runPromise(GitRemote.head(REMOTE).pipe(Effect.provide(FetchHttpClient.layer)))
    expect(head.branch).toBe("main")
    expect(head.sha).toMatch(/^[0-9a-f]{40}$/)
  })

  test.skipIf(missing.length > 0 || !githubUp)(
    "mirrors a public GitHub repository, waits for its sync, then lists and reads it, and lists its branches and tags",
    async () => {
      const program = Effect.gen(function*() {
        const head = yield* GitRemote.head(REMOTE)
        const client = yield* CodeStorage.CodeStorage
        const name = "smthrs-live/github/octocat/spoon-knife"
        yield* client.createRepo({
          name,
          defaultBranch: head.branch,
          github: { owner: "octocat", name: "Spoon-Knife" }
        })
        yield* client.pullUpstream(name).pipe(
          Effect.catchIf((error) => error.code === "sync_in_progress", () => Effect.void)
        )
        const commits = yield* client.listCommits(name, { ref: head.branch, limit: 1 }).pipe(
          Effect.retry({
            while: (error) => error.code === "sync_in_progress",
            schedule: Schedule.spaced("2 seconds"),
            times: 60
          })
        )
        const files = yield* client.listFiles(name, { ref: commits.commits[0]!.sha, recursive: true })
        const readme = yield* client.readFile(name, {
          path: "README.md",
          ref: commits.commits[0]!.sha,
          maxBytes: 512 * 1024
        })
        const branches = yield* client.listBranches(name, { limit: 100 })
        const tags = yield* client.listTags(name, { limit: 100 })
        return {
          head,
          sha: commits.commits[0]!.sha,
          paths: files.paths,
          readme: new TextDecoder().decode(readme.bytes),
          branches: branches.branches,
          tags: tags.tags
        }
      })
      const result = await Effect.runPromise(program.pipe(
        Effect.provide(Layer.provideMerge(CodeStorage.CodeStorage.layerConfig, FetchHttpClient.layer)),
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv()))
      ))
      expect(result.sha).toBe(result.head.sha)
      expect(result.paths).toContain("README.md")
      expect(result.readme.length).toBeGreaterThan(0)
      // The mirror carries every branch, the default one at the head GitHub reported.
      expect(result.branches.find((branch) => branch.name === result.head.branch)?.sha).toBe(result.head.sha)
      expect(result.branches.length).toBeGreaterThan(1)
      expect(result.tags.every((tag) => /^[0-9a-f]{40}$/.test(tag.sha))).toBe(true)
    },
    180_000
  )
})
