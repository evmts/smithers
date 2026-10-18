/**
 * Declares a repository policy flow that moves issues through the
 * repository's OWN states — proposed to accepted among them — the way a real
 * `.smithers/FACTORY.ts` does, then reads back the projection the app and the
 * server actually read (`.smithers/factory.json`).
 *
 * This is the executable example of M-47's "issue transitions as a flow": the
 * transitions are the repository's to declare and change, not app stages and
 * not a helper beside the product. Each one is carried by the repository's
 * existing GitHub labels, so no second issue tracker exists; `actor` is where
 * the repository says a PERSON has to make the move, which the server's own
 * actor rules then enforce.
 *
 * Declaring reads no files and starts no processes, so this runs anywhere.
 * `test/examples.test.ts` runs it.
 */
import { Smithers as S } from "@smthrs/targets"
import * as Factory from "@smthrs/targets/Factory"

/** One declared transition as a surface lists it. */
export interface TransitionSummary {
  readonly id: string
  readonly title: string
  /** The move, as the attribution says it: `proposed → accepted`, or just the label applied. */
  readonly move: string
  /** Whether the repository says a person has to make this move. */
  readonly needsPerson: boolean
}

/** What {@link declareIssueTransitions} reports. */
export interface IssuePolicySummary {
  readonly flows: ReadonlyArray<string>
  readonly transitions: ReadonlyArray<TransitionSummary>
  /** The projected `.smithers/factory.json`, decoded back. */
  readonly projected: ReadonlyArray<Factory.IssueTransition>
}

/**
 * The transitions this example repository declares. `triage` is the one an
 * agent may ASK for; the two that decide whether work happens are a person's.
 */
const transitions: ReadonlyArray<Factory.IssueTransition> = [
  { id: "triage", title: "Triage it", to: "needs-triage", actor: "anyone" },
  { id: "propose", title: "Propose it", from: "needs-triage", to: "proposed", actor: "person" },
  { id: "accept", title: "Accept the proposal", from: "proposed", to: "accepted", actor: "person" },
  { id: "park", title: "Park it", from: "proposed", to: "parked", actor: "person" }
]

const issuePolicy = S.Flow({
  flow: "issue-policy",
  summary: "Move an issue through this repository's own states.",
  featured: true
})

/** Declares the policy flow and its transitions, and projects them. */
export const declareIssueTransitions = (): IssuePolicySummary => {
  const factory = S.Factory({
    summary: "How this repository moves its own issues.",
    flows: [issuePolicy],
    // The flow is reachable the ordinary three ways every flow is; the
    // transitions below are what it is allowed to do to an issue.
    on: { manual: { flow: "issue-policy", description: "Move an issue through our states" } },
    github: S.Github.Policy({ mirror: "pull", issues: "two-way", changes: "send-upstream" }),
    issueTransitions: transitions
  })
  const rendered = Factory.renderProjection(factory, [])
  const projection = Factory.parseProjection(rendered)
  if (typeof projection === "string") throw new Error(projection)
  return {
    flows: factory.flows.map((flow) => flow.flow),
    transitions: (factory.issueTransitions ?? []).map((transition) => ({
      id: transition.id,
      title: transition.title,
      move: transition.from === undefined ? transition.to : `${transition.from} → ${transition.to}`,
      needsPerson: (transition.actor ?? "person") === "person"
    })),
    projected: [...(projection.issueTransitions ?? [])]
  }
}
