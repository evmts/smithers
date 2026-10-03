import { Action, Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Effect, Schema } from "effect"
import { Account, BenchmarkFailed } from "../benchmark/schema.ts"
import { runMeter } from "./runtime.ts"

const Repo = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/))
export const Input = Schema.Struct({
  accounts: Schema.Array(Account).check(Schema.isMinLength(1)),
  job: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/)),
  run: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
  benchmarkRepo: Schema.optional(Repo),
  durationSeconds: Schema.optional(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(172800))
  ),
  resultsRepo: Schema.optional(Repo)
})
export const Receipt = Schema.Struct({
  job: Schema.String,
  resultsRepo: Schema.String,
  samples: Schema.Number,
  trials: Schema.Number,
  commit: Schema.String
})
export const Measure = Action.make("benchmark-meter/measure", {
  payload: Input,
  success: Receipt,
  error: BenchmarkFailed,
  nondeterministic: true,
  tier: "irreversible"
})
export default Flow.make("benchmark-meter", {
  description: "Measure weekly Codex usage against benchmark token records.",
  capabilities: ["fs:read:**", "fs:write:**", "proc:spawn:git *", "net:*:**"],
  effects: {
    reads: ["**"],
    writes: [".flows/benchmark-meter/**"],
    mode: "expected",
    onConflict: "serialize",
    tier: "irreversible"
  },
  modelInvocable: false,
  payload: Input,
  success: Receipt,
  error: BenchmarkFailed,
  body: Node.capture({ version: "benchmark-meter/v1" }, (input: typeof Input.Type) => Measure.call(input))
})
export const layer = Measure.toLayer((input) =>
  Effect.tryPromise({
    try: (signal) => runMeter(input, signal),
    catch: (error) =>
      error instanceof BenchmarkFailed
        ? error
        : new BenchmarkFailed({ code: "driver", message: "Benchmark meter failed" })
  })
)
