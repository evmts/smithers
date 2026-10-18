/**
 * `MinifiedAnswerFlow.ts` as a production bundle ships it: bundled and
 * minified by esbuild, the minifier Wrangler deploys with.
 *
 * The packages the flow imports are not bundled. They resolve to the test's
 * own module instances, so the bundle's actions and flow run on the engine
 * the test composes, exactly as an application's bundle runs on the engine
 * package it imports.
 *
 * @since 1.0.0
 */
import * as FlowPackage from "@smthrs/flow"
import * as PlanPackage from "@smthrs/plan"
import * as EffectPackage from "effect"
import * as esbuild from "esbuild"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import type * as Fixture from "./MinifiedAnswerFlow.ts"

/** Where the bundle finds the host's packages. */
const host = "@smthrs/engine-store/test/MinifiedBuild"

const packages: Readonly<Record<string, unknown>> = {
  "@smthrs/flow": FlowPackage,
  "@smthrs/plan": PlanPackage,
  effect: EffectPackage
}

/**
 * Code a later build adds beside the flow and shares nothing with it. Its
 * bindings are used often enough to take the shortest names, so the
 * minifier hands the flow's bindings other ones.
 */
export const unrelated = `
export const tally = (alpha: number, beta: number, gamma: number) => {
  const delta = alpha * beta
  const epsilon = delta + gamma
  let zeta = 0
  for (let eta = 0; eta < epsilon; eta++) zeta += eta * delta - gamma
  return [delta, epsilon, zeta, alpha, beta, gamma, delta, epsilon, zeta].map((theta) => theta + delta + epsilon)
}
export const tallies = [1, 2, 3, 4, 5].map((iota) => (kappa: number) => kappa + iota + tally(iota, kappa, 1)[0]!)
`

/** One build of the fixture: its flow and the actions it calls. */
export type Build = typeof Fixture

/**
 * Bundles and minifies the fixture.
 *
 * `beside` is code the build adds next to the flow. `edit` rewrites the
 * fixture's source before it is bundled, for a build that really changed the
 * flow.
 */
export const build = async (options: {
  readonly beside?: string
  readonly edit?: (source: string) => string
} = {}): Promise<Build> => {
  const fixture = fileURLToPath(new URL("./MinifiedAnswerFlow.ts", import.meta.url))
  const output = await esbuild.build({
    stdin: {
      contents: `${options.beside ?? ""}\nexport * from ${JSON.stringify(fixture)}`,
      resolveDir: fileURLToPath(new URL(".", import.meta.url)),
      loader: "ts"
    },
    bundle: true,
    minify: true,
    format: "iife",
    globalName: "minified",
    platform: "neutral",
    write: false,
    logLevel: "silent",
    plugins: [{
      name: "host-packages",
      setup: (bundler) => {
        bundler.onResolve(
          { filter: /^(@smthrs\/flow|@smthrs\/plan|effect)$/ },
          (args) => ({ path: args.path, namespace: "host" })
        )
        bundler.onLoad({ filter: /.*/, namespace: "host" }, (args) => ({
          contents: `module.exports = globalThis[Symbol.for(${JSON.stringify(host)})][${JSON.stringify(args.path)}]`,
          loader: "js"
        }))
        const edit = options.edit
        if (edit !== undefined) {
          bundler.onLoad({ filter: /MinifiedAnswerFlow\.ts$/ }, async (args) => ({
            contents: edit(await readFile(args.path, "utf8")),
            loader: "ts"
          }))
        }
      }
    }]
  })
  Reflect.set(globalThis, Symbol.for(host), packages)
  return new Function(`${output.outputFiles[0]!.text};return minified`)() as Build
}
