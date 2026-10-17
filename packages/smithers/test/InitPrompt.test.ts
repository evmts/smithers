/** New file flows import prompt content through the measured module closure. */
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodePath from "@effect/platform-node/NodePath"
import * as Discovery from "@smthrs/registry/Discovery"
import { Effect, Layer } from "effect"
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"
import * as Init from "../src/Init.ts"

it("scaffolds a typed imported prompt included in the approved source closure", async () => {
  const root = mkdtempSync(join(tmpdir(), "smithers-init-prompt-"))
  try {
    symlinkSync(fileURLToPath(new URL("../node_modules", import.meta.url)), join(root, "node_modules"), "dir")
    const created = Init.scaffold(root, "draft", {})
    const scan = () =>
      Effect.runPromise(
        Effect.gen(function*() {
          const discovery = yield* Discovery.Discovery
          return yield* discovery.scan({ source: "project", root: join(root, ".smithers", "flows"), naming: "path" })
        }).pipe(Effect.provide(Discovery.layer.pipe(Layer.provide(Layer.merge(NodeFileSystem.layer, NodePath.layer)))))
      )
    const result = await scan()
    expect(result.warnings).toEqual([])
    const descriptor = result.entries[0]!
    expect(descriptor.body._tag).toBe("Module")
    if (descriptor.body._tag !== "Module") throw new Error("Expected a module")
    expect(descriptor.body.imports?.some((entry) => entry.path === "prompt.mdx")).toBe(true)
    const prompt = join(root, ".smithers/flows/draft/prompt.mdx")
    const authored = "Custom instructions.\n"
    writeFileSync(prompt, authored)
    expect(Init.scaffold(root, "draft", {}).created).toBe(false)
    expect(readFileSync(prompt, "utf8")).toBe(authored)
    const refreshed = (await scan()).entries[0]!
    expect(refreshed.body).not.toEqual(descriptor.body)
    expect(readFileSync(created.flowFile, "utf8")).toContain("import Instructions from \"./prompt.mdx\"")
    expect(readFileSync(join(root, ".smithers/flows/draft/prompt.d.mdx.ts"), "utf8")).toContain(
      "readonly args?: string"
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
