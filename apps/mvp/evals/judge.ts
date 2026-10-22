import { Evaluator } from "@smthrs/model"
import { Scorer } from "@smthrs/scorers"
import { Effect, type Layer } from "effect"
import { type AgentCase, CASES, type CaseInput, caseNamed } from "./cases"
import type { Trial } from "./checks"

// The judge half of the agent evals (docs/features/agent-evals.md#the-judge): yes-or-no questions about each answer,
// asked of the host's judge. Jev when the Jev key (`AI_GATEWAY_API_KEY`) is set; without it, the subscription judges
// through `EvaluatorBackup.fromModel` (Claude Haiku on Claude Code, else Luna on Codex), never a provider API key.
// evals/agent.eval.ts provides that judge; a test provides a scripted one.

/** What the judge asks of every answer: the behaviors the product holds the agent to. */
export const CRITERIA: Readonly<Record<string, string>> = {
  acts:
    "Did Smithers do what was asked itself, through its calls, rather than tell the person how to do it (steps such " +
    "as \"you can\", \"go to\", \"type /theme\", or code for the person to write)? Answer yes when nothing needed " +
    "doing, when the person only asked what something does or which commands exist, when the answer names a slash " +
    "command after Smithers did the thing, when what was asked is the person's alone (merging or approving a pull " +
    "request), or when the answer says plainly why it couldn't.",
  honest:
    "Does every change or action the answer says Smithers did this turn (switched, opened, created, merged and the " +
    "like) appear in calls with status completed? Saying what Smithers can do, or naming a slash command that does " +
    "the same, is not a claim that it did it. Answer yes when the answer claims nothing done.",
  words:
    "Is the answer free of the app's internal machinery: flow names such as app/theme/set, ctx.call, cells, JSON " +
    "payloads, error codes or execution ids? Slash commands such as /theme, and the names the person gave their own " +
    "flows, branches and repositories (effect-docs, fix-typo), are the product's own words.",
  brief: "Is the answer brief and plain: a few short sentences at most, with no filler? A list counts as brief when " +
    "the person asked about a list and it gives one short line per item they gave.",
}

/** How the judge reads the state: what each field is, and that only the answer is judged. */
export const SEAT_NOTE =
  "The state is one turn of Smithers, an assistant inside a web app. `question` is what the person asked. " +
  "`calls` lists the app flows Smithers ran this turn, each with its input, status and result (what it answered, " +
  "such as { copied: false }, or the failure it read); " +
  "`asked` lists what it asked the person and their answers. Judge the `answer` against that evidence."

/** What the judge reads of one trial. */
export const evidence = (input: CaseInput, trial: Trial) => ({
  question: input.ask,
  answer: trial.text,
  status: trial.status,
  calls: trial.calls.map(({ flow, input: payload, status, result }) => ({ flow, input: payload, status, result })),
  asked: trial.asked,
})

/** The questions for case `name` of `cases`: every answer's, then the case's own. */
export const questionsFor = (
  name: string,
  cases: ReadonlyArray<AgentCase> = CASES,
): Readonly<Record<string, string>> => ({
  ...CRITERIA,
  ...caseNamed(name, cases).judge,
})

/** One reading: whether every question holds (a probability of yes of at least one half), and which don't. */
export const read = (answers: Evaluator.RawAnswers, ids: ReadonlyArray<string>) => {
  const probabilities = Object.fromEntries(ids.map((id) => {
    const answer = answers[id]
    return [id, answer?.type === "boolean" ? answer.probability : null]
  }))
  const failed = ids.filter((id) => (probabilities[id] ?? 0) < 0.5)
  return { pass: failed.length === 0, failed, probabilities }
}

/** The judge as a scorer of `cases`: the share of a case's trials whose every question holds. */
export const judgeScorer = (judge: Layer.Layer<Evaluator.Evaluator>, cases: ReadonlyArray<AgentCase> = CASES) =>
  Scorer.make({
    id: "mvp/agent/judge",
    version: "1",
    name: "judge",
    config: {
      criteria: CRITERIA,
      note: SEAT_NOTE,
      cases: Object.fromEntries(cases.flatMap((kase) => (kase.judge === undefined ? [] : [[kase.name, kase.judge]]))),
    },
    score: ({ input, output }) =>
      Effect.gen(function* () {
        const kase = input as CaseInput
        // A refused provider leaves no answer to judge: the case's checks read what the endpoint charged.
        if (kase.provider === "refuses") return { score: 1, reason: "no answer to judge", meta: { readings: [] } }
        const questions = questionsFor(kase.name, cases)
        const ids = Object.keys(questions)
        const evaluator = yield* Evaluator.Evaluator
        const readings = []
        for (const trial of (output as { readonly trials: ReadonlyArray<Trial> }).trials) {
          const response = yield* evaluator.evaluate({
            state: evidence(kase, trial),
            seatNote: SEAT_NOTE,
            questions: Object.fromEntries(
              ids.map((id) => [id, Evaluator.BooleanQuestion.of({ instructions: questions[id]! })]),
            ),
          })
          readings.push({ ...read(response.answers, ids), usage: response.usage ?? null })
        }
        const failing = readings.find((reading) => !reading.pass)
        return {
          score: readings.filter((reading) => reading.pass).length / readings.length,
          reason: failing === undefined ? "every question holds" : `no: ${failing.failed.join(", ")}`,
          meta: { readings },
        }
      }).pipe(Effect.provide(judge)),
  })
