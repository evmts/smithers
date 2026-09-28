import { testRender } from "@opentui/react/test-utils"
import * as AgentEvent from "@smthrs/harness/AgentEvent"
import * as ModelRequest from "@smthrs/model/ModelRequest"
import { afterEach, beforeEach, expect, test } from "bun:test"
import { Effect } from "effect"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setImmediate } from "node:timers/promises"
import { act } from "react"
import { App } from "../src/app.tsx"
import type * as Host from "../src/host.ts"
import type * as Monitors from "../src/monitors.ts"
import * as Session from "../src/session.ts"
import * as Theme from "../src/theme.ts"

// App boundary units with native headless rendering and real session storage.
// Only Host execution is controlled; no provider, shell or live agent runs.
let root = ""
let cwd = ""
let previousRoot: string | undefined
let previousTheme = Theme.activeTheme()
let setup: Awaited<ReturnType<typeof testRender>> | undefined
let host: Host.Host
let judges: Array<{ input: Monitors.Judged; gate: ReturnType<typeof Promise.withResolvers<boolean>> }> = []
let compositions: Array<{ input: Monitors.Judged; gate: ReturnType<typeof Promise.withResolvers<string>> }> = []
const checkpoint = async (condition: () => boolean) => {
  const deadline = Date.now() + 6000
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Monitor checkpoint did not arrive")
    await setImmediate()
    await render()
  }
}
let turns: Array<{
  input: Host.TurnInput
  done: ReturnType<typeof Promise.withResolvers<Host.Outcome>>
  admitted: ReadonlyArray<Session.Record>
  cancelled: number
}> = []
const records = () => Session.list(cwd).flatMap((summary) => Session.load(summary.file))
const tabs = () => records().filter((record) => record.type === "tab")
const frame = () => setup!.captureCharFrame()
const render = async () => {
  await setup!.renderOnce()
}
const type = async (text: string) => {
  await act(async () => {
    await setup!.mockInput.typeText(text)
  })
  await render()
}
const key = async (name: string) => {
  await act(async () => {
    setup!.mockInput.pressKey(name)
    await setImmediate()
  })
  await render()
}
const command = async (text: string) => {
  await type(text)
  await key("RETURN")
}
const request = { id: "review", title: "Review one file", prompt: "Review src/one.ts only." }
const delegate = async (input: Host.TurnInput, value = request) => {
  let receipt: unknown
  await act(async () => {
    receipt = input.runtime!.delegate!(value)
    await setImmediate()
  })
  await render()
  return receipt
}
const finish = async (index: number, outcome: Host.Outcome) => {
  await act(async () => {
    if (outcome._tag === "done") {
      turns[index]!.input.onEvent(
        new AgentEvent.Resolved({
          eventType: "flows.harness.resolved.v1",
          message: ModelRequest.Message.assistant(outcome.answer)
        })
      )
    }
    turns[index]!.done.resolve(outcome)
    await setImmediate()
  })
  await render()
}
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "tui-app-monitors-"))
  cwd = join(root, "workspace")
  mkdirSync(cwd)
  previousRoot = process.env.SMITHERS_TUI_SESSION_DIR
  previousTheme = Theme.activeTheme()
  process.env.SMITHERS_TUI_SESSION_DIR = join(root, "sessions")
  turns = []
  judges = []
  compositions = []
  host = {
    cwd,
    judged: true,
    monitor: {
      judge: (input) => {
        const gate = Promise.withResolvers<boolean>()
        judges.push({ input, gate })
        return gate.promise
      },
      compose: (input) => {
        const gate = Promise.withResolvers<string>()
        compositions.push({ input, gate })
        return gate.promise
      }
    },
    compaction: async () => undefined,
    dispose: async () => {},
    run: (input) => {
      const turn = {
        input,
        done: Promise.withResolvers<Host.Outcome>(),
        admitted: records(),
        cancelled: 0
      }
      turns.push(turn)
      return {
        done: turn.done.promise,
        cancel: () => {
          turn.cancelled++
          turn.done.resolve({ _tag: "cancelled" })
        }
      }
    }
  }
  await act(async () => {
    setup = await testRender(
      <App
        host={host}
        seat="replay:chat"
        workerSeat="replay:worker"
        models={[{ seat: "replay:chat", label: "Replay", provider: "Fixture" }]}
        contextWindow={() => 10000}
      />,
      { width: 140, height: 35, exitOnCtrlC: false }
    )
  })
  await command("Coordinate a review")
})
afterEach(async () => {
  try {
    await act(async () => {
      setup?.renderer.destroy()
      for (const judge of judges) judge.gate.resolve(false)
      for (const composition of compositions) composition.gate.resolve("Cleanup")
      for (const turn of turns) turn.done.resolve({ _tag: "cancelled" })
      await Promise.all(turns.map((turn) => turn.done.promise))
      await setImmediate()
    })
  } finally {
    setup = undefined
    Theme.setTheme(previousTheme)
    if (previousRoot === undefined) delete process.env.SMITHERS_TUI_SESSION_DIR
    else process.env.SMITHERS_TUI_SESSION_DIR = previousRoot
    rmSync(root, { recursive: true, force: true })
  }
})

