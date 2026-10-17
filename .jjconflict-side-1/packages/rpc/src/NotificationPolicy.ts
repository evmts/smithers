/**
 * Repository-owned notification policy (M-47, mvp.md §6.17): the contract a
 * repository flow answers when it decides WHO is told about a repository
 * event, and the rules the app applies to that answer.
 *
 * The policy is declared through the Dispatcher table a repository already
 * has — `on: { "notification.route": { flow: "<id>" } }` in
 * `.smithers/FACTORY.ts`, projected into `.smithers/factory.json`
 * ({@link FactoryProjection}) — so no second notification engine, event
 * vocabulary or configuration surface exists. The app reads the declaration,
 * runs the named flow through the ordinary workflow invocation path, and
 * decodes its answer here.
 *
 * Three rules are enforced by this module rather than by its callers, because
 * every caller would otherwise have to remember them:
 *
 * 1. **Access is checked AFTER the policy selects.** The request carries the
 *    candidates — the people who already can read the event — and
 *    {@link notificationPolicyResult} keeps only the selected recipients that
 *    are candidates. A policy can narrow who is told and can never widen who
 *    can read; a named recipient without access is withheld and counted.
 * 2. **A missing policy keeps the existing default.** With no declaration the
 *    built-in §6.4 default stands ({@link notificationPolicyDefault}): the
 *    event's owner and the people on its branch.
 * 3. **A failed, unavailable or malformed policy falls back and says why.**
 *    Every fallback carries one of the closed {@link NOTIFICATION_FALLBACK_REASONS}
 *    and delivers the default, so no policy failure silently notifies nobody.
 *
 * The decision is bounded typed recipient ids plus the one allowed handling
 * flag, parsed strictly: a policy cannot smuggle prose, a secret value, a URL
 * or a customer payload into a notification or a diagnostic through its
 * output, because an output carrying any other key does not decode.
 *
 * @since 1.0.0
 */

import { z } from "zod"
import { type FactoryProjection, type FactoryRule, ruleFlows } from "./FactoryProjection.ts"

/**
 * The Dispatcher event key a repository declares its notification policy
 * under. It is a key of the existing event vocabulary shape, so declaring one
 * needs no new field, schema or producer.
 *
 * @since 1.0.0
 * @category constants
 */
export const NOTIFICATION_POLICY_EVENT = "notification.route"

/**
 * The tag of the example policy flow this repository ships
 * (`flows/notification-policy/flow.ts`), and the tag of the action that
 * decides inside it. A repository may declare any flow id; these name the one
 * a repository can copy.
 *
 * @since 1.0.0
 * @category constants
 */
export const NOTIFICATION_POLICY_FLOW_TAG = "notification-policy"

/**
 * The deciding action inside {@link NOTIFICATION_POLICY_FLOW_TAG}.
 *
 * @since 1.0.0
 * @category constants
 */
export const NOTIFICATION_POLICY_DECIDE_ACTION = "notification-policy/decide"

/**
 * How many recipients one decision may name. A policy is a routing rule, not
 * a mailing list: the bound keeps one malformed answer from fanning a
 * notification across an unbounded set.
 *
 * @since 1.0.0
 * @category constants
 */
export const NOTIFICATION_RECIPIENT_LIMIT = 50

/**
 * A recipient is a bounded typed id — a GitHub login, the same shape the
 * roster validates — never a display name, an address or free text.
 *
 * @since 1.0.0
 * @category schemas
 */
export const NotificationRecipientSchema = z.string().regex(
  /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i,
  "A recipient is a GitHub login"
)

/**
 * The defined set of events a repository policy may route: the work notices
 * §6.4 hard-codes today. A kind outside this set keeps its built-in audience.
 *
 * @since 1.0.0
 * @category constants
 */
export const NOTIFICATION_POLICY_KINDS = [
  "needs_you",
  "approval",
  "conflict",
  "in_review",
  "failed",
  "merged"
] as const

/**
 * The decoded value accepted by {@link NotificationPolicyEventSchema}'s kind.
 *
 * @since 1.0.0
 * @category models
 */
export type NotificationPolicyKind = (typeof NOTIFICATION_POLICY_KINDS)[number]

/**
 * One routable event, by identity alone.
 *
 * It carries the kind, the notice's own entry id and the TODO it belongs to —
 * no title, prompt, body, comment, branch content or error prose. A policy
 * routes by what the event IS, so nothing a repository wrote and nothing a
 * customer typed has to cross into the policy run to make that decision.
 *
 * @since 1.0.0
 * @category schemas
 */
export const NotificationPolicyEventSchema = z.object({
  kind: z.enum(NOTIFICATION_POLICY_KINDS),
  entryId: z.string().min(1).max(200),
  todo: z.number().int().positive().optional()
}).strict()

/**
 * The decoded value accepted by {@link NotificationPolicyEventSchema}.
 *
 * @since 1.0.0
 * @category models
 */
