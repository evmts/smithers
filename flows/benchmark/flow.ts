import { Action, Flow, Interpreter } from "@smthrs/flow"
import { Bounded } from "@smthrs/patterns"
import { Node, Planned } from "@smthrs/plan"
import { Effect, Layer, Schema } from "effect"
import { secretValues } from "./credentials.ts"
import { redactDiagnostic } from "./process.ts"
import { finalize, prepare, type RuntimeOptions, runTrial } from "./runtime.ts"
import { BenchmarkFailed, defaults, Input, Prepared, Receipt, Summary, Trial } from "./schema.ts"

export const Prepare = Action.make("benchmark/prepare", {
  implementationVersion: "benchmark/v1",
  payload: Input,
  success: Prepared,
  error: BenchmarkFailed,
  nondeterministic: true,
  tier: "compensable"
})
export const RunTrial = Action.make("benchmark/trial", {
  implementationVersion: "benchmark/v1",
  payload: { prepared: Prepared, trial: Trial },
  success: Summary,
  error: BenchmarkFailed,
  nondeterministic: true,
  tier: "irreversible"
})
export const Finish = Action.make("benchmark/finish", {
  implementationVersion: "benchmark/v1",
  payload: { prepared: Prepared, summaries: Schema.Array(Summary) },
  success: Receipt,
  error: BenchmarkFailed,
  tier: "irreversible"
})

/** A child receives concrete prepared data; static batches bound the calls in its durable graph. */
export const Trials = Flow.make("benchmark/trials", {
  payload: Prepared,
  success: Schema.Array(Summary),
  error: BenchmarkFailed,
  body: Node.capture({ version: "benchmark/v1" }, (prepared: Prepared) => {
    if (!prepared.trials.length) return Node.succeed([])
    const joined = Bounded.all(
      Object.fromEntries(prepared.trials.map((trial) => [trial.id, RunTrial.call({ prepared, trial })])),
      { concurrency: defaults(prepared.input).concurrency }
    ) as Node.Node<
      Readonly<Record<string, typeof Summary.Type>>,
      BenchmarkFailed,
      Action.Requirement<"benchmark/trial">
    >
    return Node.map(joined, Node.capture({ version: "benchmark/v1" }, (summaries) => Object.values(summaries)))
  })
})
export default Flow.make("benchmark", {
  description: "Run benchmark trials on Cloud and retain their logs and LFS artifacts.",
  capabilities: ["fs:read:**", "fs:write:**", "proc:spawn:*", "net:*:**"],
  effects: {
    reads: ["**"],
    writes: [".flows/benchmarks/**"],
    mode: "expected",
    onConflict: "serialize",
    tier: "irreversible"
  },
  modelInvocable: false,
  payload: Input,
  success: Receipt,
  error: BenchmarkFailed,
  body: Node.capture(
    { version: "benchmark/v1" },
    (input: Input) =>
      Node.bindPlanned(
        Prepare.call(input),
        Node.capture({ version: "benchmark/v1" }, (prepared) =>
          Node.bindPlanned(
            Trials.child(prepared),
            Node.capture(
              { prepared: Planned.reference(prepared), version: "benchmark/v1" },
              (summaries) => Finish.call({ prepared, summaries })
            )
          ))
      )
  )
})
export const retainedFailure = (
  error: unknown,
  code: "driver" | "export",
  environment?: NodeJS.ProcessEnv
): BenchmarkFailed => {
  environment ??= process.env
  let secrets: ReadonlyArray<string>
  try {
    secrets = secretValues(environment)
  } catch {
    secrets = Object.entries(environment).filter(([name, value]) =>
      value && /TOKEN|SECRET|PASSWORD|AUTH_BUNDLES|API_KEY/.test(name)
    ).map(([, value]) => value!)
  }
  const message = error instanceof BenchmarkFailed || error instanceof Error
    ? error.message
    : "Benchmark operation failed"
  return new BenchmarkFailed({
    code: error instanceof BenchmarkFailed ? error.code : code,
    message: redactDiagnostic(message, secrets)
  })
}
const attempt = <A>(code: "driver" | "export", body: (signal: AbortSignal) => Promise<A>, options: RuntimeOptions) =>
  Effect.tryPromise({
    try: body,
    catch: (error) => retainedFailure(error, code, options.environment)
  })
export const implementations = (options: RuntimeOptions = {}) =>
  Layer.mergeAll(
    Prepare.toLayer((input) => attempt("driver", (signal) => prepare(input, signal, options), options), {
      implementationVersion: "benchmark/v1"
    }),
    RunTrial.toLayer(
      ({ prepared, trial }) =>
        attempt("export", (signal) => runTrial(prepared, trial, signal, options), options).pipe(
          Effect.tap((summary) =>
            Effect.logInfo(redactDiagnostic(
              JSON.stringify({
                task: summary.task,
                arm: summary.arm,
                reward: summary.reward,
                wall: summary.wall,
                tokens: { uncached: summary.uncached, cached: summary.cached, output: summary.output },
                account: summary.account,
                exception: summary.exception,
                commit: summary.commit
              }),
              secretValues(options.environment ?? process.env)
            ))
          )
        ),
      { implementationVersion: "benchmark/v1" }
    ),
    Finish.toLayer(
      ({ prepared, summaries }) =>
        attempt("export", (signal) => finalize(prepared, summaries, signal, options), options),
      { implementationVersion: "benchmark/v1" }
    ),
    Interpreter.layer(Trials)
  )
export const layer = implementations()
