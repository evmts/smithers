/**
 * Diagnose a run from its control events, without a served gateway.
 *
 * A client that already holds a run's ordered control events folds them with
 * `Diagnosis.digest` and reads the same verdict line and card the
 * `run-summary` projection serves.
 */
import type { ControlSchema } from "@smthrs/control"
import * as Diagnosis from "@smthrs/gateway/Diagnosis"

const runId = "run-1"
const flowId = "hello"

/** The events one run recorded, in journal order. */
export const events: ReadonlyArray<ControlSchema.ControlEvent> = [
  { sequence: 1, kind: "control.run.running", runId, occurredAt: 1_000, payload: {} },
  {
    sequence: 2,
    kind: "control.agent.turn-opened",
    runId,
    occurredAt: 1_100,
    payload: { seat: "anthropic:claude-sonnet-4-5" }
  },
  { sequence: 3, kind: "control.agent.cell-call-started", runId, occurredAt: 1_200, payload: { flowName: "edit" } },
  {
    sequence: 4,
    kind: "control.agent.model-settled",
    runId,
    occurredAt: 3_000,
    payload: { usage: { inputTokens: 1_200, outputTokens: 300 } }
  },
  { sequence: 5, kind: "control.agent.resolved", runId, occurredAt: 5_500, payload: { text: "shipped" } },
  { sequence: 6, kind: "control.run.completed", runId, occurredAt: 6_000, payload: {} }
]

/**
 * Folds the events and returns the verdict, the run's span, and the card.
 *
 * @since 1.0.0
 */
export const diagnose = (recorded: ReadonlyArray<ControlSchema.ControlEvent> = events) => {
  const facts = Diagnosis.digest(recorded, runId)
  return {
    facts,
    verdict: Diagnosis.verdict(facts),
    span: Diagnosis.duration(facts),
    card: Diagnosis.render({ runId, flowId }, facts)
  }
}
