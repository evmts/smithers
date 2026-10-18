/**
 * Read failed-deploy evidence and recommend rollback or mitigation, with a person's approval before any rollback.
 *
 * Port of the 0.x `rollback-advisor.jsx`. An evidence agent inspects the
 * failed deployment, and an advisor agent reads its findings and recommends
 * rolling back or mitigating in place. A recommended rollback first asks a
 * person: approved, the flow settles with the rollback steps; denied, with the
 * 0.x "awaiting approval" observe steps. Without a rollback recommendation the
 * flow settles with the advisor's mitigation plan and asks nobody.
 *
 * 0.x's `<Approval>` is `WithApproval` around the rollback; the decision is the host's `Approve` action, which answers `"approved"` or fails with `RollbackDenied`.
 * 0.x's `act` step only reported the action, so the rollback runs nothing here either.
 * 0.x gave the agents `bash`, `read` and `grep` tools; in 1.0 tools are the host's registered flows (see `25-agent-tools-in-sandbox.ts`).
 */
import * as AgentAction from "@smthrs/agent/AgentAction"
import { Action, Flow } from "@smthrs/flow"
import * as WithApproval from "@smthrs/patterns/WithApproval"
import { Node } from "@smthrs/plan"
import type * as Planned from "@smthrs/plan/Planned"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

const seat = "anthropic:claude-sonnet-5-5"

/** What the evidence agent found. */
export const Evidence = Schema.Struct({
  deployment: Schema.String,
  errorRate: Schema.Number,
  affectedEndpoints: Schema.Array(Schema.String),
  timeline: Schema.String,
  severity: Schema.Literals(["critical", "high", "medium", "low"]),
  rawFindings: Schema.String
})

/** The advisor's recommendation. */
export const Advice = Schema.Struct({
  shouldRollback: Schema.Boolean,
  reason: Schema.String,
  mitigation: Schema.String,
  rollbackSafe: Schema.Boolean,
  risks: Schema.Array(Schema.String)
})

/** The action the flow settles with. */
export const Outcome = Schema.Struct({
  action: Schema.Literals(["rollback", "mitigate", "observe"]),
  summary: Schema.String,
  steps: Schema.Array(Schema.String)
})

type Outcome = typeof Outcome.Type

/** What the approval is asked: the rollback's payload, the reason, and the scope `WithApproval` remembers it under. */
export const ApprovalRequest = Schema.Struct({ input: Schema.Unknown, reason: Schema.String, scope: Schema.String })

/** A person said no. */
export class RollbackDenied extends Schema.TaggedError<RollbackDenied>()("examples/RollbackAdvisor/RollbackDenied", {
  note: Schema.String
}) {}

/** Inspects the failed deployment. */
export const GatherEvidence = AgentAction.make("examples/RollbackAdvisor/Gather", {
  payload: { deployment: Schema.String, symptoms: Schema.String },
  output: Evidence,
  seat,
  system: [
    `You are an incident evidence gatherer. Inspect logs, metrics, and recent
deployments to build a clear picture of what went wrong. Focus on error rates,
affected services, and the timeline of events.`
  ],
  prompt: ({ deployment, symptoms }) =>
    `Gather evidence about a failed deployment.\n\nDeployment: ${deployment}\nSymptoms: ${symptoms}\n\nUse available tools to inspect logs, metrics, and recent changes.\nSummarize error rates, affected endpoints, and timeline of the incident.`
})

/** Recommends rollback, mitigation or observation. */
export const Advise = AgentAction.make("examples/RollbackAdvisor/Advise", {
  payload: { deployment: Schema.String, evidence: Schema.String },
  output: Advice,
  seat,
  system: [
    `You are a deployment advisor. Given evidence of a failed deployment,
determine whether to rollback, mitigate in place, or observe. Consider data safety,
blast radius, and available mitigations. Be decisive and justify your recommendation.`
  ],
  prompt: ({ deployment, evidence }) =>
    `Based on the gathered evidence, recommend whether to rollback, mitigate, or observe.\n\nDeployment: ${deployment}\nEvidence: ${evidence}\n\nConsider:\n- Severity and blast radius of the issue\n- Whether a rollback is safe (data migrations, schema changes)\n- Alternative mitigations (feature flags, traffic shifting, config changes)\n\nProvide a clear recommendation with reasoning and a concrete mitigation plan.`
})

