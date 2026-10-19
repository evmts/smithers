// E-7, A-2/E-4: invoke/serve.ts's filesystem work and its CLI boundary. registerPinnedLibraries
// writes files and symlinks (node:fs), verbatim; `cli` is the `if (import.meta.main)` block, which
// reads argv, the environment and files, imports the Bun host, and runs the host or one RPC with
// runMain or runPromise. serve.vibe holds the two programs it runs and passes them in.
import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http"
import { RpcClient, RpcSerialization } from "effect/rpc"
import * as Flow from "@smthrs/flow"
import * as Plan from "@smthrs/plan"
import * as EffectModules from "effect"
import { mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import type * as NativeControl from "../../../../packages/smithers/src/internal/NativeControl.ts"
import { layer } from "./host.vibe"

/** Resolve declarations against this bundle without installing project dependencies. */
export const registerPinnedLibraries = (root: string, stateRoot: string) => {
  const modules: Record<string, object> = { "@smthrs/flow": Flow, "@smthrs/plan": Plan, effect: EffectModules }
  const identity = "smithers.invoke.pinned-libraries"
  Object.defineProperty(globalThis, Symbol.for(identity), { value: modules, configurable: false })
  // Bun runtime plugins do not intercept these bare imports on supported hosts.
  // Tiny ESM aliases expose the very same bundled objects (including schema and
  // registration symbols). No second package instance or downloaded code exists.
  const shim = (module: object, access: string) => {
    const bindings = Object.keys(module).filter((key) => /^[A-Za-z_$][\w$]*$/.test(key))
    return `const m = globalThis[Symbol.for(${JSON.stringify(identity)})]${access};\n` +
      bindings.map((key, index) => `const v${index} = m[${JSON.stringify(key)}]; export { v${index} as ${key} };`).join(
        "\n"
      ) + "\n"
  }
  for (const [name, module] of Object.entries(modules)) {
    const directory = join(stateRoot, "libraries", name)
    mkdirSync(directory, { recursive: true })
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({ name, type: "module", exports: { ".": "./index.mjs", "./*": "./*.mjs" } })
    )
    writeFileSync(join(directory, "index.mjs"), shim(module, `[${JSON.stringify(name)}]`))
    for (const [key, child] of Object.entries(module)) {
      if (
        /^[A-Za-z_$][\w$]*$/.test(key) && child !== null && (typeof child === "object" || typeof child === "function")
      ) {
        writeFileSync(join(directory, `${key}.mjs`), shim(child, `[${JSON.stringify(name)}][${JSON.stringify(key)}]`))
      }
    }
    const target = join(root, "node_modules", name)
    mkdirSync(dirname(target), { recursive: true })
    try {
      symlinkSync(directory, target, "dir")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || realpathSync(target) !== realpathSync(directory)) {
        throw new Error(`Pinned invocation library conflicts with repository dependency ${name}`, { cause: error })
      }
    }
  }
}

/** The host program `serve` runs: the gateway on 127.0.0.1:3011 over this invocation's layer. */
export type Host = (
  platform: NativeControl.Platform,
  root: string,
  credential: string,
  invocation: ReturnType<typeof layer>
) => Effect.Effect<unknown, unknown, never>
/** The program `rpc` runs: one procedure through an RPC client for its protocol. */
export type Call = (
  procedure: string,
  payload: any,
  projection: boolean
) => Effect.Effect<unknown, unknown, RpcClient.Protocol | import("effect").Scope.Scope>

export const cli = async (host: Host, call: Call): Promise<void> => {
  const command = process.argv[2]
  if (command === "--version") {
    console.log("smithers-invoke-host 1.0.0-rc.0")
  } else if (command === "--help") {
    console.log("smithers-invoke-host serve | rpc <procedure> <base64-json>")
  } else {
    const root = resolve(process.env.SMITHERS_INVOKE_ROOT ?? "/workspace/repo")
    const stateRoot = resolve(process.env.SMITHERS_INVOKE_STATE ?? "/var/lib/smithers-invoke")
    const credential = readFileSync(resolve(stateRoot, "credential"), "utf8").trim()
    if (!credential) throw new Error("Invocation credential is missing")
    if (command === "serve") {
      // Project declarations use the pinned bundled public libraries. Relative
      // imports still use the Registry's verified source loader.
      if (!("Bun" in globalThis)) throw new Error("The staged invocation host requires Bun")
      registerPinnedLibraries(root, stateRoot)
      const [{ platform }, runtime] = await Promise.all([
        import("../../../../packages/smithers/src/internal/BunControl.ts"),
        import("@effect/platform-bun/BunRuntime")
      ])
      runtime.runMain(
        host(
          platform,
          root,
          credential,
          layer(platform, {
            root,
            stateRoot,
            credential,
            flow: process.env.SMITHERS_INVOKE_FLOW ?? "",
            sourceDigest: process.env.SMITHERS_INVOKE_SOURCE_SHA256 ?? ""
          })
        )
      )
    } else if (command === "rpc") {
      const procedure = process.argv[3] ?? "", raw = process.argv[4] ?? ""
      if (!["Plan", "Approval.Submit", "Run", "List", "Cancel", "Projection.Snapshot"].includes(procedure)) {
        throw new Error("Unsupported invocation procedure")
      }
      const payload = JSON.parse(Buffer.from(raw, "base64").toString("utf8"))
      const projection = procedure === "Projection.Snapshot" || procedure === "Approval.Submit"
      const protocol = RpcClient.layerProtocolHttp({
        url: `http://127.0.0.1:3011${projection ? "/projections" : "/rpc"}`,
        transformClient: (client) => HttpClient.mapRequest(client, HttpClientRequest.bearerToken(credential))
      }).pipe(
        Layer.provide([FetchHttpClient.layer, RpcSerialization.layerNdjson])
      )
      const result = await Effect.runPromise(
        call(procedure, payload, projection).pipe(Effect.provide(protocol), Effect.scoped, Effect.timeout("20 seconds"))
      )
      process.stdout.write(JSON.stringify(result) + "\n")
    } else throw new Error("Expected serve or rpc")
  }
}
