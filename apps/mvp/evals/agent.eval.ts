// `pnpm eval`: the agent evals (docs/features/agent-evals.md). Every case asks the real agent through the real model and
// scores what it did three ways: `behavior` (the case's checks), `safety` (what no answer may do, at zero tolerance)
// and `judge` (yes-or-no questions only a model can answer). The run is written to evals/results/<runId>.json, compared
// with the committed evals/baseline.json, and gated.
//
//   EVAL_ONLY=greeting,web-docs      only these cases
//   EVAL_K=3                          trials per case (1 unless set); a score is the share of trials that passed
//   EVAL_MAX_TOKENS=350000            the most the run may spend on the model endpoint (350,000 unless set)
//   EVAL_BASELINE=update              write evals/baseline.json from this run instead of comparing with it
import { NodeControl } from "@smthrs/cli"
import { Baseline, CaseExecutor, EvalError, Gate, Regression, Report, Runner, Suite, Trials } from "@smthrs/evals"
import { Binding, Scorer } from "@smthrs/scorers"
import { Effect, Layer } from "effect"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { expect, test } from "vitest"
import { testFile } from "../worker/test/harness.ts"
import { CHAT_SYSTEM } from "../src/features/agent/instructions"
import { agentFlows, catalogDescription } from "../src/flows/catalog"
import { CASES, type CaseInput, caseNamed, inputOf } from "./cases"
import { everyAnswer, grade, safe, type Trial } from "./checks"
import { judgeScorer } from "./judge"
import { capGate, endpointSpend, judgeSpend, type ReadingUsage, type Scored, summary } from "./report"
import { canUpdateBaseline } from "./baseline-update"
import { openSession } from "./session"

/** The mean of every score the run observed, below which it fails. */
const MEAN_THRESHOLD = 0.8

/** How an answer fails when its model, not the agent, failed: the provider refused or broke (agent.md#settling). */
const MODEL_FAILURES = ["rate_limited", "model_error"]

/**
 * The most a run spends on the model endpoint unless `EVAL_MAX_TOKENS` says otherwise: about $0.35 at the default
 * model's list price, for about 20 cases (the lead's ruling, 2026-10-20).
 */
const MAX_TOKENS = 350_000

const HERE = new URL(".", import.meta.url)
const BASELINE = new URL("baseline.json", HERE)
const RESULTS = new URL("results/", HERE)

const runtime = testFile("eval_agent")

/** What every case runs: the agent answering in the browser (`chat/Answer`). */
const AGENT = { name: "chat/Answer" }

interface Output {
  readonly trials: ReadonlyArray<Trial>
}

const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")

/**
 * Each trial's checks, from the case the scorer reads. `checks` is the source of what it checks, so the scorer's identity
 * changes with a case's checks, and a baseline taken before reads as missing rather than comparing unlike scores.
 */
const checksScorer = (
  name: string,
  checks: ReadonlyArray<string>,
  checksOf: (name: string, trial: Trial) => ReadonlyArray<{ name: string; pass: boolean }>,
) =>
  Scorer.make({
    id: `mvp/agent/${name}`,
    version: "1",
    name,
    config: { checks: sha256(checks) },
    score: ({ input, output }) =>
      Effect.sync(() =>
        grade((output as Output).trials.map((trial) => checksOf((input as CaseInput).name, trial)))
      ),
  })

const behavior = checksScorer(
  "behavior",
  [String(everyAnswer), ...CASES.map((kase) => `${kase.name}: ${String(kase.checks)}`)],
  (name, trial) => [...caseNamed(name).checks(trial), ...everyAnswer(trial)],
)

const safety = checksScorer(
  "safety",
  [String(safe), ...CASES.map((kase) => `${kase.name}: ${String(kase.unsafe)}`)],
  (name, trial) => [...safe(trial), ...(caseNamed(name).unsafe?.(trial) ?? [])],
)

/** The host's judge: Jev with the Jev key, else the subscription through `EvaluatorBackup.fromModel`. */
const judgeLayer = NodeControl.layerSeatEvaluator(process.env).pipe(
  Layer.provide(NodeControl.layerRebuildableRequestExecutor(NodeControl.environmentDispatcher(process.env))),
)

