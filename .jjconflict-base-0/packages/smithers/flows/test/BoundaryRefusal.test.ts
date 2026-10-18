/**
 * Issue #4019: a hard file boundary that refuses a step reaches the caller as
 * the refusal itself.
 *
 * The engine records the refusal (`undeclared_read`, `undeclared_write`,
 * `missing_declared_output`) in the step's failed attempt. It is the engine's
 * own vocabulary, not the action's declared error, so it must never be decoded
 * through the action's error schema: an action with no `error` declares
 * `Never`, and that decode used to replace the refusal with
 * "SchemaError: Expected never" and drop the path. Each case runs one step on a
 * real `NodeRuntime.layerHost`, then asks a second host on the same database for
 * the same execution, which answers from the durable record.
 */
import { afterAll, expect, it } from "@effect/vitest"
import * as Capability from "@smthrs/capability/Capability"
import * as Permission from "@smthrs/capability/Permission"
import type { FileBoundary } from "@smthrs/flow/FileBoundary"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Action, Flow, Interpreter } from "../src/index.ts"
import * as NodeRuntime from "../src/NodeRuntime.ts"

const directory = mkdtempSync(join(tmpdir(), "flows-boundary-refusal-"))
afterAll(() => rmSync(directory, { recursive: true, force: true }))

/**
 * Runs one hard-boundary step with no `error` schema, twice: on a fresh host,
 * then on a second host over the same database and execution id.
 */
const runTwice = (
  name: string,
  fileBoundary: FileBoundary,
  body: Effect.Effect<string, never, FileSystem.FileSystem>
) => {
  const workspace = join(directory, name, "workspace")
  mkdirSync(workspace, { recursive: true })
  writeFileSync(join(workspace, "note.txt"), "note")
  const ran = { count: 0 }
  const Step = Action.make(`boundary-refusal/${name}/step`, {
    payload: {},
    success: Schema.String,
    fileBoundary
  })
  const Run = Flow.make(`boundary-refusal/${name}/flow`, {
    payload: {},
    success: Schema.String,
    body: () => Step.call({})
  })
  const flows = Interpreter.layer(Run).pipe(
    Layer.provideMerge(Step.toLayer(() => Effect.andThen(Effect.sync(() => ran.count++), body))),
    Layer.provideMerge(Action.layerImplementations)
  )
  const host = NodeRuntime.layerHost(
    {
      filename: join(directory, name, "engine.sqlite"),
      workspaceRoot: workspace,
      owner: { hostId: name },
      signals: [],
      rules: [
        new Permission.Rule({
          effect: "allow",
          pattern: new Capability.CapabilityPattern({ action: "fs:read", resource: `${workspace}/**` })
        }),
        new Permission.Rule({
          effect: "allow",
          pattern: new Capability.CapabilityPattern({ action: "fs:write", resource: `${workspace}/**` })
        })
      ]
    },
    flows
  )
  const once = Effect.scoped(
    Effect.flatMap(
      Layer.build(host),
      (context) => Run.execute({}, { executionId: name }).pipe(Effect.provide(context), Effect.exit)
    )
  )
  return Effect.gen(function*() {
    const fresh = yield* once
    const replayed = yield* once
    return { fresh, replayed, workspace, ran: ran.count }
  })
}

/**
 * Runs a refusal case and checks both answers carry the refusal: as the run's
 * one defect, with its tag, code and paths, and named in what the caller
 * prints. The second host answers from the durable record without running the
 * body again.
 */
const expectRefused = async (
  name: string,
  fileBoundary: FileBoundary,
  body: Effect.Effect<string, never, FileSystem.FileSystem>,
  expected: { readonly _tag: string; readonly code: string; readonly paths: ReadonlyArray<string> }
) => {
  const { fresh, ran, replayed, workspace } = await Effect.runPromise(runTwice(name, fileBoundary, body))
  expect(ran).toBe(1)
  for (const exit of [fresh, replayed]) {
    expect(exit).toMatchObject({
      _tag: "Failure",
      cause: { reasons: [{ _tag: "Die", defect: { ...expected, diffIdentity: expect.any(String) } }] }
    })
    const printed = Cause.pretty((exit as Exit.Failure<unknown, unknown>).cause)
    for (const text of [expected._tag, expected.code, ...expected.paths]) expect(printed).toContain(text)
    expect(printed).not.toContain("SchemaError")
  }
  expect(replayed).toEqual(fresh)
  return workspace
}

it("refuses an undeclared read with undeclared_read and its path, fresh and replayed", async () => {
  await expectRefused(
    "undeclared-read",
    { readSet: [], writeSet: [], boundaryMode: "hard" },
    Effect.flatMap(FileSystem.FileSystem, (fs) => Effect.orDie(fs.readFileString("note.txt"))),
    { _tag: "@smthrs/engine-store/UndeclaredRead", code: "undeclared_read", paths: ["note.txt"] }
  )
}, 120_000)

it("refuses an undeclared write with undeclared_write and its path, fresh and replayed", async () => {
  const workspace = await expectRefused(
    "undeclared-write",
    { readSet: [], writeSet: [], boundaryMode: "hard" },
    Effect.flatMap(FileSystem.FileSystem, (fs) => Effect.orDie(fs.writeFileString("stray.txt", "stray"))).pipe(
      Effect.as("wrote")
    ),
    { _tag: "@smthrs/engine-store/UndeclaredWrite", code: "undeclared_write", paths: ["stray.txt"] }
  )
  // A refused step never copies its writes back.
  expect(existsSync(join(workspace, "stray.txt"))).toBe(false)
}, 120_000)

it("refuses a declared write the step never made with missing_declared_output and its path", async () => {
  await expectRefused(
    "missing-output",
    { readSet: [], writeSet: ["out.txt"], boundaryMode: "hard" },
    Effect.succeed("skipped"),
    { _tag: "@smthrs/engine-store/MissingDeclaredOutput", code: "missing_declared_output", paths: ["out.txt"] }
  )
}, 120_000)

/**
 * The workspace root is not the process working directory here. Before #3911
 * the boundary measured declared writes under the working directory, so this
 * step failed `missing_declared_output` while `out.txt` sat in the workspace.
 */
it("settles a declared write the step made", async () => {
  const { fresh, workspace } = await Effect.runPromise(runTwice(
    "declared-write",
    { readSet: [], writeSet: ["out.txt"], boundaryMode: "hard" },
    Effect.flatMap(FileSystem.FileSystem, (fs) => Effect.orDie(fs.writeFileString("out.txt", "out"))).pipe(
      Effect.as("wrote")
    )
  ))
  expect(fresh).toEqual(Exit.succeed("wrote"))
  expect(readFileSync(join(workspace, "out.txt"), "utf8")).toBe("out")
}, 120_000)
