/// <reference path="./quickjs-wasm.d.ts" />
import wasmfile from "@jitl/quickjs-wasmfile-release-sync"
import { Agent } from "@smthrs/agent"
import { QuickJSVariant, Sandbox } from "@smthrs/harness"
import { Effect, Layer } from "effect"
import { newVariant, type QuickJSSyncVariant } from "quickjs-emscripten-core"

// The cell sandbox the `todo` run's agent runs its cells in on Cloudflare (worker/flows/TodoAgent.ts): `@smthrs/agent`'s
// defaults over the QuickJS build with a separate `.wasm` file, and no steering.
//
// workerd refuses to compile WebAssembly from bytes, so the single-file build `Agent.layerDefaults` compiles can't run
// here ("Wasm code generation disallowed by embedder"). It instantiates only a module its toolchain compiled: Alchemy's
// bundler uploads any import whose specifier ends in `.wasm` as a CompiledWasm module and hands the Worker its
// `WebAssembly.Module`. `#quickjs.wasm` is that specifier, mapped to the build's `.wasm` file by package.json `imports`.
//
// The import is dynamic and runs only when the layer is built, inside the Durable Object: `alchemy dev` imports the
// stack (alchemy.run.ts, then ChatApi and this file) in Node, where a static `.wasm` import loads the file as a
// WebAssembly ES module and fails on its emscripten imports ("Cannot find package 'a'").

/**
 * The separate-file build, whose emscripten glue has a `workerd` export condition. The package's one `types` entry
 * names its CommonJS declaration, so TypeScript models this import as `module.exports`; the bundler hands over the
 * variant itself.
 */
const base = wasmfile as unknown as QuickJSSyncVariant

/** The agent's sandbox over the build whose module `load` gives, failing as the sandbox fails when it can't load. */
export const layerFrom = (load: () => Promise<{ readonly default: WebAssembly.Module }>) =>
  Layer.unwrap(
    Effect.tryPromise({
      try: load,
      catch: (cause) =>
        new Sandbox.SandboxError({ code: "runtime_failed", message: "QuickJS WebAssembly module could not be loaded", cause }),
    }).pipe(
      Effect.map(({ default: wasmModule }) =>
        Agent.layerDefaultsWithVariant.pipe(Layer.provide(QuickJSVariant.layerVariant(newVariant(base, { wasmModule }))))
      ),
    ),
  )

/** The agent's sandbox on Cloudflare: the module the bundle compiled. */
export const layer = layerFrom(() => import("#quickjs.wasm"))
