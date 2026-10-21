import { Effect, Layer, ManagedRuntime } from "effect"
import { expect, test } from "vitest"
import { Persistence } from "@smthrs/effect-tanstack-db"
import { FlowDispatch } from "../../flows/dispatch"
import { BranchTrackRefused, BranchTrackUnavailable } from "../branch/flows"
import { runAction } from "./actions"
import { CURRENT } from "./rows"
import { HomeStore } from "./store"

// A home opened without the optional feature stores still exposes usable empty live blocks.
test("standalone homes have empty issues, sync, runs, stack and access blocks", async () => {
  const runtime = ManagedRuntime.make(HomeStore.layer.pipe(Layer.provide(Persistence.memory)))
  try {
    const store = await runtime.runPromise(Effect.service(HomeStore))
    expect(await runtime.runPromise(Effect.all([store.items, store.syncs, store.runs, store.noTodos, store.noAccess].map((query) => query.toArray)))).toEqual([[], [], [], [], []])
    expect((await runtime.runPromise(store.current.toArray))[0]?.owner).toBe("")
    await runtime.runPromise(store.homes.insert({ key: "repo@sha", state: "absent", sections: [], contributors: "role", skipped: 0, reason: null }))
    await runtime.runPromise(store.curated.insert({ key: "repo", state: "absent", defaultBranch: "main", sections: [] }))
    expect(await runtime.runPromise(store.homes.get("repo@sha"))).toMatchObject({ value: { state: "absent" } })
    expect(await runtime.runPromise(store.curated.get("repo"))).toMatchObject({ value: { defaultBranch: "main" } })

    await runtime.runPromise(store.files.insert({ key: "repo@sha:README.md", home: "repo@sha", path: "README.md", state: "text", text: "Home" }))
    expect(await runtime.runPromise(store.files.get("repo@sha:README.md"))).toMatchObject({ value: { text: "Home" } })
  } finally {
    await runtime.dispose()
  }
})


test.each([
  [new BranchTrackRefused({ reason: "forbidden" }), "forbidden"],
  [new BranchTrackUnavailable(), "unavailable"],
])("a refused home action clears its running state and keeps the reason (%s)", async (error, reason) => {
  const runtime = ManagedRuntime.make(HomeStore.layer.pipe(Layer.provide(Persistence.memory)))
  try {
    const store = await runtime.runPromise(Effect.service(HomeStore))
    await runtime.runPromise(store.current.update(CURRENT, (row) => {
      row.owner = "acme"; row.name = "widgets"; row.repoId = "repo"
    }))
    const result = await runtime.runPromise(runAction("branch.new", "maya").pipe(
      Effect.provideService(FlowDispatch, { dispatch: () => Effect.succeed({ _tag: "Failed", error }) as never }),
    ))
    expect(result).toBeUndefined()
    expect(await runtime.runPromise(store.current.get(CURRENT))).toMatchObject({ value: { running: [], failure: reason } })
  } finally {
    await runtime.dispose()
  }
})
