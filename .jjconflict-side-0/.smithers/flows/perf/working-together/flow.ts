/**
 * `perf/working-together`: the K1 to K8 working-together fault campaign
 * (C-DUR-04).
 *
 * With no suite it runs the Rust component suites with kill hooks, records the
 * integrated points as blocked, and exits 2 after component success. A suite
 * runs one boundary instead; `s2` runs every approved guest campaign in one
 * receipt. Component evidence never qualifies the integrated kill matrix.
 * Method: `README.md` beside this file.
 *
 * ```sh
 * smthrs flow start perf/working-together --data '{"suite":"components-only"}' --wait
 * smthrs flow start perf/working-together --data '{"suite":"wiki-only"}' --wait
 * ```
 *
 * Boundary suites read `.artifacts/working-together-host.json`; evidence goes
 * to fresh `.artifacts/checks/C-DUR-04` directories under the working directory.
 *
 * @since 1.0.0
 */
import { Action, Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Schema } from "effect"
import { ModuleFailed, runModule } from "../../automation/run-module.ts"

/**
 * One boundary suite, the S2 campaign, or (absent) the full component run.
 *
 * @since 1.0.0
 * @category models
 */
export const Suite = Schema.Literals([
  "components-only",
  "wiki-only",
  "code-only",
  "host-only",
  "watcher-only",
  "watcher-host-only",
  "session-only",
  "vm-only",
  "member-host-only",
  "s2"
])

/**
 * The campaign's command line. `receipt` prints the machine-readable receipt
 * line another host's S2 run reads.
 *
 * @since 1.0.0
 * @category models
 */
export const Request = Schema.Struct({
  suite: Schema.optionalKey(Suite),
  receipt: Schema.optionalKey(Schema.Boolean)
})

const implementationVersion = "perf/working-together/v1"

/**
 * Runs `faults.mjs`.
 *
 * @since 1.0.0
 * @category actions
 */
export const Faults = Action.make("perf/working-together/run", {
  implementationVersion,
  payload: Request,
  success: Schema.Void,
  error: ModuleFailed,
  nondeterministic: true
})

/**
 * The argument array `faults.mjs` reads for a request.
 *
 * @since 1.0.0
 * @category utils
 */
export const argv = (request: typeof Request.Type): ReadonlyArray<string> => [
  ...(request.suite === undefined ? [] : [`--${request.suite}`]),
  ...(request.receipt === true ? ["--receipt"] : [])
]

/**
 * @since 1.0.0
 * @category layers
 */
export const layer = Faults.toLayer(
  (request) => runModule(new URL("./faults.mjs", import.meta.url), argv(request)),
  { implementationVersion }
)

export default Flow.make("perf/working-together", {
  description: "Run the working-together fault campaign's component or boundary suites and retain C-DUR-04 evidence.",
  capabilities: [
    "fs:read:**",
    "fs:write:.artifacts/**",
    "proc:spawn:node *",
    "proc:spawn:git *",
    "proc:spawn:cargo *",
    "proc:spawn:go *",
    "proc:spawn:ssh *",
    "proc:spawn:scp *",
    "proc:spawn:rustc --version",
    "proc:spawn:/usr/sbin/sysctl *",
    "proc:spawn:/usr/bin/sw_vers *"
  ],
  effects: {
    reads: ["**"],
    writes: [".artifacts/**"],
    mode: "expected",
    onConflict: "serialize",
    tier: "irreversible"
  },
  modelInvocable: false,
  payload: Request,
  success: Schema.Void,
  error: ModuleFailed,
  body: Node.capture({ implementationVersion }, (request) => Faults.call(request))
})
