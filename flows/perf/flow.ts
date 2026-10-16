/**
 * `perf`: installed-product performance evidence, C-PERF-01 through C-PERF-06.
 *
 * With no payload the runner measures every budget it can and names the rest
 * unavailable; `check` selects one budget. The keystroke, disk-write, warm-wake
 * and rebase-hold workloads run only through the runner, which decides their
 * activation. `driver` runs the first-token or projection workload directly on
 * the second Mac. Methods: `flows/perf/README.md`.
 *
 * ```sh
 * smthrs flow start perf --wait
 * smthrs flow start perf --data '{"check":"C-PERF-03"}' --wait
 * smthrs flow start perf --data '{"driver":"projection-delta"}' --wait
 * ```
 *
 * Environment: `SMITHERS_PERF_ORIGIN`, `SMITHERS_PERF_OWNER_COOKIE` or
 * `SMITHERS_PERF_TOKEN`, `SMITHERS_PERF_INSTALL_VERSION`, and each workload's
 * own variables in the README. A run exits 2 while any budget is incomplete.
 *
 * @since 1.0.0
 */
import { Action, Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Schema } from "effect"
import { ModuleFailed, runModule } from "../automation/run-module.ts"

/**
 * The six release budgets.
 *
 * @since 1.0.0
 * @category models
 */
export const Check = Schema.Literals(["C-PERF-01", "C-PERF-02", "C-PERF-03", "C-PERF-04", "C-PERF-05", "C-PERF-06"])

/**
 * The runner over every budget or one `check`, or a standalone second-Mac
 * `driver`; never both.
 *
 * @since 1.0.0
 * @category models
 */
export const Request = Schema.Struct({
  check: Schema.optionalKey(Check),
  driver: Schema.optionalKey(Schema.Literals(["agent-first-token", "projection-delta"]))
}).check(
  Schema.makeFilter((request) =>
    request.check !== undefined && request.driver !== undefined
      ? "a driver measures its own budget; give check or driver, not both"
      : undefined
  )
)

const implementationVersion = "perf/v1"

/**
 * Runs `run.mjs`, or the selected driver.
 *
 * @since 1.0.0
 * @category actions
 */
export const Measure = Action.make("perf/run", {
  implementationVersion,
  payload: Request,
  success: Schema.Void,
  error: ModuleFailed,
  nondeterministic: true
})

/**
 * The module and argument array a request runs.
 *
 * @since 1.0.0
 * @category utils
 */
export const entry = (request: typeof Request.Type): { readonly module: string; readonly argv: ReadonlyArray<string> } =>
  request.driver !== undefined
    ? { module: `./${request.driver}.mjs`, argv: [] }
    : { module: "./run.mjs", argv: request.check === undefined ? [] : [request.check] }

/**
 * @since 1.0.0
 * @category layers
 */
export const layer = Measure.toLayer(
  (request) => {
    const { module, argv } = entry(request)
    return runModule(new URL(module, import.meta.url), argv)
  },
  { implementationVersion }
)

export default Flow.make("perf", {
  description: "Measure installed-product latency budgets C-PERF-01 to C-PERF-06 and retain their evidence.",
  capabilities: [
    "fs:read:**",
    "fs:write:**",
    "proc:spawn:node *",
    "proc:spawn:jj *",
    "proc:spawn:/usr/bin/ssh *",
    "proc:spawn:/usr/bin/ssh-keygen *",
    "net:get:**",
    "net:post:**",
    "net:private:**"
  ],
  effects: { reads: ["**"], writes: ["**"], mode: "expected", onConflict: "serialize", tier: "irreversible" },
  modelInvocable: false,
  payload: Request,
  success: Schema.Void,
  error: ModuleFailed,
  body: Node.capture({ implementationVersion }, (request) => Measure.call(request))
})