export type NotificationPolicyEvent = z.infer<typeof NotificationPolicyEventSchema>

/**
 * The request the app hands the declared policy flow.
 *
 * `candidates` is everyone who already can read the event — the people a
 * policy may choose among. `defaults` is who the built-in §6.4 policy would
 * tell, always a subset of the candidates, so a policy can see what it is
 * replacing and the app has one place to fall back to.
 *
 * @since 1.0.0
 * @category schemas
 */
export const NotificationPolicyRequestSchema = z.object({
  repo: z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/, "A repository is owner/name"),
  event: NotificationPolicyEventSchema,
  owner: NotificationRecipientSchema,
  candidates: z.array(NotificationRecipientSchema).min(1).max(NOTIFICATION_RECIPIENT_LIMIT),
  defaults: z.array(NotificationRecipientSchema).max(NOTIFICATION_RECIPIENT_LIMIT)
}).strict().refine(
  (request) => request.defaults.every((login) => request.candidates.includes(login)),
  { message: "The built-in audience is always people who can read the event" }
)

/**
 * The decoded value accepted by {@link NotificationPolicyRequestSchema}.
 *
 * @since 1.0.0
 * @category models
 */
export type NotificationPolicyRequest = z.infer<typeof NotificationPolicyRequestSchema>

/**
 * The handling a policy may ask for beside the recipients: `quiet` delivers
 * the notice to the timeline and the repository update without raising a
 * toast. It is the whole allowed metadata surface; there is no free-form
 * field a diagnostic or a secret could ride in.
 *
 * @since 1.0.0
 * @category schemas
 */
export const NotificationHandlingSchema = z.object({ quiet: z.boolean().optional() }).strict()

/**
 * The policy's answer: the recipients it selected, and optionally how to
 * handle them. Strict, so an output carrying any other key is malformed and
 * falls back rather than being partially trusted.
 *
 * @since 1.0.0
 * @category schemas
 */
export const NotificationPolicyDecisionSchema = z.object({
  recipients: z.array(NotificationRecipientSchema).max(NOTIFICATION_RECIPIENT_LIMIT),
  handling: NotificationHandlingSchema.optional()
}).strict()

/**
 * The decoded value accepted by {@link NotificationPolicyDecisionSchema}.
 *
 * @since 1.0.0
 * @category models
 */
export type NotificationPolicyDecision = z.infer<typeof NotificationPolicyDecisionSchema>

/**
 * Why the default policy delivered instead of the repository's own. Closed and
 * bounded: each reason names a real refusal and carries no error text, path,
 * URL, header or credential.
 *
 * - `policy-ambiguous`: the declaration names more than one policy flow.
 * - `policy-unavailable`: the declaration could not be read.
 * - `policy-failed`: the policy run did not reach a decision.
 * - `policy-malformed`: the run answered something that is not a decision.
 * - `policy-superseded`: the account or repository changed before the answer
 *   arrived, so the answer belongs to work this session no longer owns.
 *
 * @since 1.0.0
 * @category constants
 */
export const NOTIFICATION_FALLBACK_REASONS = [
  "policy-ambiguous",
  "policy-unavailable",
  "policy-failed",
  "policy-malformed",
  "policy-superseded"
] as const

/**
 * The decoded value accepted by {@link NotificationFallbackReasonSchema}.
 *
 * @since 1.0.0
 * @category models
 */
export type NotificationFallbackReason = (typeof NOTIFICATION_FALLBACK_REASONS)[number]

/**
 * One of {@link NOTIFICATION_FALLBACK_REASONS}.
 *
 * @since 1.0.0
 * @category schemas
 */
export const NotificationFallbackReasonSchema = z.enum(NOTIFICATION_FALLBACK_REASONS)

/**
 * What a delivered notice records about the decision behind it: whose policy
 * chose the recipients, why the default stood if it did, and how many named
 * recipients were withheld for lack of access.
 *
 * @since 1.0.0
 * @category schemas
 */
export const NotificationPolicyStampSchema = z.object({
  source: z.enum(["policy", "default"]),
  reason: NotificationFallbackReasonSchema.optional(),
  withheld: z.number().int().nonnegative().optional()
}).strict()

/**
 * The decoded value accepted by {@link NotificationPolicyStampSchema}.
 *
 * @since 1.0.0
 * @category models
 */
export type NotificationPolicyStamp = z.infer<typeof NotificationPolicyStampSchema>

/**
 * The outcome of routing one event: who is told, what the notice records, and
 * which named recipients were withheld because they cannot read it.
 *
 * @since 1.0.0
 * @category models
 */
export interface NotificationPolicyOutcome {
  readonly recipients: ReadonlyArray<string>
  readonly stamp: NotificationPolicyStamp
  readonly withheld: ReadonlyArray<string>
  readonly quiet: boolean
}

