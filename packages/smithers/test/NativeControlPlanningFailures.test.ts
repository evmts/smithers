import { NodeServices } from "@effect/platform-node"
import { ControlRuntime } from "@smthrs/control"
import { Action, Flow } from "@smthrs/flow"
import * as Executable from "@smthrs/registry/Executable"
import * as Registry from "@smthrs/registry/Registry"
import { Effect, Layer, Logger, PlatformError, Schema } from "effect"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { expect, it } from "vitest"
import * as NodeControl from "../src/NodeControl.ts"

const Probe = Action.make("test/PlanningProbe", { payload: { value: Schema.Unknown }, success: Schema.Unknown })
const delegate = (kind: "walk" | "compile" | "valid") =>
  Flow.make("test/Planning", {
    payload: Executable.Invocation,
    success: Schema.Unknown,
    error: Schema.Unknown,
    body: () => {
      if (kind === "walk") throw new Error("private planning document without credential syntax")
      return Probe.call({ value: kind === "compile" ? { "private planning document": 1n } : "valid" })
    }
  })

/** Real discovery, catalog and SQL runtime; planning needs no execution host. */
const onRuntime = async (
  kind: "walk" | "compile" | "valid",
  refusal?: Executable.ExecutableError
) => {
  const root = await mkdtemp(join(tmpdir(), "smithers-planning-failure-"))
  const logs: Array<string> = []
  try {
    const directory = join(root, ".smithers", "flows", "native")
    await mkdir(directory, { recursive: true })
    const definition = {
      name: "native",
      description: "Planning regression",
      capabilities: [],
      flows: ["test/Planning"],
      input: Schema.Unknown,
      output: Schema.Unknown,
      effects: { reads: [], writes: [], mode: "expected", onConflict: "serialize", tier: "sealed" }
    } as const
    await writeFile(
      join(directory, "flow.ts"),
      `export default ({
      name: "native", description: "Planning regression", capabilities: [], flows: ["test/Planning"],
      effects: { reads: [], writes: [], mode: "expected", onConflict: "serialize", tier: "sealed" }
    })`
    )
    const registry = Registry.layerProject({ root }).pipe(Layer.provide(NodeServices.layer), Layer.orDie)
    const engine = NodeControl.engineDurable(root, registry)
    const catalog = refusal === undefined
      ? Layer.effect(
        Executable.Catalog,
        Executable.catalog({
          delegates: [delegate(kind)],
          load: () => Effect.succeed({ default: definition })
        })
      ).pipe(Layer.provide([registry, NodeServices.layer]), Layer.orDie)
      : Layer.succeed(Executable.Catalog, { executables: [], refused: [refusal] })
    const outcome = await Effect.runPromise(
      Effect.gen(function*() {
        engine.host.catalog = yield* Executable.Catalog
        const runtime = yield* ControlRuntime.ControlRuntime
        return yield* Effect.result(runtime.plan({ flowId: "native", input: {} }))
      }).pipe(
        Effect.provide([engine.runtime, catalog]),
        Effect.scoped,
        Effect.provide(Logger.layer([Logger.make((entry) => void logs.push(JSON.stringify(entry.message)))]))
      )
    )
    const database = new DatabaseSync(NodeControl.databasePath(root), { readOnly: true })
    try {
      return {
        outcome,
        logs: logs.join("\n"),
        plans: database.prepare("SELECT COUNT(*) AS count FROM control_plans").get()
      }
    } finally {
      database.close()
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

it.each(["message", "platform"])("redacts the complete load issue: %s", async (kind) => {
  const secret = "synthetic_load_issue_secret"
  const { outcome } = await onRuntime(
    "valid",
    new Executable.ExecutableError({
      code: "body_unavailable",
      flow: "native",
      available: [],
      message: `password=${secret}`,
      ...(kind === "platform" ?
        {
          cause: PlatformError.systemError({
            _tag: "PermissionDenied",
            module: "FileSystem",
            method: "readFile",
            description: `password=${secret}`,
            pathOrDescriptor: `/tmp/password=${secret}`
          })
        } :
        {})
    })
  )
  expect(outcome._tag).toBe("Failure")
  if (outcome._tag !== "Failure") return
  expect(outcome.failure).toMatchObject({ _tag: "/control/InvalidInput" })
  const issue = (outcome.failure as { readonly issue: string }).issue
  expect(issue).toContain("Cannot load flow native:")
  expect(issue).toContain("[REDACTED]")
  expect(issue).not.toContain(secret)
})

it.each(["walk", "compile"] as const)("does not log arbitrary planning exception content: %s", async (kind) => {
  const { logs } = await onRuntime(kind)
  expect(logs).toContain("could not walk its body")
  expect(logs).toContain("graph_build_failed")
  expect(logs).not.toContain("private planning document")
})

it.each(["walk", "compile"] as const)("refuses a plan whose graph cannot be produced: %s", async (kind) => {
  const { outcome, plans } = await onRuntime(kind)
  expect(outcome._tag).toBe("Failure")
  if (outcome._tag === "Failure") expect(outcome.failure).toMatchObject({ _tag: "/control/InvalidInput" })
  expect(plans).toEqual({ count: 0 })
})

it("still persists a valid nonempty plan", async () => {
  const { outcome, plans } = await onRuntime("valid")
  expect(outcome._tag).toBe("Success")
  if (outcome._tag === "Success") expect(outcome.success.card.nodes.length).toBeGreaterThan(0)
  expect(plans).toEqual({ count: 1 })
})
