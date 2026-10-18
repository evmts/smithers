// What the tab loads (decision 0011 §4, docs/features/flows.md#how-a-dispatch-runs): the page's module graph never
// reaches @smthrs/agent, @smthrs/std or a Node built-in. The agent runs in the engine worker, a bundle of its own
// (src/flows/engine.worker.ts → src/flows/registrations.ts); the tab dispatches by the registry's references. A tab that
// imports the agent fails before it renders: Vite stubs `node:` modules in the page, and the stub throws when read.
//
// The graph is esbuild's, as `packages/repo-targets/browser/browser-check.mjs` bundles the SDK's browser entry points:
// a browser bundle of src/main.tsx with the dev server's branches kept, so the end-to-end entry (`/app?faults`,
// src/test/e2e.ts) is walked too. Stylesheets are left out; the engine worker isn't imported, only started by URL.
import { build } from "esbuild"
import { isBuiltin } from "node:module"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

const app = join(import.meta.dirname, "../..")

/** What the tab must never import: the agent, its standard tools, and Node. */
const forbidden = (specifier: string) => isBuiltin(specifier) || /^@smthrs\/(agent|std)(\/|$)/.test(specifier)

/** Every import in `entry`'s browser module graph of something {@link forbidden}, as `<specifier> <- <importer>`. */
const reached = async (entry: string): Promise<ReadonlyArray<string>> => {
  const found = new Set<string>()
  await build({
    entryPoints: [entry],
    absWorkingDir: app,
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    logLevel: "silent",
    define: { "import.meta.env.DEV": "true" },
    plugins: [{
      name: "tab-graph",
      setup: (graph) => {
        graph.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, external: true }))
        graph.onResolve({ filter: /.*/ }, (args) => {
          if (forbidden(args.path)) found.add(`${args.path} <- ${args.importer.replace(`${app}/`, "")}`)
          // A Node built-in can't resolve for a browser: keep it out of the bundle, and keep walking.
          return isBuiltin(args.path) ? { path: args.path, external: true } : undefined
        })
      },
    }],
  })
  return [...found]
}

describe("the tab's modules", () => {
  test("the page never imports the agent, its standard tools or Node", async () => {
    expect(await reached("src/main.tsx")).toEqual([])
  })

  test("the check sees them where they are: the engine worker's registrations import the agent", async () => {
    expect(await reached("src/flows/registrations.ts")).toContainEqual(
      expect.stringMatching(/^@smthrs\/agent <- src\/features\/agent\//),
    )
  })
})
