/** Builds the test presentation bundle once per process, with React's legacy static renderer. */
import { build } from "esbuild"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)

/** `react-dom/server` without its streaming half, which needs `MessageChannel` and `TextEncoder`. */
export const legacyServer = join(
  dirname(require.resolve("react-dom/package.json")),
  "cjs/react-dom-server-legacy.browser.production.js"
)

let built: Promise<string> | undefined

/** The bundle's source, as one classic script. */
export const bundle = (): Promise<string> => {
  built ??= build({
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
      }
    }],
    logLevel: "silent"
  }).then((result) => result.outputFiles[0]!.text)
  return built
}
