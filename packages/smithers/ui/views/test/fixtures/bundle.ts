/** Builds the test presentation bundle once per process, with React's legacy static renderer, guarded. */
import { build } from "esbuild"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Presentation } from "../../src/index.ts"

const require = createRequire(import.meta.url)

/** `react-dom/server` without its streaming half, which needs `MessageChannel` and `TextEncoder`. */
export const legacyServer = join(
  dirname(require.resolve("react-dom/package.json")),
  "cjs/react-dom-server-legacy.browser.production.js"
)

const built = new Map<boolean, Promise<string>>()

/** The bundle's source, as one classic script; `guarded: false` leaves React's renderer as published. */
export const bundle = (options: { readonly guarded?: boolean } = {}): Promise<string> => {
  const guarded = options.guarded ?? true
  const cached = built.get(guarded)
  if (cached !== undefined) return cached
  const source = build({
    entryPoints: [fileURLToPath(new URL("./bundle-entry.ts", import.meta.url))],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2020",
    minify: true,
    legalComments: "none",
    define: { "process.env.NODE_ENV": "\"production\"" },
    plugins: [{
      name: "legacy-static-renderer",
      setup: (plugin) => {
        plugin.onResolve({ filter: /^react-dom\/server$/ }, () => ({ path: legacyServer }))
        if (!guarded) return
        plugin.onLoad({ filter: /react-dom-server-legacy\.browser\.production\.js$/ }, async (args) => ({
          contents: Presentation.guardRenderer(await readFile(args.path, "utf8")),
          loader: "js"
        }))
      }
    }],
    logLevel: "silent"
  }).then((result) => result.outputFiles[0]!.text)
  built.set(guarded, source)
  return source
}
