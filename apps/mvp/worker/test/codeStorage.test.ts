import { CodeStorage } from "@smthrs/effect-code-storage"
import { Effect } from "effect"
import { expect, test } from "vitest"
import { scripted } from "./codeStorage.ts"

test("scripted deletion returns void, removes only its repository and reports missing repositories", async () => {
  const provider = scripted()
  await Effect.runPromise(Effect.gen(function* () {
    const client = yield* CodeStorage.CodeStorage
    for (const name of ["deleted", "kept"]) {
      yield* client.createRepo({ name, github: { owner: "octocat", name: "Spoon-Knife" } })
    }
    expect(yield* client.deleteRepo("deleted")).toBeUndefined()
    expect(provider.mirrors.has("deleted")).toBe(false)
    expect(provider.mirrors.has("kept")).toBe(true)
    for (const name of ["deleted", "absent"]) {
      expect(yield* Effect.flip(client.deleteRepo(name))).toMatchObject({
        operation: "deleteRepo", code: "repository_not_found", status: 404,
      })
    }
  }).pipe(Effect.provideService(CodeStorage.CodeStorage, provider.client)))
  expect(provider.calls).toEqual([
    "createRepo:deleted", "createRepo:kept", "deleteRepo:deleted", "deleteRepo:deleted", "deleteRepo:absent",
  ])
})

test("scripted deletion records injected failures, preserves the repository and recovers on the next call", async () => {
  const provider = scripted()
  const failure = provider.error("deleteRepo", "rate_limited", 429, { retryAfterMillis: 1000 })
  provider.fail("deleteRepo", failure)
  await Effect.runPromise(Effect.gen(function* () {
    const client = yield* CodeStorage.CodeStorage
    yield* client.createRepo({ name: "repo", github: { owner: "octocat", name: "Spoon-Knife" } })
    expect(yield* Effect.flip(client.deleteRepo("repo"))).toBe(failure)
    expect(provider.mirrors.has("repo")).toBe(true)
    expect(yield* client.deleteRepo("repo")).toBeUndefined()
    expect(provider.mirrors.has("repo")).toBe(false)
  }).pipe(Effect.provideService(CodeStorage.CodeStorage, provider.client)))
  expect(provider.calls).toEqual(["createRepo:repo", "deleteRepo:repo", "deleteRepo:repo"])
})
