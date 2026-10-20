// The agent's catalog, scoped to the run that asks (src/flows/catalog.ts, decision 0014 §2): reads only while a draft
// is written, a person's flow's own list while one runs, and the whole catalog otherwise. The scope of a run's own
// agent is proved end to end in src/features/flows-ui/flows.test.ts; these are the rules and the failure of the read.
import { Effect } from "effect"
import { describe, expect, test } from "vitest"
import { PROMPT_CATALOG } from "../features/flows-ui/callable"
import { AUTHOR_TOOLS } from "../features/flows-ui/contract"
import { scopeFor, scopeOf } from "./catalog"

describe("scopeOf", () => {
  test("a draft's agent reads; a person's flow's agent calls what it lists that a person's flow may call", () => {
    expect(scopeOf("flow/new", undefined)).toEqual(AUTHOR_TOOLS)
    expect(scopeOf("flow/run/prompt", ["app/theme/set", "flow/new", "run/cancel", "nothing/here"])).toEqual([
      "app/theme/set",
    ])
    expect(scopeOf("flow/run/prompt", undefined)).toEqual([])
    expect(scopeOf("chat/Answer", undefined)).toBe("all")
  })
})

describe("scopeFor", () => {
  const read = (payload: unknown) => () => Effect.succeed(payload)

  test("reads a person's flow's list from its pinned payload", async () => {
    expect(await Effect.runPromise(scopeFor("flow/run/prompt", "run-1", read({ allowed: ["app/theme/set"] }))))
      .toEqual(["app/theme/set"])
    expect(await Effect.runPromise(scopeFor("chat/Answer", "run-1", () => Effect.die("never read")))).toBe("all")
  })

  test("a payload without a list, or one that can't be read, leaves the agent nothing to call", async () => {
    expect(await Effect.runPromise(scopeFor("flow/run/prompt", "run-1", read({ name: "x" })))).toEqual([])
    expect(await Effect.runPromise(scopeFor("flow/run/prompt", "run-1", () => Effect.fail("unreadable")))).toEqual([])
  })
})

describe("what a person's flow may call", () => {
  test("every one carries the description the drafting agent reads, and none is an authoring or run act", () => {
    expect(PROMPT_CATALOG.length).toBeGreaterThan(0)
    for (const entry of PROMPT_CATALOG) {
      expect([entry.name, entry.description.length > 0]).toEqual([entry.name, true])
      expect(entry.name).not.toMatch(/^(flow|run)\//)
    }
  })
})
