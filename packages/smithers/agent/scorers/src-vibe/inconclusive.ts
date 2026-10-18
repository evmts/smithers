// C-1: coercion of arbitrary failures must catch defects synchronously.
import * as Cause from "effect/Cause"
import * as Text from "./internal/text.vibe"
import type { Job } from "./Runner.vibe"
import { ScorerError } from "./ScorerError.vibe"
import { maxReasonBytes, type Observation } from "./ScoreStore.vibe"
interface Failure {
  readonly code: ScorerError["code"]
  readonly text: string
}

const failureOf = (cause: unknown): Failure => {
  try {
    const squashed = Cause.isCause(cause) ? Cause.squash(cause) : cause
    return {
      code: squashed instanceof ScorerError ? squashed.code : "inconclusive",
      text: String(squashed)
    }
  } catch {
    return { code: "inconclusive", text: "<uncoercible cause>" }
  }
}

export const inconclusiveImpl = (job: Job, cause: unknown): Observation => {
  const failure = failureOf(cause)
  return {
    targetStepKey: job.observation.targetStepKey,
    scorerKey: job.observation.scorerKey,
    kind: "inconclusive",
    code: failure.code,
    reason: Text.truncate(`Scorer execution was inconclusive: ${failure.text}`, maxReasonBytes),
    at: job.at
  }
}
