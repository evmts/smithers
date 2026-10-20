import { Schema } from "effect"
import { MAX_ANSWER_LENGTH, MAX_OPTION_LENGTH, MAX_OPTIONS, MAX_PROMPT_LENGTH } from "./contract"

// Agent status's rows and wire shapes (decision 0015): the run's report, a person's answer, the `runs` row Electric
// delivers, and this tab's own rows. A row stored on the device is read by the next version of the app too: change its
// shape only with its collection's `schemaVersion`.

/** The agent's five states (`@smthrs/ui`'s `AgentState`). */
export const AgentState = Schema.Literals(["working", "waiting", "needs_you", "failed", "done"])
export type AgentState = typeof AgentState.Type

/** Why a run waits or needs the person: its turn behind an earlier answer, a question, an approval. */
export const Waiting = Schema.Literals(["turn", "input", "approval"])
export type Waiting = typeof Waiting.Type

/** What the agent asks for: an answer in words or one of its options, or Approve or Deny. */
export const NeedKind = Schema.Literals(["question", "approval"])
export type NeedKind = typeof NeedKind.Type

/** A question the agent asks, as `app/agent/ask` takes it. */
export const Need = Schema.Struct({
  kind: NeedKind,
  prompt: Schema.Trim.check(Schema.isBetweenLength(1, MAX_PROMPT_LENGTH)),
  options: Schema.optional(
    Schema.Array(Schema.Trim.check(Schema.isBetweenLength(1, MAX_OPTION_LENGTH))).check(Schema.isMaxLength(MAX_OPTIONS)),
  ),
})
export type Need = typeof Need.Type

/** The open question on a run's row: the question, and the `app/agent/ask` execution that waits for its answer. */
export const Wait = Schema.Struct({
  execution: Schema.String.check(Schema.isMaxLength(512)),
  kind: NeedKind,
  prompt: Schema.String.check(Schema.isMaxLength(MAX_PROMPT_LENGTH)),
  options: Schema.Array(Schema.String.check(Schema.isMaxLength(MAX_OPTION_LENGTH))).check(Schema.isMaxLength(MAX_OPTIONS)),
})
export type Wait = typeof Wait.Type

/** An answer: the words or option for a question, `true` (Approve) or `false` (Deny) for an approval. */
export const AnswerValue = Schema.Union([Schema.String.check(Schema.isMaxLength(MAX_ANSWER_LENGTH)), Schema.Boolean])
export type AnswerValue = typeof AnswerValue.Type

/**
 * What a run's step reports: `POST /api/runs/<id>`. The route knows the run's flow: in this slice every run that reports
 * is an agent's answer, `chat/Answer`.
 */
export const Report = Schema.Union([
  Schema.Struct({ status: Schema.Literal("working") }),
  Schema.Struct({ status: Schema.Literal("waiting"), waiting: Schema.Literal("turn") }),
  Schema.Struct({ status: Schema.Literal("needs_you"), wait: Wait }),
  Schema.Struct({ status: Schema.Literal("done") }),
  Schema.Struct({ status: Schema.Literal("failed") }),
])
export type Report = typeof Report.Type

/** A person's answer to a run's open question: `POST /api/runs/<id>/answer`. `version` names the question. */
export const RunAnswer = Schema.Struct({ version: Schema.Int.check(Schema.isGreaterThan(0)), value: AnswerValue })
export type RunAnswer = typeof RunAnswer.Type

/** What either runs route answers: the transaction it wrote in, or `null` when it changed nothing. */
export const Written = Schema.Struct({ txid: Schema.NullOr(Schema.Number) })

/** A refusal's body: its code. */
export const Refusal = Schema.Struct({ code: Schema.String })

/**
 * One row of Postgres `runs` as Electric delivers it: columns in camelCase, jsonb parsed by Electric's client. `wait`
 * and `answer` keep the
 * run's latest question and its answer after it closes, so the conversation can show what was answered.
 */
export const Run = Schema.Struct({
  id: Schema.String,
  flow: Schema.String,
  status: AgentState,
  waiting: Schema.NullOr(Waiting),
  wait: Schema.NullOr(Wait),
  version: Schema.Number,
  answer: Schema.NullOr(Schema.Struct({ value: AnswerValue })),
  answeredAt: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
})
export type Run = typeof Run.Type

/**
 * This tab's own row about a run's latest question, keyed by the run's id: the question's `version`, the field's
 * `draft`, whether Hide was pressed on its toast (`hidden`), whether an answer is on its way (`sending`), and how many
 * times Answer asked the card to take focus (`focus`). A row for an older version is as good as none: a new question
 * starts fresh.
 */
export const Local = Schema.Struct({
  id: Schema.String,
  version: Schema.Number,
  draft: Schema.String,
  hidden: Schema.Boolean,
  sending: Schema.Boolean,
  focus: Schema.Number,
})
export type Local = typeof Local.Type
