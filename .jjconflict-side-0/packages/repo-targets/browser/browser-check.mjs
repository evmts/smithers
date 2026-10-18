/**
 * The browser contract, executed.
 *
 * Browser support is a hard requirement of this repository, and it is met the
 * only way an Effect codebase can meet it: platform access lives in layers, and
 * the entry points that expose contracts never statically resolve a `node:`
 * built-in. This script pins both halves of that promise.
 *
 * `BROWSER_SAFE` entries MUST bundle under `--platform=browser`, and again with
 * the conditions a Cloudflare Worker build resolves (`workerd`, `worker`,
 * `browser`, as wrangler passes them). Neither bundle may hold host access the
 * bundler cannot see (`../src/HiddenHostAccess.ts`): a dynamic `import()` or
 * `require()` whose specifier is an expression, or a `process.getBuiltinModule`
 * call that is not feature detection. The first shape is how `@smthrs/sandbox`,
 * and with it the `@smthrs/flows` root, carried Node-only jj code past this
 * gate. A module the platform rule governs, a workspace package's outside
 * `HOST_PACKAGES`, is held further: no `getBuiltinModule` call at all, no read
 * of the ambient `process`, `Bun` or `Deno` global, and no `node:` or `bun:`
 * specifier, unless `KNOWN_HOST_ACCESS` lists that module and kind. A listed
 * kind no bundle reports any more fails too, so the list only shrinks.
 *
 * `BROWSER_SAFE` entries MUST also load in a dedicated web worker, where an app
 * runs its engine and agent: no `document`, no `window`, no DOM at all. Each is
 * bundled the two ways a worker build resolves it, with the `worker` and
 * `browser` conditions and, as Vite builds a worker, with `browser` alone, and
 * with tree shaking off, because a dev server evaluates every module an entry
 * reaches. The bundle is then imported in a Node worker thread given the
 * worker's `self`. A load that throws fails; one that names a DOM global is
 * reported as such. `decode-named-character-reference`, reached from the
 * `@smthrs/agent` root through `@mdx-js/mdx`, called `document` while it loaded
 * under `browser`, and killed the app's engine worker past every other check.
 *
 * `NODE_ONLY` entries MUST still fail, and fail only
 * because a documented `node:` built-in is unresolvable — so a Node dependency
 * can neither creep into a browser entry point nor silently disappear from a
 * documented Node-only one without this gate saying so.
 *
 * Run it with `pnpm run browser` from the repository root.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { Worker } from "node:worker_threads"

import { BROWSER_SAFE, governed, KNOWN_HOST_ACCESS, NODE_ONLY } from "./browser-contract.mjs"
import { repoRoot } from "../scripts/workspace-packages.mjs"
import { hiddenHostAccess } from "../src/HiddenHostAccess.ts"

const esbuild = await import("esbuild").catch((cause) => {
  console.error("browser-check needs esbuild from the workspace toolchain — run `pnpm install` first.")
  console.error(cause)
  process.exit(1)
})

/** The two resolutions a browser entry point must survive: a browser's, and a Worker's as wrangler builds it. */
const targets = [
  { label: "browser", conditions: [] },
  { label: "worker", conditions: ["workerd", "worker", "browser"] }
]

/**
 * The resolutions a dedicated web worker gets: with the `worker` condition, and
 * with `browser` alone, as Vite builds one.
 */
const webWorkers = [
  { label: "web worker", conditions: ["worker", "browser"] },
  { label: "web worker, browser condition only (Vite)", conditions: [] }
]

const bundle = (entry, conditions = [], treeShaking = true) =>
  esbuild.build({
    entryPoints: [resolve(repoRoot, entry)],
    absWorkingDir: repoRoot,
    bundle: true,
    write: false,
    platform: "browser",
    conditions,
    format: "esm",
    target: "es2022",
    logLevel: "silent",
    treeShaking
  })

/** Globals a window has and a dedicated worker does not. */
const domGlobals = /^(?:document|window|localStorage|sessionStorage|HTMLElement|Element|Node|DOMParser|customElements|history|alert) is not defined$/

/** A worker thread that adopts the worker's `self`, imports one bundle, and reports how the load ended. */
const workerLoader = `
const { parentPort, workerData } = require("node:worker_threads")
globalThis.self = globalThis
import(workerData.url).then(
  () => parentPort.postMessage({ ok: true }),
  (error) => parentPort.postMessage({ ok: false, name: String(error?.name), message: String(error?.message ?? error) })
)`

/** Imports the bundle at `file` in a fresh DOM-less worker thread. */
const loadInWorker = (file) =>
  new Promise((settle) => {
    const worker = new Worker(workerLoader, { eval: true, workerData: { url: pathToFileURL(file).href } })
    const timer = setTimeout(() => {
      void worker.terminate()
      settle({ ok: false, name: "Timeout", message: "did not finish loading in 60 s" })
    }, 60_000)
    const done = (outcome) => {
      clearTimeout(timer)
      void worker.terminate()
      settle(outcome)
    }
    worker.once("message", done)
    worker.once("error", (error) => done({ ok: false, name: error.name, message: error.message }))
  })

const kilobytes = (bytes) => `${(bytes / 1024).toFixed(1)} kB`

