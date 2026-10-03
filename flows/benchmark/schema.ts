import { Fault } from "@smthrs/flow"
import { Schema } from "effect"

export const Account = Schema.Literals(["codex-1", "codex-3", "codex-acct-1"])
export const Arm = Schema.Literals(["smithers", "codex", "oracle"])
const Positive = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))
const Name = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/))
export const Input = Schema.Struct({
  suite: Schema.Literals(["tb4", "deepswe", "swebench", "noop"]),
  arms: Schema.Array(Arm).check(Schema.isMinLength(1)),
  tasks: Schema.Union([
    Schema.Literal("all"),
    Schema.Array(Schema.String).check(Schema.isMinLength(1)),
    Schema.Struct({ sample: Positive, seed: Schema.Int })
  ]),
  k: Schema.optional(Positive),
  model: Schema.optional(Schema.String),
  effort: Schema.optional(Schema.Literals(["low", "medium", "high", "max"])),
  accounts: Schema.optional(Schema.Array(Account).check(Schema.isMinLength(1))),
  concurrency: Schema.optional(Positive.check(Schema.isLessThanOrEqualTo(32))),
  job: Name,
  resultsRepo: Schema.optional(
    Schema.String.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/))
  )
})
export type Input = typeof Input.Type
const benchmarkAccounts: ReadonlyArray<typeof Account.Type> = ["codex-1", "codex-3", "codex-acct-1"]
export const defaults = (input: Input) => ({
  ...input,
  arms: [...new Set(input.arms)],
  k: input.k ?? 1,
  model: input.model ?? "openai/gpt-6.1-sol",
  effort: input.effort ?? "max",
  accounts: [...new Set(input.accounts ?? benchmarkAccounts)],
  concurrency: input.concurrency ?? 1,
  resultsRepo: input.resultsRepo ?? "smithers-canary/bench-results"
})

export const Trial = Schema.Struct({ id: Name, task: Schema.String, arm: Arm, attempt: Positive })
export type Trial = typeof Trial.Type
export const Prepared = Schema.Struct({ root: Schema.String, input: Input, trials: Schema.Array(Trial) })
export type Prepared = typeof Prepared.Type
export const Summary = Schema.Struct({
  id: Schema.String,
  task: Schema.String,
  suite: Schema.String,
  arm: Arm,
  model: Schema.String,
  account: Schema.NullOr(Schema.String),
  start: Schema.String,
  end: Schema.String,
  reward: Schema.NullOr(Schema.Number),
  wall: Schema.Number,
  uncached: Schema.NullOr(Schema.Number),
  cached: Schema.NullOr(Schema.Number),
  output: Schema.NullOr(Schema.Number),
  exception: Schema.NullOr(Schema.String),
  commit: Schema.String
})
export type Summary = typeof Summary.Type
export const Receipt = Schema.Struct({
  job: Schema.String,
  resultsRepo: Schema.String,
  trials: Schema.Number,
  commit: Schema.String,
  publishable: Schema.Boolean
})
export class BenchmarkFailed extends Schema.TaggedError<BenchmarkFailed>()("benchmark/Failed", {
  message: Schema.String,
  code: Schema.Literals(["credentials", "driver", "export", "configuration"])
}) {}
Fault.register("benchmark/Failed", {
  credentials: "dependency",
  driver: "dependency",
  export: "infra",
  configuration: "user"
})