/**
 * What a repository declares for {@link NOTIFICATION_POLICY_EVENT}.
 *
 * @since 1.0.0
 * @category models
 */
export type NotificationPolicyDeclaration =
  | { readonly kind: "none" }
  | { readonly kind: "flow"; readonly flowId: string }
  | { readonly kind: "ambiguous" }

/**
 * The policy a projection declares. Two rows for the same event, or one row
 * naming several flows, is ambiguous: an unresolved policy is not a policy,
 * and guessing one of them would route notifications by accident.
 *
 * @since 1.0.0
 * @category accessors
 */
export const notificationPolicyDeclaration = (
  projection: Pick<FactoryProjection, "on">
): NotificationPolicyDeclaration => {
  const rows = projection.on.filter((rule: FactoryRule) => rule.event === NOTIFICATION_POLICY_EVENT)
  if (rows.length === 0) return { kind: "none" }
  if (rows.length > 1) return { kind: "ambiguous" }
  const flows = ruleFlows(rows[0]!)
  const flowId = flows[0]
  if (flows.length !== 1 || flowId === undefined || flowId.trim() === "") return { kind: "ambiguous" }
  return { kind: "flow", flowId }
}

/** Candidate order, deduplicated: the order the app offered, never the policy's. */
const inCandidateOrder = (
  candidates: ReadonlyArray<string>,
  keep: (login: string) => boolean
): ReadonlyArray<string> => {
  const seen = new Set<string>()
  const chosen: Array<string> = []
  for (const login of candidates) {
    if (seen.has(login) || !keep(login)) continue
    seen.add(login)
    chosen.push(login)
  }
  return chosen
}

/**
 * The built-in default of mvp.md §6.4, as the request carries it: the TODO's
 * owner for a review, failure or merge, and the owner plus the people on its
 * branch for a wait. `reason` is absent when no policy was asked for, and
 * names the refusal when one was and could not answer.
 *
 * @since 1.0.0
 * @category routing
 */
export const notificationPolicyDefault = (
  request: NotificationPolicyRequest,
  reason?: NotificationFallbackReason
): NotificationPolicyOutcome => {
  const audience = new Set(request.defaults)
  return {
    recipients: inCandidateOrder(request.candidates, (login) => audience.has(login)),
    stamp: { source: "default", ...(reason === undefined ? {} : { reason }) },
    withheld: [],
    quiet: false
  }
}

/**
 * Nobody is told: the account or repository changed while the policy was
 * deciding, so the answer belongs to work this session no longer owns. It
 * delivers and persists nothing — a retired account's late decision is never
 * another account's notification.
 *
 * @since 1.0.0
 * @category routing
 */
export const notificationPolicySuperseded = (): NotificationPolicyOutcome => ({
  recipients: [],
  stamp: { source: "default", reason: "policy-superseded" },
  withheld: [],
  quiet: false
})

/**
 * The repository's own decision, with access checked after it selected.
 *
 * `output` is whatever the policy run answered. It decodes strictly or the
 * default stands with `policy-malformed`. A selected recipient that is not a
 * candidate has no access to the event, so it is withheld and counted — the
 * policy chooses among the people who can already read the work and can never
 * grant access to it.
 *
 * @since 1.0.0
 * @category routing
 */
export const notificationPolicyResult = (
  request: NotificationPolicyRequest,
  output: unknown
): NotificationPolicyOutcome => {
  const decoded = NotificationPolicyDecisionSchema.safeParse(output)
  if (!decoded.success) return notificationPolicyDefault(request, "policy-malformed")
  const selected = new Set(decoded.data.recipients)
  const candidates = new Set(request.candidates)
  const recipients = inCandidateOrder(request.candidates, (login) => selected.has(login))
  const withheld = [...new Set(decoded.data.recipients)].filter((login) => !candidates.has(login))
  return {
    recipients,
    stamp: { source: "policy", ...(withheld.length === 0 ? {} : { withheld: withheld.length }) },
    withheld,
    quiet: decoded.data.handling?.quiet === true
  }
}

/**
 * What a delivered notice should record about this outcome, or nothing.
 *
 * A plain built-in default is the state of the world before any repository
 * declared a policy, so it records nothing and every existing notice is
 * unchanged. A repository's own decision, a withheld recipient and a fallback
 * each record their one typed fact.
 *
 * @since 1.0.0
 * @category routing
 */
export const notificationPolicyRecord = (
  outcome: NotificationPolicyOutcome
): NotificationPolicyStamp | undefined =>
  outcome.stamp.source === "default" && outcome.stamp.reason === undefined && outcome.stamp.withheld === undefined
    ? undefined
    : outcome.stamp

/**
 * Whether one person is told, given an outcome. The only question a single
 * session can answer about a routing decision, and the one every delivery
 * surface asks.
 *
 * @since 1.0.0
 * @category routing
 */
export const notifies = (outcome: NotificationPolicyOutcome, login: string): boolean =>
  outcome.recipients.includes(login)
