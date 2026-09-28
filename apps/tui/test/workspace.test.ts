/** Custom agents in worker tabs: the body is read at launch, never at request. */
import * as Seat from "@smthrs/agent/Seat"
import { describe, expect, it } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as Agents from "../src/agents.ts"
import type * as Extension from "../src/extension.ts"
import type * as Flows from "../src/flows.ts"
import type * as Host from "../src/host.ts"
import * as Models from "../src/models.ts"
import * as Session from "../src/session.ts"
import { type Snapshot, Workspace } from "../src/workspace.ts"

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const descriptor = (overrides: Partial<Extension.Descriptor> = {}): Extension.Descriptor => ({
  name: "review",
  description: "Reviews the change.",
  modelInvocable: true,
  kind: "markdown",
  seat: "opus",
  flows: [],
  capabilities: ["fs:read:**"],
  path: "/repo/flows/review/flow.mdx",
  ...overrides
})
const listed: ReadonlyArray<Extension.Descriptor> = [
  descriptor(),
  descriptor({ name: "echo", kind: "module" }),
  descriptor({ name: "manual", modelInvocable: false, seat: undefined })
]
const body = (text = "Review the change."): Flows.Body => ({
  text,
  baseDirectory: "/repo/flows/review",
  digest: "a".repeat(64)
})

const setup = (
  options: {
    readonly known?: boolean
    readonly routes?: boolean
    readonly delegable?: ReadonlyArray<Models.DelegateModel>
    readonly restored?: Snapshot
  } = {}
) => {
  const inputs: Array<Host.TurnInput> = []
  const finishes: Array<(outcome: Host.Outcome) => void> = []
  const loads: Array<{ name: string; resolve: (body: Flows.Body) => void; reject: (error: unknown) => void }> = []
  const records: Array<Session.Record> = []
  /** A pending Jev pick per `auto` launch; the fake host reports it as `Host.run` does. */
  const routers: Array<{ resolve: (seat: string) => void; reject: (error: Seat.SeatUnrouted) => void }> = []
  const host: Host.Host = {
    cwd: mkdtempSync(join(tmpdir(), "tui-agents-")),
    judged: options.routes === true,
    ...(options.routes === undefined ? {} : { routes: options.routes }),
    compaction: async () => undefined,
    dispose: async () => {},
    run: (input) => {
      inputs.push(input)
      const done = new Promise<Host.Outcome>((resolve) => finishes.push(resolve))
      const finish = finishes.at(-1)!
      if (input.seat === Seat.auto) {
        void new Promise<string>((resolve, reject) => routers.push({ resolve, reject })).then(
          (seat) => input.onSeat?.(seat),
          (error: Seat.SeatUnrouted) => finish({ _tag: "failed", message: error.message, detail: "", error })
        )
      }
      return { done, cancel: () => finishes.at(-1)?.({ _tag: "cancelled" }) }
    }
  }
  let current = listed
  const agents: Agents.Port = {
    listed: () => (options.known === false ? undefined : current),
    load: (name) =>
      new Promise((resolve, reject) =>
        loads.push({
          name,
          resolve: (value) => {
            try {
              resolve({ descriptor: Agents.find(current, name, "user"), body: value })
            } catch (error) {
              reject(error)
            }
          },
          reject
        })
      )
  }
  const workspace = new Workspace({
    host,
    workerSeat: "worker:test",
    history: () => [],
    persist: (record) => records.push(record),
    agents,
    ...(options.restored === undefined ? {} : { restored: options.restored }),
    seatOf: (declared) => Models.seatOf(declared, []),
    ...(options.delegable === undefined ? {} : { delegable: options.delegable })
  })
  return {
    workspace,
    inputs,
    finishes,
    loads,
    records,
    routers,
    relist: (next: ReadonlyArray<Extension.Descriptor>) => {
      current = next
    }
  }
}
const request = { id: "rev", title: "Review src", prompt: "Look at src.", agent: "review" }

