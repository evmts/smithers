// The engine worker's line to its tab (src/flows/tabPort.ts), over a real `MessageChannel`: one port is the worker's
// global scope, the other the tab's `Worker`.
import { Effect, Exit, ManagedRuntime, type Schema } from "effect"
import { afterEach, describe, expect, test } from "vitest"
import { answer, type Handlers, TabCallFailed, TabPort } from "./tabPort"

const channels: Array<MessageChannel> = []
const runtimes: Array<ManagedRuntime.ManagedRuntime<TabPort, never>> = []
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.dispose()
  for (const channel of channels.splice(0)) {
    channel.port1.close()
    channel.port2.close()
  }
})

/** A worker and its tab on one channel; the tab answers with `handlers` unless `answered` is false. */
const open = async (handlers: Handlers, options: { readonly within?: number; readonly answered?: boolean } = {}) => {
  const channel = new MessageChannel()
  channels.push(channel)
  channel.port1.start()
  channel.port2.start()
  const stop = options.answered === false ? () => {} : await Effect.runPromise(answer(channel.port2, handlers))
  const runtime = ManagedRuntime.make(TabPort.layer(channel.port1, options.within ?? 2_000))
  runtimes.push(runtime)
  const call = (method: string, input: Schema.Json) =>
    runtime.runPromise(Effect.exit(Effect.flatMap(TabPort, (port) => port.call(method, input))))
  return { channel, call, stop }
}

describe("TabPort", () => {
  test("calls the tab's handler with its input and answers with its output", async () => {
    const seen: Array<Schema.Json> = []
    const port = await open({ "app/echo": (input) => Effect.sync(() => (seen.push(input), { echoed: input })) })

    const exit = await port.call("app/echo", { mode: "dark" })

    expect(exit).toEqual(Exit.succeed({ echoed: { mode: "dark" } }))
    expect(seen).toEqual([{ mode: "dark" }])
  })

  test("a handler's failure is refused by that alone, a method the tab lacks is unknown, and silence times out", async () => {
    const port = await open({ "app/fail": () => Effect.fail(new Error("the tab's own words")) })
    const silent = await open({}, { answered: false, within: 50 })

    expect(await port.call("app/fail", null)).toEqual(
      Exit.fail(new TabCallFailed({ method: "app/fail", reason: "refused" })),
    )
    expect(await port.call("app/missing", null)).toEqual(
      Exit.fail(new TabCallFailed({ method: "app/missing", reason: "unknown_method" })),
    )
    expect(await silent.call("app/echo", null)).toEqual(
      Exit.fail(new TabCallFailed({ method: "app/echo", reason: "timeout" })),
    )
  })

  test("a handler's null answer arrives as null, and the tab stops answering once stopped", async () => {
    const port = await open({ "app/set": () => Effect.succeed(null) }, { within: 50 })

    const answered = await port.call("app/set", null)
    port.stop()
    const unanswered = await port.call("app/set", null)

    expect(answered).toEqual(Exit.succeed(null))
    expect(unanswered).toEqual(Exit.fail(new TabCallFailed({ method: "app/set", reason: "timeout" })))
  })

  test("ignores messages that aren't calls or replies, and replies nobody waits for", async () => {
    const port = await open({ "app/set": () => Effect.succeed(null) })
    port.channel.port2.postMessage({ kind: "smithers/tab-reply", id: "nobody", ok: true })
    port.channel.port2.postMessage("noise")
    port.channel.port1.postMessage({ kind: "something else" })

    expect(await port.call("app/set", null)).toEqual(Exit.succeed(null))
  })
})
