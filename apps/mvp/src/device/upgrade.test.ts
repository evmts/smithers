import { Effect, Layer, ManagedRuntime, Option } from "effect"
import { afterEach, expect, test, vi } from "vitest"
import * as TestDatabase from "../../db/TestDatabase.ts"
import { Chat } from "../features/chat/chat"
import { ChatStore } from "../features/chat/store"
import { IssueWrites } from "../features/issues/writes"
import { nodeDevice, openTab, TestChatApi } from "../test/chatApi"
import { deviceFrom, type Fixture, prepare } from "../test/deviceFixture"
import deployed from "./fixtures/7b96f878.json" with { type: "json" }
import { deviceRegistry } from "./registry"

// The deployed build's device, opened by this build's app over the real ChatApi (decision 0021): the leader's
// `device/prepare` brings the store forward first (here, `prepare` on the device's file), then the app finds every
// local row, keeps the stored draft as the composer's, sends the question the old build queued, and
// shows the write it can't send as Not sent.

const runtimes: Array<{ readonly dispose: () => Promise<void> }> = []
afterEach(async () => {
  for (const runtime of runtimes.splice(0).reverse()) await runtime.dispose()
})

const until = (assertion: () => void | Promise<void>) => vi.waitFor(assertion, { timeout: 20_000, interval: 25 })

const fixture = deployed as Fixture
const QUESTION = "6f1c2a3e-0000-4000-8000-000000000001"
const AGENT_WRITE = "c0ffee00-0000-4000-8000-000000000004"

test("the old build's device opens in this build with its draft, its queued question sent, and its writes accounted for", async () => {
  const server = ManagedRuntime.make(TestChatApi.layer.pipe(Layer.provideMerge(TestDatabase.layer("test_device"))))
  runtimes.push(server)
  const api = await server.runPromise(Effect.service(TestChatApi))
  const { outbox, path } = await deviceFrom(fixture)
  await prepare(path, deviceRegistry)
  const host = nodeDevice({ agent: api, file: path, outboxEntries: outbox })
  const runtime = openTab(api, { host })
  runtimes.push(runtime)
  const [chat, store, issues] = await runtime.runPromise(
    Effect.all([Effect.service(Chat), Effect.service(ChatStore), Effect.service(IssueWrites)]),
  )
  store.composerState.tanstack.startSyncImmediate()

  // The draft the old build kept for the home conversation is the composer's draft again.
  await until(() => expect(chat.queries.composer.toArray[0]?.draft).toBe("Half a thought about the release"))

  // The question the old build queued offline reached ChatApi once, under its own id.
  await until(async () =>
    expect((await server.runPromise(api.rows)).filter(({ id }) => id === QUESTION).map(({ text }) => text)).toEqual([
      "What changed in the last deploy?",
    ])
  )

  // The question the server refused before the deploy is still Not sent.
  expect(Option.getOrUndefined(await runtime.runPromise(store.unsent.get("0a1b2c3d-0000-4000-8000-0000000000aa"))))
    .toMatchObject({ text: "A question the server refused", reason: "refused" })

  // The agent's write, which this build can't send as the agent, shows Not sent; nothing of it is lost.
  await until(async () =>
    expect(Option.getOrUndefined(await runtime.runPromise(issues.requested.get(AGENT_WRITE)))).toMatchObject({
      body: "Triaged by the agent.",
      status: "not_sent",
      reason: "not_allowed",
    })
  )
  expect([...outbox.keys()].filter((key) => key.startsWith("parked:"))).toEqual([])

  // The theme the old build stored still paints.
  await until(() => expect(host.painted.at(-1)).toBe("dark"))
}, 60_000)