describe("delegate models", () => {
  it("refuses a model this machine cannot reach before any tab exists", () => {
    const f = setup({ delegable: ["sol"] })
    expect(() => f.workspace.request({ id: "q", title: "Q", prompt: "Answer.", model: "cerebras" }))
      .toThrow("Model cerebras is not available here; use sol or omit model")
    expect(f.workspace.snapshot().tabs).toEqual([])
    expect(f.workspace.request({ id: "q", title: "Q", prompt: "Answer.", model: "sol" }).status).toBe("requested")
    expect(() => setup({ delegable: [] }).workspace.request({ id: "q", title: "Q", prompt: "A.", model: "luna" }))
      .toThrow("Model luna is not available here; omit model")
  })
})

describe("custom agents", () => {
  it("returns requested before the body is read and keeps chat usable while it never resolves", async () => {
    const f = setup()
    expect(f.workspace.request(request)).toEqual({ id: "rev", status: "requested" })
    expect(f.records[0]).toMatchObject({ type: "tab", tab: { status: "requested", agent: { name: "review" } } })
    await tick()
    expect(f.loads.map((load) => load.name)).toEqual(["review"])
    expect(f.inputs).toHaveLength(0)
    expect(f.workspace.read("rev").status).toBe("requested")
    // Chat can request and publish other work while the body read hangs.
    expect(f.workspace.request({ id: "other", title: "Other", prompt: "Other work." }).status).toBe("requested")
    f.workspace.publish({ id: "plan", title: "Plan", summary: "One step.", rows: [] })
    await tick()
    expect(f.inputs.map((input) => input.source)).toEqual(["other"])
    expect(f.workspace.busy).toBe(true)
  })

  it("runs the agent's profile on its declared seat and records the digest", async () => {
    const f = setup()
    f.workspace.request(request)
    await tick()
    f.loads[0]!.resolve(body())
    await tick()
    const [input] = f.inputs
    expect(input?.seat).toBe("anthropic:claude-opus-5-5")
    expect(input?.role).toBe("worker")
    expect(input?.agent?.name).toBe("review")
    expect(input?.agent?.system).toStartWith("Review the change.")
    expect(input?.agent?.envelope).toEqual(["fs:read:**"])
    expect(f.workspace.snapshot().tabs[0]).toMatchObject({
      status: "running",
      seat: "anthropic:claude-opus-5-5",
      agent: { name: "review", digest: "a".repeat(64) }
    })
    f.finishes[0]!({ _tag: "done", answer: "approve" })
    await tick()
    expect(f.workspace.read("rev")).toMatchObject({ status: "done", answer: "approve" })
  })

  it("passes a custom agent's fallback order unless the caller overrides its model", async () => {
    const f = setup()
    f.relist([descriptor({ fallbackSeats: ["sol", "luna"] })])
    f.workspace.request(request)
    f.workspace.request({ ...request, id: "override", model: "astra" })
    await tick()
    f.loads[0]!.resolve(body())
    f.loads[1]!.resolve(body())
    await tick()
    expect(f.inputs[0]?.fallbackSeats).toEqual([Models.delegateModels.sol, Models.delegateModels.luna])
    expect(f.inputs[1]?.fallbackSeats).toBeUndefined()
    f.workspace.dispose()
  })

  it("prefers the requested model, then the agent's, then the worker seat", async () => {
    const f = setup()
    f.workspace.request({ ...request, model: "astra" })
    f.workspace.request({ ...request, id: "plain", agent: "manual", by: "user" })
    await tick()
    f.loads[0]!.resolve(body())
    f.loads[1]!.resolve(body())
    await tick()
    expect(f.inputs.map((input) => input.seat)).toEqual([Models.delegateModels.astra, "worker:test"])
  })

  it("settles an unreadable body as a typed failure and retries with the edited file", async () => {
    const f = setup()
    f.workspace.request({ ...request, model: "astra" })
    await tick()
    f.loads[0]!.reject(new Error("body for flow \"review\" is unavailable\n  at stack"))
    await tick()
    expect(f.workspace.read("rev")).toMatchObject({
      status: "failed",
      message: "body for flow \"review\" is unavailable"
    })
    expect(f.workspace.snapshot().tabs[0]?.code).toBe("unreadable")
    expect(f.inputs).toHaveLength(0)
    f.workspace.retry("rev")
    expect(f.workspace.read("rev").status).toBe("requested")
    await tick()
    f.loads[1]!.resolve(body("Review it again."))
    await tick()
    // Retry keeps the agent and the requested model, and re-reads the file.
    expect(f.inputs[0]?.agent?.system).toStartWith("Review it again.")
    expect(f.inputs[0]?.seat).toBe(Models.delegateModels.astra)
  })

  it("a body refusal writes one sanitized failed outcome to the worker's own session", async () => {
    const f = setup()
    f.workspace.request(request)
    await tick()
    const file = f.workspace.snapshot().tabs[0]!.file
    f.loads[0]!.reject(new Error("Body unavailable\nprivate stack"))
    await tick()
    const outcomes = Session.load(file).filter((record) => record.type === "outcome")
    expect(outcomes).toHaveLength(1)
    expect(outcomes[0]).toMatchObject({
      prompt: request.prompt,
      outcome: { _tag: "failed" }
    })
    if (outcomes[0]?.type !== "outcome" || outcomes[0].outcome._tag !== "failed") {
      throw new Error("Worker failed outcome missing")
    }
    expect(outcomes[0].outcome.message).toContain("Body unavailable")
    expect(outcomes[0].outcome.message).not.toContain("private stack")
    expect(outcomes[0].outcome.message).not.toContain("\n")
    expect(outcomes[0].outcome.headline).toBe(f.workspace.snapshot().tabs[0]!.failure!.headline)
    expect(f.workspace.snapshot().tabs[0]).toMatchObject({ status: "failed", code: "unreadable" })
    expect(f.inputs).toEqual([])
  })

  it("a body refusal has the same settled failure timeline live and after reopening", async () => {
    const f = setup()
    f.workspace.request(request)
    await tick()
    f.loads[0]!.reject(new Error("Body unavailable\nprivate stack"))
    await tick()
    const snapshot = f.workspace.snapshot()
    const failed = snapshot.tabs[0]!
    const live = f.workspace.transcript(failed.id)
    expect(live.items.filter((item) => item.kind === "error")).toMatchObject([
      { text: failed.failure!.headline }
    ])
    expect(live.streaming).toBe("")
    expect(live.thinking).toBe(false)
    const restored = setup({ restored: snapshot })
    await tick()
    expect(restored.workspace.transcript(failed.id).items.filter((item) => item.kind === "error"))
      .toEqual(live.items.filter((item) => item.kind === "error"))
    expect(restored.workspace.read(failed.id)).toMatchObject({ status: "failed" })
    expect(restored.workspace.panel(failed.id).summary).toBe(failed.failure!.headline)
    expect(restored.loads).toEqual([])
    expect(restored.inputs).toEqual([])
    expect(Session.load(failed.file).filter((record) => record.type === "outcome")).toHaveLength(1)
  })

  it("a stale body refusal cannot fail the replacement worker or write its failure receipt", async () => {
    const f = setup()
    f.workspace.request(request)
    await tick()
    const firstFile = f.workspace.snapshot().tabs[0]!.file
    f.workspace.cancel(request.id)
    f.workspace.retry(request.id)
    await tick()
    const replacementFile = f.workspace.snapshot().tabs[0]!.file
    expect(replacementFile).not.toBe(firstFile)
    f.loads[1]!.resolve(body("Current body."))
    await tick()
    f.loads[0]!.reject(new Error("Stale body refusal"))
    await tick()
    expect(f.workspace.snapshot().tabs[0]).toMatchObject({ status: "running", file: replacementFile })
    expect(f.workspace.transcript(request.id).items.filter((item) => item.kind === "error")).toEqual([])
    expect(Session.load(replacementFile).filter((record) => record.type === "outcome")).toEqual([])
    expect(f.inputs).toHaveLength(1)
    expect(f.inputs[0]!.agent?.system).toStartWith("Current body.")
    f.finishes[0]!({ _tag: "done", answer: "Recovered review" })
    await tick()
    expect(f.workspace.read(request.id)).toMatchObject({ status: "done", answer: "Recovered review" })
    expect(Session.load(replacementFile).filter((record) => record.type === "outcome"))
      .toMatchObject([{ outcome: { _tag: "done", answer: "Recovered review" } }])
  })

  it("reopens an old body refusal without failure metadata as a visible failure without relaunching", async () => {
    const f = setup()
    f.workspace.request(request)
    await tick()
    f.loads[0]!.reject(new Error("Body unavailable\nprivate stack"))
    await tick()
    const snapshot = f.workspace.snapshot()
    const { failure, ...tab } = snapshot.tabs[0]!
    // Older preparation failures saved the parent tab but left only the
    // request in the worker file, with no failed outcome or failure metadata.
    const oldFile = Session.create(mkdtempSync(join(tmpdir(), "tui-old-body-refusal-")))
    oldFile.append({ type: "user", at: tab.startedAt, text: request.prompt })
    const restored = setup({ restored: { ...snapshot, tabs: [{ ...tab, file: oldFile.file }] } })
    await tick()
    const visible = restored.workspace.snapshot().tabs[0]!
    expect(visible).toMatchObject({ status: "failed", code: "unreadable", message: "Body unavailable" })
    expect(visible.failure).toEqual(failure)
    expect(restored.workspace.panel(tab.id).summary).toBe(visible.failure!.headline)
    expect(JSON.stringify(visible.failure)).not.toContain("private stack")
    expect(restored.loads).toEqual([])
    expect(restored.inputs).toEqual([])
    expect(Session.load(oldFile.file).filter((record) => record.type === "outcome")).toEqual([])
  })

  it("fails the tab with unknown_seat when the declared model is unknown", async () => {
    const f = setup()
    f.relist([descriptor({ seat: "gpt-9" })])
    f.workspace.request(request)
    await tick()
    f.loads[0]!.resolve(body())
    await tick()
    expect(f.workspace.snapshot().tabs[0]).toMatchObject({
      status: "failed",
      code: "unknown_seat",
      message: "Unknown model gpt-9"
    })
    expect(f.inputs).toHaveLength(0)
  })

  it("refuses unknown agents, module flows and person-only agents synchronously", () => {
    const f = setup()
    const code = (run: () => unknown) => {
      try {
        run()
      } catch (error) {
        return (error as Agents.AgentError).code
      }
    }
    expect(code(() => f.workspace.request({ ...request, agent: "missing" }))).toBe("unknown_agent")
    expect(code(() => f.workspace.request({ ...request, agent: "echo" }))).toBe("not_an_agent")
    expect(code(() => f.workspace.request({ ...request, agent: "manual" }))).toBe("not_invocable")
    expect(f.workspace.request({ ...request, agent: "manual", by: "user" }).status).toBe("requested")
    expect(f.records.filter((record) => record.type === "tab")).toHaveLength(1)
  })

  it("deduplicates the same request and refuses the id for a different agent", () => {
    const f = setup()
    f.workspace.request(request)
    expect(f.workspace.request(request)).toEqual({ id: "rev", status: "requested" })
    expect(() => f.workspace.request({ ...request, agent: "manual", by: "user" })).toThrow("another request")
    expect(() => f.workspace.request({ ...request, agent: undefined })).toThrow("another request")
    expect(() => f.workspace.request({ ...request, model: "sol" })).toThrow("another request")
    expect(f.records.filter((record) => record.type === "tab")).toHaveLength(1)
  })

  it("never launches a tab stopped while its body was being read", async () => {
    const f = setup()
    f.workspace.request(request)
    await tick()
    f.workspace.cancel("rev")
    f.loads[0]!.resolve(body())
    await tick()
    expect(f.inputs).toHaveLength(0)
    expect(f.workspace.read("rev").status).toBe("cancelled")
  })

  it("keeps a plain delegation's model on retry", async () => {
    const f = setup()
    f.workspace.request({ id: "fix", title: "Fix", prompt: "Fix it.", model: "astra" })
    await tick()
    f.finishes[0]!({ _tag: "failed", message: "Provider down", detail: "" })
    await tick()
    f.workspace.retry("fix")
    await tick()
    expect(f.inputs.map((input) => input.seat)).toEqual([Models.delegateModels.astra, Models.delegateModels.astra])
  })
})

