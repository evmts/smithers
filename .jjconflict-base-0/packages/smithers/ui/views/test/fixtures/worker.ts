/**
 * A Cloudflare Worker that checks and renders a view, for the workerd test.
 *
 * workerd refuses to compile WebAssembly from bytes, so the Worker imports
 * the QuickJS module its toolchain compiled and names it through
 * `QuickJSVariant.layerVariant`, the seam the browser and Node fill with the
 * single-file build. Everything else is the code the other hosts run.
 */
import wasmfile from "@jitl/quickjs-wasmfile-release-sync"
import wasmModule from "@jitl/quickjs-wasmfile-release-sync/wasm"
import { QuickJSVariant } from "@smthrs/harness"
import { Effect } from "effect"
import type { QuickJSSyncVariant } from "quickjs-emscripten-core"
import { newVariant } from "quickjs-emscripten-core"
import { PresentationRealm, ViewCode } from "../../src/index.ts"

interface Env {
  readonly BUNDLE: string
}

interface Job {
  readonly source: string
  readonly props: unknown
  readonly state: unknown
  readonly event?: { readonly name: string; readonly arg?: string }
}

const variant = QuickJSVariant.layerVariant(newVariant(wasmfile as unknown as QuickJSSyncVariant, { wasmModule }))

export default {
  fetch: async (request: Request, env: Env): Promise<Response> => {
    const job = await request.json() as Job
    return Effect.gen(function*() {
      const realm = yield* PresentationRealm.make({ bundle: env.BUNDLE })
      const module = yield* ViewCode.check(job.source, { components: realm.components })
      const html = yield* realm.render({ module, props: job.props, state: job.state })
      const interacted = job.event === undefined
        ? undefined
        : yield* realm.interact({ module, props: job.props, state: job.state, event: job.event })
      return { html, interacted }
    }).pipe(
      Effect.scoped,
      Effect.provide(variant),
      Effect.map((body) => Response.json(body)),
      Effect.catch((error) => Effect.succeed(Response.json({ error }, { status: 422 }))),
      Effect.runPromise
    )
  }
}
