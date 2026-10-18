/** The QuickJS builds the tests provide: the single-file build Node and a browser compile. */
import singlefile from "@jitl/quickjs-singlefile-browser-release-sync"
import { QuickJSVariant } from "@smthrs/harness"
import type { QuickJSSyncVariant } from "quickjs-emscripten-core"

/**
 * The package publishes one `types` entry for every export condition and it
 * names the CommonJS declaration, so TypeScript models the default import as
 * `module.exports`; Node and every bundler hand over the variant itself.
 */
export const layerSingleFile = QuickJSVariant.layerVariant(singlefile as unknown as QuickJSSyncVariant)
