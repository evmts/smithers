/**
 * Hatch for `SandboxedFlow.vibe` (E-7/EK4402, C-9): `import.meta.url` and
 * `node:url` are platform APIs, which VibeLang code does not call directly,
 * and `import.meta` in a `.vibe` module is TS1470 (C-9). The function is the
 * source's `runnerPath`.
 *
 * Twin layout: a `.vibe` module runs only as the JavaScript the compiler
 * emits into its `src-vibe` directory, so the development runner is the
 * emitted sibling `internal/SandboxedFlowGuest.js`, as the source's `.ts`
 * arm names the TypeScript sibling. A release still takes the built ESM
 * runner.
 */
import { fileURLToPath } from "node:url"

/**
 * The source runner in development, and the built ESM runner in a release.
 * The guest is always bundled as ESM, including when its host uses CommonJS;
 * feeding the CJS runner to that bundle would leave Node built-in requires
 * without a require function in the isolated guest.
 */
export const runnerPath = (): string => {
  const here = import.meta.url
  /* v8 ignore next -- release smoke executes the built arm through both module conditions */
  const runner = here.includes("/src-vibe/") ? "./internal/SandboxedFlowGuest.js" : "../esm/internal/SandboxedFlowGuest.js"
  return fileURLToPath(new URL(runner, here))
}