it("checks an agent at launch when the listing was not known at request", async () => {
  const f = setup({ known: false })
  f.workspace.request({ ...request, agent: "manual" })
  await tick()
  f.loads[0]!.resolve(body())
  await tick()
  expect(f.workspace.snapshot().tabs[0]).toMatchObject({ status: "failed", code: "not_invocable" })
  expect(f.inputs).toHaveLength(0)
})

describe("routed workers", () => {
  const plain = { id: "fix", title: "Fix", prompt: "Fix it." }
  const seats = (f: ReturnType<typeof setup>) => f.inputs.map((input) => input.seat)

  it("persists auto and returns the receipt before routing settles, and chat stays usable", async () => {
    const f = setup({ routes: true })
    expect(f.workspace.request(plain)).toEqual({ id: "fix", status: "requested" })
    expect(f.records[0]).toMatchObject({ type: "tab", tab: { status: "requested", seat: Seat.auto } })
    await tick()
    expect(seats(f)).toEqual([Seat.auto])
    expect(f.routers).toHaveLength(1)
    // The router never answers here; chat still requests, publishes and deduplicates.
    expect(f.workspace.request({ ...plain, id: "other" }).status).toBe("requested")
    expect(f.workspace.request(plain)).toEqual({ id: "fix", status: "running" })
    f.workspace.publish({ id: "plan", title: "Plan", summary: "One step.", rows: [] })
    expect(f.workspace.read("fix").status).toBe("running")
  })

  it("keeps the routed seat, and a retry reuses it without routing again", async () => {
    const f = setup({ routes: true })
    f.workspace.request(plain)
    await tick()
    f.routers[0]!.resolve("sol")
    await tick()
    expect(f.workspace.snapshot().tabs[0]?.seat).toBe("sol")
    expect(f.workspace.request(plain)).toEqual({ id: "fix", status: "running" })
    f.finishes[0]!({ _tag: "failed", message: "Provider down", detail: "" })
    await tick()
    f.workspace.retry("fix")
    await tick()
    expect(seats(f)).toEqual([Seat.auto, "sol"])
    expect(f.routers).toHaveLength(1)
  })

  it("runs a requested model or an agent's declared one without routing", async () => {
    const f = setup({ routes: true })
    f.workspace.request({ ...plain, model: "sol" })
    f.workspace.request(request)
    await tick()
    f.loads[0]!.resolve(body())
    await tick()
    expect(seats(f)).toEqual([Models.delegateModels.sol, "anthropic:claude-opus-5-5"])
    expect(f.workspace.snapshot().tabs.some((tab) => tab.seat === Seat.auto)).toBe(false)
    expect(f.routers).toHaveLength(0)
  })

  it("routes an agent that declares no model", async () => {
    const f = setup({ routes: true })
    f.workspace.request({ ...request, agent: "manual", by: "user" })
    await tick()
    f.loads[0]!.resolve(body())
    await tick()
    expect(seats(f)).toEqual([Seat.auto])
  })

  it("an operator's SMITHERS_TUI_WORKER_SEAT means no routing", async () => {
    const available: Models.Available = {
      models: [{ seat: "openai:gpt-6-sol", label: "GPT-6 Sol", provider: "OpenAI" }, {
        seat: "openai:gpt-6-astra",
        label: "GPT-6 Astra",
        provider: "OpenAI"
      }],
      defaultSeat: undefined,
      workerSeat: undefined,
      environment: {}
    }
    const f = setup({
      routes: Models.routing(available, { SMITHERS_TUI_WORKER_SEAT: "worker:test" }, true) !== undefined
    })
    f.workspace.request(plain)
    await tick()
    expect(seats(f)).toEqual(["worker:test"])
    expect(f.routers).toHaveLength(0)
  })

  it("fails the tab visibly when routing fails, and a retry routes again", async () => {
    const f = setup({ routes: true })
    f.workspace.request(plain)
    await tick()
    f.routers[0]!.reject(new Seat.SeatUnrouted({ seat: Seat.auto, reason: "timeout", message: "Jev timed out" }))
    await tick()
    expect(f.workspace.read("fix")).toMatchObject({ status: "failed", message: "Jev timed out" })
    expect(f.workspace.snapshot().tabs[0]?.seat).toBe(Seat.auto)
    f.workspace.retry("fix")
    await tick()
    expect(f.routers).toHaveLength(2)
    f.routers[1]!.resolve("astra")
    await tick()
    expect(f.workspace.snapshot().tabs[0]).toMatchObject({ status: "running", seat: "astra" })
  })
})
