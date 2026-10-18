/**
 * `StandardFlows.filesystem` options and the text its search flows publish:
 * a host that cannot apply an edit is never offered a flow that would, and a
 * search that timed out says so without the host's own diagnostic.
 */
import * as NodePath from "@effect/platform-node/NodePath"
import type { Cell } from "@smthrs/harness"
import { Search, StdError } from "@smthrs/std"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import { expect, it } from "vitest"
import * as StandardFlows from "../src/StandardFlows.ts"

const services = Context.merge(
  Context.make(FileSystem.FileSystem, FileSystem.makeNoop({})),
  Effect.runSync(Effect.provide(Effect.context<Path.Path>(), NodePath.layer))
)

const names = (options?: { readonly mutations?: boolean }) =>
  Effect.runPromise(
    Effect.map(
      StandardFlows.filesystem(services, undefined, options).bindings(),
      (bindings) => bindings.map((binding) => binding.descriptor.name).sort()
    )
  )

it("offers only the reading flows when the host cannot apply an edit", async () => {
  const all = await names()
  const reading = await names({ mutations: false })
  expect(reading).toEqual(["glob", "grep", "ls", "read"])
  expect(all.filter((name) => !reading.includes(name)).sort()).toEqual(["apply_patch", "edit", "write"])
})

it("publishes a search timeout as a fixed sentence, never the host's diagnostic", async () => {
  const timedOut = new StdError.StdError({ code: "timeout", message: "rg killed after 30s in /home/someone/secret" })
  const search = Search.make({ glob: () => Effect.fail(timedOut), grep: () => Effect.fail(timedOut) })
  const bindings = await Effect.runPromise(StandardFlows.filesystem(services, search).bindings())
  const grep = bindings.find((binding) => binding.descriptor.name === "grep")!
  const call = {
    flowName: "grep",
    input: { pattern: "needle", root: "/repo" },
    capabilities: [],
    effects: { reads: [], writes: [], mode: "expected", onConflict: "serialize", tier: "sealed" },
    placement: Option.none(),
    identity: { session: "session-1", frame: 0, cell: "cell", ordinal: 0, declaration: "grep", layers: [] }
  } as unknown as Cell.Call
  const result = await Effect.runPromise(grep.run(call))
  expect(result).toMatchObject({ outcome: "failure", message: "Flow grep failed: The command timed out." })
  expect(JSON.stringify(result)).not.toContain("secret")
})