const monitors = () => turns[0]!.input.runtime!.monitors!
const start = async () => {
  await delegate(turns[0]!.input)
  let receipt: unknown
  await act(async () => {
    receipt = monitors().create({
      id: "watch-review",
      title: "Review",
      watch: "Tell me when review finishes",
      source: { kind: "tab", id: "review" }
    })
    await setImmediate()
  })
  expect(receipt).toEqual({ id: "watch-review", status: "active" })
  await checkpoint(() => records().some((r) => r.type === "monitor" && r.monitor.seen !== undefined))
  expect(judges).toEqual([])
  expect(compositions).toEqual([])
  expect(records().filter((r) => r.type === "monitor").at(-1)).toMatchObject({
    monitor: { id: "watch-review", status: "active", updates: 0 }
  })
  await render()
  expect(frame()).toContain("◉ Review")
}
const changed = async () => {
  await finish(1, { _tag: "done", answer: "Review complete" })
  await checkpoint(() => judges.length === 1)
  expect(judges[0]!.input.watch).toBe("Tell me when review finishes")
  expect(judges[0]!.input.before).toContain("status: running")
  expect(judges[0]!.input.after).toContain("status: done")
  expect(judges[0]!.input.after).toContain("answer: Review complete")
}

test("monitor publication persists before delivery and pending judge/compose preserve the composer", async () => {
  await start()
  await type("Keep drafting")
  await changed()
  expect(frame()).toContain("Keep drafting")
  expect(records().filter((r) => r.type === "monitor-update")).toEqual([])
  await act(async () => {
    judges[0]!.gate.resolve(true)
    await setImmediate()
  })
  await checkpoint(() => compositions.length === 1)
  expect(compositions[0]!.input).toEqual(judges[0]!.input)
  expect(frame()).toContain("Keep drafting")
  await act(async () => {
    compositions[0]!.gate.resolve("Review finished safely")
    await setImmediate()
  })
  await checkpoint(() => frame().includes("Review: Review finished safely"))
  expect(records().filter((r) => r.type === "monitor-update")).toHaveLength(1)
  expect(records().filter((r) => r.type === "monitor-update")[0]).toMatchObject({
    id: "watch-review",
    title: "Review",
    text: "Review finished safely"
  })
  expect(frame()).toContain("Keep drafting")
}, 15000)

test("routine monitor changes remain silent without calling the composer", async () => {
  await start()
  await changed()
  await act(async () => {
    judges[0]!.gate.resolve(false)
    await setImmediate()
  })
  expect(compositions).toEqual([])
  expect(records().filter((r) => r.type === "monitor-update")).toEqual([])
  expect(monitors().list()).toMatchObject([{ id: "watch-review", status: "active", updates: 0 }])
}, 15000)

test("a monitor judge failure becomes a durable visible refusal while Chat stays usable", async () => {
  await start()
  await changed()
  await act(async () => {
    judges[0]!.gate.reject(new Error("Judge unavailable"))
    await setImmediate()
  })
  await checkpoint(() => frame().includes("Jev failed (unreachable): Judge unavailable"))
  expect(compositions).toEqual([])
  expect(monitors().list()).toMatchObject([{
    id: "watch-review",
    status: "failed",
    failure: { _tag: "JevFailed", code: "unreachable", message: "Judge unavailable" }
  }])
  expect(records().filter((r) => r.type === "monitor-update")).toHaveLength(1)
  await type("Chat still works")
  expect(frame()).toContain("Chat still works")
}, 15000)

test("stopping a monitor with an unresolved judge prevents late composition and delivery", async () => {
  await start()
  await changed()
  await act(async () => {
    expect(monitors().stop("watch-review")).toEqual({ id: "watch-review", status: "stopped" })
    judges[0]!.gate.resolve(true)
    await setImmediate()
  })
  await render()
  expect(compositions).toEqual([])
  expect(records().filter((r) => r.type === "monitor-update")).toEqual([])
  expect(monitors().list()).toMatchObject([{ id: "watch-review", status: "stopped", updates: 0 }])
}, 15000)
