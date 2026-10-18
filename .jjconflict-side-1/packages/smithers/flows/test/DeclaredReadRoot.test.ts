/**
 * Issue #3911: a reuse step's declared exact reads are measured under the
 * workspace root `NodeRuntime.layerHost` was given, never the process working
 * directory.
 *
 * The step key folds the declared digests in as caller metadata, and before a
 * cross-run hit is served the engine re-measures them. The re-measure used to
 * resolve `docs/a.md` against `process.cwd()`, so a same-named file there with
 * the declared bytes passed the check and the engine served a result computed
 * from bytes the workspace no longer held. Each case below runs with the
 * process inside a directory holding a different `docs/a.md`; the body reads
 * the workspace copy through the step's own FileSystem, and the body's counter
 * decides whether the engine reused the step.
 */
import { afterAll, expect, it } from "@effect/vitest"
import * as Capability from "@smthrs/capability/Capability"
import * as Permission from "@smthrs/capability/Permission"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Action, Flow, Interpreter } from "../src/index.ts"
import * as NodeRuntime from "../src/NodeRuntime.ts"

const directory = mkdtempSync(join(tmpdir(), "flows-declared-read-root-"))
afterAll(() => rmSync(directory, { recursive: true, force: true }))

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex")

const plant = (root: string, text: string) => {
  mkdirSync(join(root, "docs"), { recursive: true })
  writeFileSync(join(root, "docs", "a.md"), text)
}

/**
 * One cache-eligible step that declares `docs/a.md` at `declared` and returns
 * what the step's FileSystem reads there, run twice over one host whose
 * workspace root is not the process working directory.
 */
const twice = (
  name: string,
  files: { readonly workspace: string; readonly cwd: string; readonly declared: string },
  between: (workspace: string) => void = () => {}
) => {
  const workspace = join(directory, name, "workspace")
  const cwd = join(directory, name, "cwd")
  plant(workspace, files.workspace)
  plant(cwd, files.cwd)
  const ran = { count: 0 }
  const Read = Action.make(`declared-read-root/${name}/read`, {
    payload: { path: Schema.String },
    success: Schema.String,
    implementationVersion: "1",
    fileBoundary: {
      readSet: [{ path: "docs/a.md", digest: sha256(files.declared) }],
      writeSet: [],
      boundaryMode: "hard"
    },
    idempotencyKey: ({ path }: { readonly path: string }) => `declared-read-root/${name}:${path}`
  })
  const Reader = Flow.make(`declared-read-root/${name}/flow`, {
    payload: { path: Schema.String },
    success: Schema.String,
    body: ({ path }) => Read.call({ path })
  })
  const registerFlows = Interpreter.layer(Reader).pipe(
    Layer.provideMerge(
      Read.toLayer(({ path }: { readonly path: string }) =>
        Effect.gen(function*() {
          ran.count += 1
          const fs = yield* FileSystem.FileSystem
          return yield* Effect.orDie(fs.readFileString(path))
        }), { implementationVersion: "1" })
    ),
    Layer.provideMerge(Action.layerImplementations)
  )
  const run = Effect.scoped(Effect.gen(function*() {
    const context = yield* Layer.build(NodeRuntime.layerHost(
      {
        filename: join(directory, name, "engine.sqlite"),
        workspaceRoot: workspace,
        owner: { hostId: name },
        signals: [],
        cacheEnvironment: { layers: ["flows/declared-read-root-test/v1"], capabilities: {} },
        rules: [
          new Permission.Rule({
            effect: "allow",
            pattern: new Capability.CapabilityPattern({ action: "fs:read", resource: `${workspace}/**` })
          })
        ]
      },
      registerFlows
    ))
    const first = yield* Reader.execute({ path: "docs/a.md" }, { executionId: `${name}-first` }).pipe(
      Effect.provide(context)
    )
    between(workspace)
    const second = yield* Reader.execute({ path: "docs/a.md" }, { executionId: `${name}-second` }).pipe(
      Effect.provide(context)
    )
    return { first, second, ran: ran.count }
  }))
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = process.cwd()
      process.chdir(cwd)
      return previous
    }),
    () => run,
    (previous) => Effect.sync(() => process.chdir(previous))
  )
}

it("re-runs a step whose workspace read changed though a same-named cwd file still matches", async () => {
  const settled = await Effect.runPromise(
    twice("changed", { workspace: "one", cwd: "one", declared: "one" }, (workspace) => plant(workspace, "two"))
  )

  // The declaration still says "one", the cwd copy still says "one", and the
  // workspace now says "two": the re-measure must refuse the hit.
  expect(settled).toEqual({ first: "one", second: "two", ran: 2 })
}, 120_000)

it("reuses a step whose declared read matches the workspace while a same-named cwd file differs", async () => {
  const settled = await Effect.runPromise(
    twice("matching", { workspace: "two", cwd: "one", declared: "two" })
  )

  expect(settled).toEqual({ first: "two", second: "two", ran: 1 })
}, 120_000)