/** An esbuild error is an unresolved `node:` built-in for `module`. */
const isUnresolved = (error, module) =>
  error.text.includes(`Could not resolve "${module}"`) ||
  (error.notes ?? []).some((note) => note.text.includes(`The package "${module}"`))

/** Every esbuild error is an unresolved host built-in: `node:`, or `bun:` in a Bun host. */
const isNodeBuiltinOnly = (errors) => errors.every((error) => /Could not resolve "(?:node|bun):/.test(error.text))

/** esbuild errors, at most five, one indented line each. */
const detail = (errors) => {
  const shown = errors.slice(0, 5).map((error) => {
    const where = error.location ? ` (${error.location.file}:${error.location.line})` : ""
    return `  ${error.text}${where}`
  })
  return errors.length > 5 ? [...shown, `  …and ${errors.length - 5} more`] : shown
}

/** Whatever esbuild rejected with, as an error list. */
const errorsOf = (rejection) =>
  Array.isArray(rejection?.errors) && rejection.errors.length > 0
    ? rejection.errors
    : [{ text: String(rejection?.message ?? rejection) }]

const failures = []

/** The kinds `KNOWN_HOST_ACCESS` lists for each module. */
const known = new Map(KNOWN_HOST_ACCESS.map(({ kinds, module }) => [module, new Set(kinds)]))
/** `<module> <kind>` for every listed access some bundle still reports. */
const reported = new Set()

for (const { entry, name } of BROWSER_SAFE) {
  for (const { conditions, label } of targets) {
    let result
    try {
      result = await bundle(entry, conditions)
    } catch (rejection) {
      failures.push(
        `${name} is a browser entry point but does not bundle for a ${label}:`,
        ...detail(errorsOf(rejection))
      )
      continue
    }
    const hidden = result.outputFiles.flatMap((file) => hiddenHostAccess(file.text, governed)).filter((access) => {
      if (!known.get(access.module)?.has(access.kind)) return true
      reported.add(`${access.module} ${access.kind}`)
      return false
    })
    if (hidden.length > 0) {
      failures.push(
        `${name} bundles for a ${label} but reaches the host where the bundler cannot see it:`,
        ...hidden.slice(0, 5).map((access) => `  ${access.kind} ${access.call} (${access.module})`),
        ...(hidden.length > 5 ? [`  …and ${hidden.length - 5} more`] : [])
      )
      continue
    }
    const bytes = result.outputFiles.reduce((total, file) => total + file.contents.byteLength, 0)
    console.log(`${label.padEnd(7)} ok    ${name} (${relative(repoRoot, entry)}, ${kilobytes(bytes)})`)
  }
}

const scratch = mkdtempSync(join(tmpdir(), "browser-check-worker-"))
try {
  for (const [index, { entry, name }] of BROWSER_SAFE.entries()) {
    for (const { conditions, label } of webWorkers) {
      let result
      try {
        result = await bundle(entry, conditions, false)
      } catch (rejection) {
        failures.push(`${name} does not bundle for a ${label}:`, ...detail(errorsOf(rejection)))
        continue
      }
      const file = join(scratch, `${index}-${conditions.length}.mjs`)
      writeFileSync(file, result.outputFiles[0].contents)
      const loaded = await loadInWorker(file)
      if (loaded.ok) {
        console.log(`${"worker".padEnd(7)} loads ${name} in a ${label}`)
      } else if (loaded.name === "ReferenceError" && domGlobals.test(loaded.message)) {
        failures.push(
          `${name} touches the DOM while it loads in a ${label}, which has none:`,
          `  ${loaded.name}: ${loaded.message}`
        )
      } else {
        failures.push(`${name} fails to load in a ${label}:`, `  ${loaded.name}: ${loaded.message}`)
      }
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

for (const { kinds, module } of KNOWN_HOST_ACCESS) {
  for (const kind of kinds) {
    if (reported.has(`${module} ${kind}`)) continue
    failures.push(
      `${module} is listed in KNOWN_HOST_ACCESS for ${kind}, but no browser bundle reports it there any more.`,
      "  Remove it from the list and from docs/libraries.md."
    )
  }
}

for (const { entry, expect, name, reason } of NODE_ONLY) {
  let bundled = false
  try {
    await bundle(entry)
    bundled = true
  } catch (rejection) {
    const errors = errorsOf(rejection)
    if (!isNodeBuiltinOnly(errors)) {
      failures.push(
        `${name} is documented Node-only, but it fails for a reason other than a node: or bun: built-in:`,
        ...detail(errors)
      )
    } else if (!errors.some((error) => isUnresolved(error, expect))) {
      failures.push(
        `${name} is documented Node-only because of ${expect}, but that import is gone.`,
        "  Update the docs and this list.",
        ...detail(errors)
      )
    } else {
      console.log(`node only     ${name} (${expect}: ${reason})`)
    }
  }
  if (bundled) {
    failures.push(
      `${name} is documented Node-only, but it now bundles for the browser.`,
      "  Promote it to BROWSER_SAFE and fix the docs."
    )
  }
}

if (failures.length > 0) {
  console.error("")
  console.error("browser contract violated:")
  for (const failure of failures) console.error(failure)
  process.exitCode = 1
} else {
  console.log("")
  console.log(
    `browser contract holds: ${BROWSER_SAFE.length} browser entry points, each for a browser and a Worker and loaded in a web worker, ${NODE_ONLY.length} Node-only.`
  )
}
