/**
 * `perf/github-freshness`: C-GH-07, how fast GitHub changes reach the install.
 *
 * A reference-host operator runner, never a product action: it writes the
 * canary repository as the second member and samples the install's
 * projections. `compare` checks the webhook-dropped phase against the inactive
 * one. Method: `github-freshness.md`.
 *
 * ```sh
 * smthrs flow start perf/github-freshness --data '{"config":"canary.json","directory":"evidence/inactive"}' --wait
 * smthrs flow start perf/github-freshness --data '{"compare":{"inactive":"a.json","dropped":"b.json"}}' --wait
 * ```
 *
 * Environment: `SMITHERS_FRESHNESS_GITHUB_TOKEN` and
 * `SMITHERS_FRESHNESS_INSTALL_TOKEN` for a run.
 *
 * @since 1.0.0
 */
import { Action, Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Schema } from "effect"
import { ModuleFailed, runModule } from "../../automation/run-module.ts"

/**
 * One phase's run, its `config` into a new evidence `directory`, or the
 * comparison of two phases' summaries; exactly one of the two.
 *
 * @since 1.0.0
 * @category models
 */
export const Request = Schema.Struct({
  config: Schema.optionalKey(Schema.NonEmptyString),
  directory: Schema.optionalKey(Schema.NonEmptyString),
  compare: Schema.optionalKey(Schema.Struct({ inactive: Schema.NonEmptyString, dropped: Schema.NonEmptyString }))
}).check(
  Schema.makeFilter((request) => {
    const valid = request.compare === undefined
      ? request.config !== undefined && request.directory !== undefined
      : request.config === undefined && request.directory === undefined
    return valid ? undefined : "give config and directory for a run, or compare alone"
  })
)

const implementationVersion = "perf/github-freshness/v1"

/**
 * Runs `github-freshness.mjs`.
 *
 * @since 1.0.0
 * @category actions
 */
export const Freshness = Action.make("perf/github-freshness/run", {
  implementationVersion,
  payload: Request,
  success: Schema.Void,
  error: ModuleFailed,
  nondeterministic: true
})

/**
 * The argument array `github-freshness.mjs` reads for a request.
 *
 * @since 1.0.0
 * @category utils
 */
export const argv = (request: typeof Request.Type): ReadonlyArray<string> =>
  request.compare !== undefined
    ? ["--compare", request.compare.inactive, request.compare.dropped]
    : [request.config ?? "", request.directory ?? ""]

/**
 * @since 1.0.0
 * @category layers
 */
export const layer = Freshness.toLayer(
  (request) => runModule(new URL("./github-freshness.mjs", import.meta.url), argv(request)),
  { implementationVersion }
)

export default Flow.make("perf/github-freshness", {
  description: "Measure GitHub-to-install freshness on the canary repository, or compare two webhook phases.",
  capabilities: [
    "fs:read:**",
    "fs:write:**",
    "proc:spawn:node *",
    "net:get:**",
    "net:post:**",
    "net:private:**"
  ],
  effects: { reads: ["**"], writes: ["**"], mode: "expected", onConflict: "serialize", tier: "irreversible" },
  modelInvocable: false,
  payload: Request,
  success: Schema.Void,
  error: ModuleFailed,
  body: Node.capture({ implementationVersion }, (request) => Freshness.call(request))
})
