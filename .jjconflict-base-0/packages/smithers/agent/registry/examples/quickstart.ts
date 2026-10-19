/**
 * The quickstart end to end: write two markdown flows into a scratch
 * project, build the registry from one ordered source, read the catalog and
 * its warnings, render the model-facing catalog, and render the prompt a
 * model receives. Runs over the real filesystem in a temporary directory.
 */
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodePath from "@effect/platform-node/NodePath"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Disclosure from "../src/Disclosure.ts"
import * as Discovery from "../src/Discovery.ts"
import * as Registry from "../src/Registry.ts"

/** Discovery is portable, so the host supplies the filesystem it walks. */
const platform = Layer.merge(NodeFileSystem.layer, NodePath.layer)
const discovery = Discovery.layer.pipe(Layer.provide(platform))

const review = `---
description: Reviews a proposed change and reports concrete correctness and maintainability risks.
capabilities: ["fs:read:**"]
---

Review the supplied change. Report only findings you can point at a line for.
`

// No description, so discovery refuses it with a warning instead of failing.
const draft = `---
name: draft
---

This flow is missing the description discovery requires.
`

/** Discovers a scratch project's flows and answers what the registry reports. */
export const quickstart = (): Promise<{
  readonly root: string
  readonly catalog: ReadonlyArray<{ readonly name: string; readonly tier: string; readonly invocable: boolean }>
  readonly warnings: ReadonlyArray<{ readonly code: string; readonly path: string }>
  readonly xml: string
  readonly prompt: string
}> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "registry-quickstart-" })
    yield* fs.makeDirectory(`${root}/.smithers/flows/review`, { recursive: true })
    yield* fs.makeDirectory(`${root}/.smithers/flows/draft`, { recursive: true })
    yield* fs.writeFileString(`${root}/.smithers/flows/review/flow.mdx`, review)
    yield* fs.writeFileString(`${root}/.smithers/flows/draft/flow.mdx`, draft)

    // One source: the project's own flows, named by their path below the root.
    const registry = Registry.layer({
      sources: [{ source: "project", root: `${root}/.smithers/flows`, naming: "path" }]
    }).pipe(Layer.provide([discovery, platform]))

    return yield* Effect.gen(function*() {
      const catalog = yield* Registry.Registry
      // `list`, `visible` and `warnings` answer from one snapshot and touch no files.
      const entries = yield* catalog.list()
      const warnings = yield* catalog.warnings()
      // `runPrompt` rereads the body, checks it against the digest discovery
      // recorded, and renders it the way an agent host does.
      const prompt = yield* catalog.runPrompt("review", { args: "the staged diff" })
      return {
        root,
        catalog: entries.map((entry) => ({
          name: entry.name,
          tier: entry.effects.tier,
          invocable: entry.modelInvocable
        })),
        warnings: warnings.map(({ code, path }) => ({ code, path })),
        xml: Disclosure.toXml(yield* catalog.visible()),
        prompt
      }
    }).pipe(Effect.provide(registry))
  }).pipe(Effect.scoped, Effect.provide(platform), Effect.runPromise)
