import { ShapeSource } from "@smthrs/effect-electric"
import { Effect, Layer, ManagedRuntime } from "effect"
import { expect, test, vi } from "vitest"
import * as TestDatabase from "../../db/TestDatabase"
import { Chat } from "../features/chat/chat"
import { openTab, TestChatApi } from "./chatApi"

// A scratch database is a separate deployment, including Electric's URL-keyed replay state. Simulated tabs also need separate cache keys because real
// tabs have separate JavaScript realms; no fixture or tab may inherit another realm's cursor or handle.
test("independent ChatApis and tabs sync independently, including a reopened API", async () => {
  const servers = [0, 1].map(() => ManagedRuntime.make(
    TestChatApi.layer.pipe(Layer.provideMerge(TestDatabase.layer("test_shape_isolation"))),
  ))
  const tabs: Array<{ dispose: () => Promise<void> }> = []
  const origins: Array<Set<string>> = []
  const namespaces: Array<string | undefined> = []
  const tabOn = (api: TestChatApi["Service"]) => {
    const seen = new Set<string>()
    origins.push(seen)
    const tab = openTab({ ...api, fetch: (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.pathname === "/api/shapes/messages") seen.add(url.origin)
      return api.fetch(input, init)
    } }, { answers: false })
    tabs.push(tab)
    return tab
  }
  try {
    const [first, second] = await Promise.all(servers.map((server) => server.runPromise(Effect.service(TestChatApi))))
    expect(first!.origin).toBe(second!.origin)
    for (const [index, api] of [first!, second!].entries()) {
      await servers[index]!.runPromise(api.askElsewhere(`fixture ${index}`))
      const tab = tabOn(api)
      namespaces.push((await tab.runPromise(Effect.service(ShapeSource.ShapeSource))).cacheNamespace)
      const chat = await tab.runPromise(Effect.service(Chat))
      chat.queries.conversation.startSyncImmediate()
      await vi.waitFor(() => expect(chat.queries.conversation.toArray.filter((row) => row.role === "user")
        .map((row) => row.text)).toEqual([`fixture ${index}`]), { timeout: 15_000 })
    }
    const reloaded = tabOn(first!)
    namespaces.push((await reloaded.runPromise(Effect.service(ShapeSource.ShapeSource))).cacheNamespace)
    const chat = await reloaded.runPromise(Effect.service(Chat))
    chat.queries.conversation.startSyncImmediate()
    await vi.waitFor(() => expect(chat.queries.conversation.toArray.filter((row) => row.role === "user")
      .map((row) => row.text)).toEqual(["fixture 0"]), { timeout: 15_000 })
    expect(origins.map((seen) => seen.size)).toEqual([1, 1, 1])
    expect(new Set(origins.flatMap((seen) => [...seen]))).toEqual(new Set([first!.origin]))
    expect(namespaces.every((namespace) => typeof namespace === "string")).toBe(true)
    expect(new Set(namespaces).size).toBe(3)
  } finally {
    for (const tab of tabs.reverse()) await tab.dispose()
    for (const server of servers.reverse()) await server.dispose()
  }
})
