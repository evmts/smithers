// The registry's laws (decision 0003 §1, docs/features/flows.md#the-registry): anything a person can do, the agent can
// do; every registered flow runs on this device; the UI dispatches only registered names; and the declarations an
// engine runs are the registry's flows, one to one, with the very schemas the tab dispatches by.
import { Flow } from "@smthrs/flow"
import { Placement } from "@smthrs/plan"
import { Context, Option } from "effect"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { agentFlows, childExecutionId, publicError } from "./catalog"
import { clientFlows, declarationOf, declarations, modelInvocable } from "./declarations"
import { entryOf, names, registry } from "./registry"
import { requesterOf } from "./requests"

/** Every source file under `src/`, tests and test support left out. */
const sources = (dir: string): ReadonlyArray<string> =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === "test" ? [] : sources(path)
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [path] : []
  })

describe("the parity law", () => {
  test("every registered flow the agent may not run says why, and declares itself not model-invocable", () => {
    for (const name of names) {
      const entry = entryOf(name)
      expect([name, modelInvocable(name)]).toEqual([name, entry.userOnlyReason === undefined])
      if (entry.userOnlyReason !== undefined) expect(entry.userOnlyReason.length).toBeGreaterThan(0)
    }
  })

  test("the UI dispatches only registered names", () => {
    const dispatched = sources(join(import.meta.dirname, "..")).flatMap((path) =>
      [...readFileSync(path, "utf8").matchAll(/\.dispatch\(\s*"([^"]+)"/g)].map((match) => match[1]!)
    )

    expect(dispatched).toContain("app/theme/set")
    for (const name of dispatched) expect(names).toContain(name)
  })

  test("the agent's catalog is every model-invocable flow", () => {
    expect(agentFlows).toEqual(names.filter(modelInvocable))
    expect(agentFlows).toEqual([
      "app/theme/set",
      "app/navigate",
      "app/web/open",
      "chat/copy",
      "repo/tree",
      "repo/read",
      "repo/refs",
      "repo/clone",
      "repo/copy",
      "app/jev/classify",
      "app/jev/evaluate",
      "app/agent/ask",
      "flow/new",
      "flow/save",
      "flow/run",
      "flow/delete",
      "flow/list",
      "run/cancel",
      "run/retry",
      "run/resume",
      "run/list",
      "run/inspect",
      "branch/track",
      "issue/create",
      "issue/comment",
    ])
  })
})

describe("names and placement", () => {
  test("each entry is registered under its own flow's tag, in a namespace only the app claims", () => {
    for (const name of names) {
      expect(registry[name].flow._tag).toBe(name)
      expect(name).toMatch(/^(app|chat|repo|ui|view|flow|run|branch|terminal|issue)\//)
    }
  })

  test("each registered flow has one declaration, with the very tag and schemas the tab dispatches by", () => {
    expect(Object.keys(declarations)).toEqual(names)
    for (const name of names) {
      const reference = entryOf(name).flow
      const declaration = declarationOf(name)
      expect(Flow.isFlow(declaration)).toBe(true)
      expect(declaration._tag).toBe(reference._tag)
      expect(declaration.payloadSchema).toBe(reference.payloadSchema)
      expect(declaration.successSchema).toBe(reference.successSchema)
      expect(declaration.errorSchema).toBe(reference.errorSchema)
    }
    // The agent's flow is only a reference here: the tab never holds its body.
    expect(Flow.isFlow(registry["chat/Answer"].flow)).toBe(false)
  })

  test("every registered flow declares that it runs on this device", () => {
    for (const name of names) {
      const declared = Context.getOption(declarationOf(name).annotations, Flow.Placement)
      expect([name, declared]).toEqual([name, Option.some(Placement.client())])
    }
  })

  test("the engine runs every registered flow", () => {
    expect(clientFlows).toEqual(names.map(declarationOf))
    expect(clientFlows.map((flow) => flow._tag)).toEqual([
      "app/theme/set",
      "app/navigate",
      "app/web/open",
      "chat/Answer",
      "chat/Close",
      "chat/copy",
      "chat/edit",
      "repo/tree",
      "repo/read",
      "repo/refs",
      "repo/clone",
      "repo/copy",
      "app/jev/classify",
      "app/jev/evaluate",
      "app/agent/ask",
      "run/answer",
      "run/deliver",
      "flow/new",
      "flow/answer",
      "flow/save",
      "flow/run",
      "flow/run/prompt",
      "flow/delete",
      "flow/list",
      "run/cancel",
      "run/retry",
      "run/resume",
      "run/list",
      "run/inspect",
      "branch/track",
      "terminal/open",
      "issue/create",
      "issue/comment",
    ])
  })
})

describe("the agent's catalog", () => {
  test("names each cell call's child execution by the call's replay-stable identity", () => {
    expect(childExecutionId({ session: "answer-1/chat/Respond@abc:1", frame: 2, ordinal: 0 } as never)).toBe(
      "answer-1/chat/Respond@abc:1/call/2.0",
    )
  })

  test("a cell call's child execution belongs to the answer whose run made it, which the asking tab dispatched", () => {
    const child = childExecutionId({ session: "answer-1/chat/Respond@abc:1", frame: 2, ordinal: 0 } as never)
    expect(requesterOf(child)).toBe("answer-1")
    // A tab's own dispatch is its own requester.
    expect(requesterOf("8a7f0c2e-5d1b-4c4a-9a43-0f2a1f7e9b10")).toBe("8a7f0c2e-5d1b-4c4a-9a43-0f2a1f7e9b10")
  })

  test("tells a cell a flow's failure by its kind, never its message", () => {
    expect(publicError({ _tag: "@smthrs/mvp/theme/PreferencesUnavailable", message: "secret" })).toBe(
      "PreferencesUnavailable",
    )
    expect(publicError(new Error("secret"))).toBe("failed")
  })
})