/** The person's decision. A host implements it, for example with a control-plane approval token. */
export const Approve = Action.make("examples/RollbackAdvisor/Approve", {
  payload: ApprovalRequest,
  success: WithApproval.Approved,
  error: RollbackDenied
})

/** The approval flow `WithApproval` calls before the rollback. */
export const ApproveRollback = Flow.make("examples/RollbackAdvisor/ApproveRollback", {
  payload: ApprovalRequest,
  success: WithApproval.Approved,
  error: RollbackDenied,
  body: (request) => Approve.call(request)
})

const approved = ({ deployment, reason }: { readonly deployment: string; readonly reason: string }): Outcome => ({
  action: "rollback",
  summary: `Approved rollback for ${deployment}: ${reason}`,
  steps: ["Initiate rollback", "Verify service health", "Notify stakeholders"]
})

const awaiting = ({ reason }: { readonly reason: string }): Outcome => ({
  action: "observe",
  summary: `Rollback recommended but awaiting approval: ${reason}`,
  steps: ["Await approval", "Monitor error rates"]
})

const mitigate = ({ mitigation }: { readonly mitigation: string }): Outcome => ({
  action: "mitigate",
  summary: `Mitigation plan: ${mitigation}`,
  steps: mitigation.split(". ").filter(Boolean)
})

/** The rollback a person must approve. It reports the steps; 0.x ran nothing either. */
export const Rollback = Flow.make("examples/RollbackAdvisor/Rollback", {
  payload: { deployment: Schema.String, reason: Schema.String },
  success: Outcome,
  body: ({ deployment, reason }) => Node.map(Node.succeed({ deployment, reason }), approved)
})

/**
 * The rollback behind its approval. `WithApproval` returns a type-erased flow,
 * so its inline call is typed here once: the approval's denial is its only
 * failure and `Approve` its only step.
 */
const gatedRollback = (deployment: string, reason: Planned.Planned<string>) =>
  (WithApproval.withApproval(Rollback, { reason: `Rollback ${deployment}`, approval: ApproveRollback }) as unknown as {
    readonly call: (
      payload: { readonly deployment: string; readonly reason: Planned.Planned<string> }
    ) => Node.Node<Outcome, RollbackDenied, Action.Requirement<"examples/RollbackAdvisor/Approve">>
  }).call({ deployment, reason })

/** The flow: gather, advise, then roll back behind an approval or mitigate. */
export const RollbackAdvisor = Flow.make("examples/RollbackAdvisor", {
  payload: { deployment: Schema.optional(Schema.String), symptoms: Schema.optional(Schema.Array(Schema.String)) },
  success: Outcome,
  error: AgentAction.AgentFailure,
  body: ({ deployment = "unknown", symptoms = [] }) =>
    Node.bindPlanned(
      GatherEvidence.call({ deployment, symptoms: symptoms.join(", ") }),
      (evidence: Planned.Planned<typeof Evidence.Type>) =>
        Node.branch(Advise.call({ deployment, evidence: evidence.rawFindings }), {
          if: (advice) => advice.shouldRollback,
          // A denial settles as 0.x's observe outcome instead of failing the run.
          then: (advice) =>
            Node.catch(gatedRollback(deployment, advice.reason), {
              onFailure: () => Node.map(Node.succeed({ reason: advice.reason }), awaiting)
            }),
          else: (advice) => Node.map(Node.succeed({ mitigation: advice.mitigation }), mitigate)
        })
    )
})

/** Every model step the flow calls. The host adds an implementation of {@link Approve}. */
export const layer = Layer.mergeAll(GatherEvidence.layer, Advise.layer)