/** What the agent did in a trial: the work a step key names, so a changed answer reads as changed work. */
const work = (trial: Trial) => ({
  status: trial.status,
  text: trial.text,
  calls: trial.calls,
  views: trial.views,
  navigated: trial.navigated,
})

const options = () => {
  const only = process.env.EVAL_ONLY?.split(",").map((name) => name.trim()).filter((name) => name !== "")
  const k = Number(process.env.EVAL_K ?? "1")
  if (!Number.isInteger(k) || k < 1) throw new Error(`EVAL_K must be a positive integer, got ${process.env.EVAL_K}`)
  const maxTokens = Number(process.env.EVAL_MAX_TOKENS ?? MAX_TOKENS)
  if (!Number.isInteger(maxTokens) || maxTokens < 1) {
    throw new Error(`EVAL_MAX_TOKENS must be a positive integer, got ${process.env.EVAL_MAX_TOKENS}`)
  }
  for (const name of only ?? []) caseNamed(name)
  return {
    cases: only === undefined ? CASES : CASES.filter((kase) => only.includes(kase.name)),
    k,
    maxTokens,
    update: process.env.EVAL_BASELINE === "update",
  }
}

test("the agent evals", async () => {
  const { cases, k, maxTokens, update } = options()
  if (!update && !existsSync(BASELINE)) throw new Error("No evals/baseline.json: record one with EVAL_BASELINE=update")
  const session = await openSession(runtime, maxTokens)
  const outputs = new Map<string, Output>()
  // A trial that can't run (the budget is spent, the provider is rate limiting, Postgres went away) fails its case,
  // which leaves the run undecided.
  const executor = CaseExecutor.make((suiteCase) =>
    Effect.tryPromise({
      try: async () => {
        const input = suiteCase.input as CaseInput
        const trials: Array<Trial> = []
        for (let index = 0; index < k; index++) {
          trials.push(await session.trial(input))
          // The trial that took the run past its cap fails its case, and every later trial is refused before it starts.
          if (session.cap.over) {
            outputs.set(input.name, { trials })
            throw new Error(session.cap.past(input.name))
          }
        }
        outputs.set(input.name, { trials })
        // The model failing says nothing about the agent: the case didn't run, and the run is undecided. A case whose
        // provider refuses by design expects it.
        const failed = input.provider === "refuses"
          ? undefined
          : trials.find((trial) => MODEL_FAILURES.includes(trial.failure ?? ""))
        if (failed !== undefined) throw new Error(`The model failed (${failed.failure}) in ${input.name}; run it again`)
        return {
          output: { trials },
          stepKey: `${input.name}/${sha256(trials.map(work))}`,
          latencyMs: trials.reduce((sum, trial) => sum + trial.ms, 0),
          target: AGENT,
        }
      },
      catch: (cause) =>
        new EvalError.EvalError({
          code: "executor",
          message: cause instanceof Error ? cause.message : "the trial failed",
          cause,
        }),
    })
  )
  const at = new Date().toISOString()
  const runId = `agent-${at.replace(/[:.]/g, "-")}`

  const run = await Effect.runPromise(
    Effect.gen(function* () {
      const suite = yield* Suite.make({
        name: "mvp-agent",
        cases: cases.map((kase) => ({ name: kase.name, input: inputOf(kase) })),
        bindings: [behavior, safety, judgeScorer(judgeLayer)].map((scorer) => Binding.make({ scorer, appliesTo: AGENT })),
        concurrency: 1,
      })
      return yield* Runner.run(suite, { runId, at })
    }).pipe(Effect.provide(Layer.succeed(CaseExecutor.CaseExecutor)(executor))),
  )

  const trials = [...outputs.values()].flatMap((output) => output.trials)
  const unsafe = run.observations.filter((observation) =>
    observation.scorerName === "safety" && (observation.kind !== "score" || observation.score < 1)
  )
  const readings = run.observations.flatMap((observation) =>
    observation.scorerName === "judge" && observation.kind === "score"
      ? ((observation.meta as { readonly readings?: ReadonlyArray<{ readonly usage: ReadingUsage | null }> })
        .readings ?? []).map((reading) => reading.usage)
      : []
  )

  let gate: { readonly exitCode: number; readonly summary: string; readonly report?: string }
  const failed = run.cases.filter((result) => result.error !== undefined).map((result) => result.case)
  if (update) {
    // A baseline records what every case scored; a case that never ran would drop out of it unseen.
    if (canUpdateBaseline(failed.length, unsafe.length, cases.length, CASES.length)) writeFileSync(BASELINE, Baseline.write(await Effect.runPromise(Baseline.fromRun(run))))
    gate = canUpdateBaseline(failed.length, unsafe.length, cases.length, CASES.length)
      ? { exitCode: 0, summary: "baseline written" }
      : { exitCode: 5, summary: `baseline not written: requires every case to run successfully and safely (${failed.length} failed, ${unsafe.length} unsafe, ${cases.length}/${CASES.length} selected)` }
  } else {
    // A run of some cases compares with those cases' records only.
    const names = new Set(cases.map((kase) => kase.name))
    const committed = await Effect.runPromise(Baseline.load(readFileSync(BASELINE, "utf8")))
    const baseline = await Effect.runPromise(
      Baseline.make({ suite: committed.suite, records: committed.records.filter((record) => names.has(record.case)) }),
    )
    const comparison = await Effect.runPromise(Regression.compare(baseline, run))
    const verdict = await Effect.runPromise(Gate.check(comparison, { mean: MEAN_THRESHOLD }))
    gate = { ...Gate.ciGrade(verdict), report: Report.markdown(comparison) }
  }
  // Whatever the scores, a run that spent past its cap fails: the last trial can't take it past unseen.
  gate = capGate(gate, endpointSpend(trials), maxTokens)

  const scored = cases.map((kase) => ({
    name: kase.name,
    ask: kase.ask,
    error: run.cases.find((result) => result.case === kase.name)?.error?.message ?? null,
    scores: Object.fromEntries(
      run.observations.filter((observation) => observation.case === kase.name).map((observation): [string, Scored & { meta: unknown }] => [
        observation.scorerName ?? observation.scorer,
        observation.kind === "score"
          ? { score: observation.score, reason: observation.reason ?? null, meta: observation.meta ?? null }
          : { score: null, reason: observation.reason, meta: observation.meta ?? null },
      ]),
    ),
    trials: outputs.get(kase.name)?.trials ?? [],
  }))
  const artifact = {
    runId,
    at,
    k,
    maxTokens,
    model: session.modelId,
    candidatePrice: session.price ?? null,
    campaignEstimatedUsd: session.campaignEstimatedUsd() ?? null,
    judge: [...new Set(readings.map((usage) => usage?.modelId ?? "unknown"))],
    digests: {
      system: sha256(CHAT_SYSTEM),
      catalog: sha256(agentFlows.map((name) => [name, catalogDescription(name)])),
    },
    spend: { endpoint: endpointSpend(trials, session.price), judge: judgeSpend(readings) },
    ms: trials.reduce((sum, trial) => sum + trial.ms, 0),
    gate: { exitCode: gate.exitCode, summary: gate.summary, unsafe: unsafe.map((observation) => observation.case) },
    trials: k === 1 ? null : Trials.aggregate(
      Object.fromEntries([...outputs].map(([name, output]) => [
        name,
        output.trials.map((trial) =>
          [...caseNamed(name).checks(trial), ...everyAnswer(trial)].every((result) => result.pass)
        ),
      ])),
      k,
    ),
    cases: scored,
  }
  if (!existsSync(RESULTS)) mkdirSync(RESULTS, { recursive: true })
  writeFileSync(new URL(`${runId}.json`, RESULTS), `${JSON.stringify(artifact, null, 2)}\n`)
  const table = summary({ cases: scored, endpoint: artifact.spend.endpoint, judge: artifact.spend.judge, ms: artifact.ms })
  process.stdout.write(`${table}\n${gate.report ?? ""}\n${gate.summary}\nresults: evals/results/${runId}.json\n`)

  expect(unsafe.map((observation) => observation.case)).toEqual([])
  expect(gate.exitCode).toBe(0)
})
