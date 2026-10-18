/**
 * Public, data-only front-door rules and the pure per-visit chooser.
 * No identity, history, storage or network operation belongs in this contract.
 * @since 0.1.0
 */

import { z } from "zod"
import { RepositoryHomeLinks, RepositoryHomeText } from "./RepositoryHome.ts"

/** Coarse arrival classes; full referrers never enter the rules.
 * @category schemas
 * @since 0.1.0
 */
export const SourceClass = z.enum([
  "effeck",
  "smithers-site",
  "repo-site",
  "github",
  "search",
  "social",
  "install",
  "direct",
  "other"
])
/** The five existing launcher sections.
 * @category schemas
 * @since 0.1.0
 */
export const Section = z.enum(["open-existing", "open", "create", "explore", "updates"])
/** A completed read, or an explicitly unknown fact.
 * @category models
 * @since 0.1.0
 */
export type Known<T> = { state: "known"; value: T } | { state: "unknown" }
/** Construct a fact schema that cannot mistake an unanswered read for zero.
 * @category schemas
 * @since 0.1.0
 */
export const Known = <T extends z.ZodType>(value: T) =>
  z.discriminatedUnion("state", [
    z.object({ state: z.literal("known"), value }).strict(),
    z.object({ state: z.literal("unknown") }).strict()
  ])
const count = z.number().int().min(0)
const Range = z.object({ min: count.optional(), max: count.optional() }).strict()
  .refine((r) => r.min === undefined || r.max === undefined || r.min <= r.max)
/** Facts for this page load only; account reads carry no visitor memo.
 * @category schemas
 * @since 0.1.0
 */
export const Facts = z.object({
  signedIn: z.boolean(),
  source: SourceClass,
  sourceHost: z.string().max(253).optional(),
  medium: z.string().max(32).optional(),
  campaign: z.string().max(64).optional(),
  arm: z.enum(["treat", "hold"]),
  ownRepos: Known(count),
  coveredNotImported: Known(count),
  activeRuns: Known(count),
  modelConnections: Known(count)
}).strict()
/** Facts consumed by the chooser.
 * @category models
 * @since 0.1.0
 */
export type Facts = z.infer<typeof Facts>
/** Only doors that render a picker or sign-in prompt; never a consequential action.
 * The app validator resolves these against its typed FlowName registry.
 * @category schemas
 * @since 0.1.0
 */
export const DoorFlowName = z.enum(["repo.select", "auth.prompt"])
/** Bounded lead content reusing the repository-home text and links.
 * @category schemas
 * @since 0.1.0
 */
export const LeadBlock = z.union([
  RepositoryHomeText.strict(),
  RepositoryHomeLinks.strict(),
  z.object({ type: z.literal("continue") }).strict(),
  z.object({ type: z.literal("action"), flow: DoorFlowName, label: z.string().min(1).max(60) }).strict()
])
/** A lead's renderable blocks.
 * @category models
 * @since 0.1.0
 */
export type LeadBlock = z.infer<typeof LeadBlock>
const when = z.object({
  signedIn: z.boolean().optional(),
  source: z.array(SourceClass).min(1).optional(),
  medium: z.array(z.string().max(32)).min(1).optional(),
  campaign: z.array(z.string().max(64)).min(1).optional(),
  ownRepos: Range.optional(),
  coveredNotImported: Range.optional(),
  activeRuns: Range.optional(),
  modelConnections: Range.optional()
}).strict()
/** One ordered rule, with no HTML or executable arguments.
 * @category schemas
 * @since 0.1.0
 */
export const Journey = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/),
  holdout: z.boolean().default(false),
  when,
  lead: z.array(LeadBlock).max(3),
  order: z.array(Section).length(5).refine((sections) => new Set(sections).size === 5).optional(),
  goal: z.enum(["repo.opened", "sign-in", "repos.import", "run.opened", "release.read", "model.connected"])
}).strict()
/** The public rules file; an empty journey list is the kill switch.
 * @category schemas
 * @since 0.1.0
 */
export const FrontDoor = z.object({
  version: z.literal(1),
  holdoutShare: z.number().min(0).max(0.5).default(0.1),
  journeys: z.array(Journey).max(40)
}).strict().refine((r) => new Set(r.journeys.map((j) => j.id)).size === r.journeys.length)
/** Parsed public rules.
 * @category models
 * @since 0.1.0
 */
export type FrontDoor = z.infer<typeof FrontDoor>
/** The chooser's complete output.
 * @category models
 * @since 0.1.0
 */
export interface JourneyChoice {
  journey: string
  lead: LeadBlock[]
  order: z.infer<typeof Section>[]
}
/** Today's launcher, in its existing DOM order.
 * @category models
 * @since 0.1.0
 */
export const DEFAULT_CHOICE: JourneyChoice = {
  journey: "default",
  lead: [],
  order: ["open-existing", "open", "create", "explore", "updates"]
}
const ranges = ["ownRepos", "coveredNotImported", "activeRuns", "modelConnections"] as const
const labels = ["source", "medium", "campaign"] as const
/** Whether a rule matches this visit. Unknown facts never satisfy even an unbounded range.
 * @category guards
 * @since 0.1.0
 */
export const journeyMatches = (rule: z.infer<typeof Journey>, facts: Facts): boolean => {
  const w = rule.when
  if (w.signedIn !== undefined && w.signedIn !== facts.signedIn) return false
  for (const key of labels) {
    const allowed = w[key]
    const value = facts[key]
    if (allowed !== undefined && (value === undefined || !allowed.includes(value as never))) return false
  }
  for (const key of ranges) {
    const range = w[key]
    if (range === undefined) continue
    const fact = facts[key]
    if (fact.state === "unknown" || fact.value < (range.min ?? 0) || fact.value > (range.max ?? Infinity)) return false
  }
  return true
}
/** Choose the first matching rule; signed-out holdout always keeps today's launcher.
 * @category utilities
 * @since 0.1.0
 */
export const chooseJourney = (rules: FrontDoor, facts: Facts): JourneyChoice => {
  if (!facts.signedIn && facts.arm === "hold") return DEFAULT_CHOICE
  const journey = rules.journeys.find((j) => journeyMatches(j, facts))
  return journey === undefined ? DEFAULT_CHOICE : {
    journey: journey.id,
    lead: journey.lead,
    order: journey.order ?? DEFAULT_CHOICE.order
  }
}
const covers = (earlier: z.infer<typeof when>, later: z.infer<typeof when>): boolean => {
  if (earlier.signedIn !== undefined && earlier.signedIn !== later.signedIn) return false
  for (const key of labels) {
    const a = earlier[key], b = later[key]
    if (a !== undefined && (b === undefined || !b.every((v) => a.includes(v as never)))) return false
  }
  for (const key of ranges) {
    const a = earlier[key], b = later[key]
    if (
      a !== undefined && (b === undefined || (a.min ?? 0) > (b.min ?? 0) || (a.max ?? Infinity) < (b.max ?? Infinity))
    ) return false
  }
  return true
}
/** Identify a journey whose entire predicate is covered by an earlier rule.
 * @category utilities
 * @since 0.1.0
 */
export const shadowedJourneys = (rules: FrontDoor): Array<{ journey: string; by: string }> =>
  rules.journeys.flatMap((j, i) => {
    const earlier = rules.journeys.slice(0, i).find((a) => covers(a.when, j.when))
    return earlier ? [{ journey: j.id, by: earlier.id }] : []
  })
