/*
 * The repository's own notification policy, run on the paths the app already
 * has (M-47, mvp.md §6.17, #4026).
 *
 * The declaration is one row of the Dispatcher table the repository already
 * writes — `on: { "notification.route": { flow: "<id>" } }` in
 * `.smithers/FACTORY.ts` — read through the same signed-out contents route the
 * Dispatcher card and the palette read (seams/TriggersSeam.ts
 * `readFactoryProjection`). Nothing new is declared, projected or stored for
 * it.
 *
 * The run is one ordinary workflow launch: Plan, the approval the launch
 * carries, Run, then the run summary's own answer (controller/gateway.ts). The
 * policy is a repository flow like any other, so it has a run, a plan and a
 * verdict a person can open; this seam adds no second execution path for it.
 *
 * What crosses into the run is identity alone: the repository, the notice's
 * kind and entry id, the TODO it belongs to, the login the work belongs to,
 * and the people who already can read it. No title, prompt, body, diff or
 * error text travels, so a policy decision cannot carry repository content or
 * a customer's words into a notification or a diagnostic. What comes back is
 * bounded typed recipient ids plus the one allowed handling flag
 * (@smthrs/rpc/NotificationPolicy), parsed strictly.
 *
 * Every refusal lands on the built-in §6.4 default with one closed reason, so
 * a repository whose policy is absent, ambiguous, unreadable, failed,
 * malformed or superseded still gets its notifications — and the notice
 * records which of those happened.
 */
import {
  type NotificationPolicyDeclaration,
  type NotificationPolicyEvent,
  notificationPolicyDeclaration,
  notificationPolicyDefault,
  type NotificationPolicyOutcome,
  type NotificationPolicyRequest,
  NotificationPolicyRequestSchema,
  notificationPolicyResult,
  notificationPolicySuperseded
} from "@smthrs/rpc/NotificationPolicy"
import { resolveTargetRepo } from "../RepoContext"
import type { SeamContext } from "../seams/SeamContext"
import { readFactoryProjection } from "../seams/TriggersSeam"
import type { GatewaySeam, GatewayWorkspaceBinding } from "./gateway"

/*
 * How long a notice waits for the repository's answer: 40 run-summary reads,
 * 250 ms apart, then the built-in audience is told with `policy-failed`. A
 * repository that claims the decision owns that wait; a repository that claims
 * nothing waits for nothing, because no run starts.
 *
 * The read count alone bounds nothing: neither the launch nor one HTTP read is
 * bounded by this loop — `controller/gateway.ts` sets no fetch deadline, and it
 * re-reads a provisioning snapshot for up to 180 s PER call. So the wait is
 * bounded by the clock as well as by the count, and whichever ends first ends
 * the wait.
 *
 * END TO END means the clock starts before the FIRST awaited stage and covers
 * every stage that can hold delivery: the declaration read, the launch, and
 * the run-summary poll. The declaration read is the one every notice crosses,
 * declared policy or not, so leaving it outside would let a parked mirror
 * suppress an ordinary no-policy notification rather than delay it. Past the
 * deadline nobody is still polling, nothing continues into a new effect, and
 * the default is told exactly once: a hung policy can delay a notification
 * but never suppress it and never deliver it twice.
 */
const DEFAULT_ATTEMPTS = 40

const DEFAULT_POLL_MS = 250

/** The end-to-end wait: ten seconds from before the declaration read, as #4026 states. */
const DEFAULT_DEADLINE_MS = 10_000

/** The wait ended before the work did. */
const EXPIRED = Symbol("notification-policy-deadline")

/**
 * `work`, or {@link EXPIRED} once `ms` has passed. A rejection the race has
 * already lost stays this promise's own, so an orphaned read is never an
 * unhandled rejection.
 */
const withinDeadline = async <T>(work: Promise<T>, ms: number): Promise<T | typeof EXPIRED> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  void work.catch(() => {})
  try {
    return await Promise.race([
      work,
      new Promise<typeof EXPIRED>((resolve) => { timer = setTimeout(() => resolve(EXPIRED), Math.max(1, ms)) })
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

const TERMINAL = new Set(["completed", "failed", "cancelled"])

/**
 * Route one notice: who is told, what the notice records, and which named
 * recipients were withheld for lack of access.
 *
 * `current` is the caller's own fence — its account, identity revision and
 * repository. It is asked before the run starts and again before the answer
 * is believed, so a policy answer that arrives after an account or repository
 * switch decides nothing.
 */
export type NotificationPolicyRoute = (
  event: NotificationPolicyEvent,
  /**
   * `candidates` is everyone who already can read the event; `defaults` is who
   * the built-in §6.4 audience would tell, and is always a subset of them.
   */
  people: {
    readonly owner: string
    readonly candidates: ReadonlyArray<string>
    readonly defaults: ReadonlyArray<string>
  },
  current: () => boolean
) => Promise<NotificationPolicyOutcome>

export interface NotificationPolicyRouterOptions {
  readonly gateway: Pick<GatewaySeam, "launch" | "run">
  readonly bindingFor: (repo: string) => GatewayWorkspaceBinding | { readonly error: string }
  /** The repository the notice belongs to; the active target by default. */
  readonly repoFor?: () => string | undefined
  readonly pollMs?: number
  readonly attempts?: number
  /** The whole wait for one decision, declaration read included; ten seconds by default. */
  readonly deadlineMs?: number
  readonly now?: () => number
}

export interface NotificationPolicyRouter {
  readonly route: NotificationPolicyRoute
}

export const createNotificationPolicyRouter = (
  ctx: SeamContext,
  options: NotificationPolicyRouterOptions
): NotificationPolicyRouter => {
  /*
   * One read of each repository's declaration per session, the cadence the
   * flow catalog already uses (seams/RepositoryFlowsSeam.ts). Only an answered
   * read is kept: a refused one states nothing about what the repository
   * declares, so the next notice asks again instead of inheriting a verdict
   * the read never reached.
   *
   * The declaration is the repository's own public projection, served to a
   * signed-out visitor, so nothing account-private is held here and an
   * account switch has nothing to scrub. The decision a declaration leads to
   * is a different matter, and is fenced on `current` below.
   */
  const declared = new Map<string, NotificationPolicyDeclaration>()
  const readDeclaration = async (repo: string): Promise<NotificationPolicyDeclaration | undefined> => {
    const held = declared.get(repo)
    if (held !== undefined) return held
    const answer = await readFactoryProjection(ctx, repo)
    if ("error" in answer) return undefined
    const declaration: NotificationPolicyDeclaration = answer.absent
      ? { kind: "none" }
      : notificationPolicyDeclaration(answer.projection)
    declared.set(repo, declaration)
    return declaration
  }

  const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(1, ms)))

  /** The run's own answer, or undefined if it never reached a decision. */
  const decisionOf = async (
    repo: string,
    runId: string,
    binding: GatewayWorkspaceBinding,
    current: () => boolean,
    beyond: () => boolean
  ): Promise<unknown> => {
    const attempts = options.attempts ?? DEFAULT_ATTEMPTS
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (!current() || beyond()) return undefined
      const summary = await options.gateway.run(repo, runId, binding)
      if (summary.status !== "ok") return undefined
      const row = summary.value
      if (row !== undefined && TERMINAL.has(row.status)) {
        if (row.status !== "completed" || row.finalOutput === undefined) return undefined
        try {
          return JSON.parse(row.finalOutput) as unknown
        } catch {
          // Not a decision: the strict parse below records `policy-malformed`.
          return row.finalOutput
        }
      }
      await pause(options.pollMs ?? DEFAULT_POLL_MS)
    }
    return undefined
  }

  /**
   * The repository this session is pointed at right now, by the same
   * resolution every other act uses (RepoContext.ts `resolveTargetRepo`).
   * Read again on every fence, never captured once: a TODO card carries no
   * repository of its own, so the active target is the only repository a
   * notice has, and a notice decided under one must not be delivered under
   * another.
   */
  const activeRepo = (): string | undefined => {
    if (options.repoFor !== undefined) return options.repoFor()
    const target = resolveTargetRepo(ctx.store, undefined)
    return "error" in target ? undefined : target.repo
  }

  const decide = async (
    event: NotificationPolicyEvent,
    owner: string,
    current: () => boolean,
    candidates: ReadonlyArray<string>,
    defaults: ReadonlyArray<string>
  ): Promise<NotificationPolicyOutcome> => {
    const repo = activeRepo()
    const parsed = NotificationPolicyRequestSchema.safeParse({ repo: repo ?? "", event, owner, candidates, defaults })
    /*
     * No repository, or an identity this contract cannot name: there is no
     * repository policy to ask, so the built-in audience stands exactly as it
     * does today. This is the ordinary path for every notice on a host with no
     * repository target, and it records nothing.
     */
    if (!parsed.success) return { recipients: defaults, stamp: { source: "default" }, withheld: [], quiet: false }
    const request: NotificationPolicyRequest = parsed.data
    /*
     * The caller's fence AND this decision's own repository. The caller knows
     * the account and the identity revision; only this seam knows which
     * repository the decision was started for, and #4026 promises all three
     * are re-checked before an answer is believed.
     */
    const fenced = () => current() && activeRepo() === request.repo
    const now = options.now ?? Date.now
    const until = now() + (options.deadlineMs ?? DEFAULT_DEADLINE_MS)
    const beyond = () => now() >= until
    /** What is left of the end-to-end wait, for the next stage that awaits. */
    const remaining = () => until - now()
    if (!fenced()) return notificationPolicySuperseded()
    /*
     * Inside the bound, and the stage the bound starts before: a mirror that
     * parks on the contents route must delay a notification, never suppress
     * one. An abandoned read still finishes into `declared`, so the next
     * notice inherits an answered read rather than asking again.
     */
    const declaration = await withinDeadline(readDeclaration(request.repo), remaining())
    /*
     * The fence is re-asked HERE, before the three refusals below return. An
     * absent declaration is the common case, and a default told under the
     * repository the person moved to while the read was in flight is the same
     * cross-repository delivery the declared path already fences.
     */
    if (!fenced()) return notificationPolicySuperseded()
    /*
     * The declaration could not be read — a refused read, or one the bound
     * ended. Either way nothing is known about what the repository declares,
     * which is `policy-unavailable`; `policy-failed` stays the run's own
     * reason for a decision that started and did not land.
     */
    if (declaration === EXPIRED || declaration === undefined) return notificationPolicyDefault(request, "policy-unavailable")
    if (declaration.kind === "ambiguous") return notificationPolicyDefault(request, "policy-ambiguous")
    /*
     * Rule 2, unchanged by the bound: a repository that declares nothing gets
     * the existing default with no record at all. It is told here whether the
     * read was quick or slow, because the read ANSWERED — "no policy" is
     * knowledge, not a refusal, and stamping it would misreport the
     * repository.
     */
    if (declaration.kind === "none") return notificationPolicyDefault(request)
    const binding = options.bindingFor(request.repo)
    if ("error" in binding) return notificationPolicyDefault(request, "policy-unavailable")
    /*
     * One run per event: the key is the notice's own identity, so a repeated
     * read of the same TODO joins the decision already in flight instead of
     * starting a second policy run.
     */
    const launched = await withinDeadline(options.gateway.launch(request.repo, declaration.flowId, request, binding, {
      idempotencyKey: `notification-policy:${request.repo}:${request.event.kind}:${request.event.entryId}`,
      /*
       * The only guard the relay consults between Plan, Approval.Submit and
       * Run, so it has to know the decision already fell back: a Plan the
       * workspace answers late must not grant an approval and start a run for
       * an answer nobody will believe. The deadline is part of being current.
       *
       * This is also what keeps the bound from needing a clock check of its
       * own at each stage: `withinDeadline` can only end a stage it is still
       * racing, but the relay asks this before `Plan` as well as between the
       * three calls, so a declaration that answers just as the deadline
       * passes starts nothing either.
       */
      stillCurrent: () => fenced() && !beyond()
    }), remaining())
    if (!fenced()) return notificationPolicySuperseded()
    if (launched === EXPIRED || launched.status !== "ok") return notificationPolicyDefault(request, "policy-failed")
    const answer = await withinDeadline(decisionOf(request.repo, launched.value.runId, binding, fenced, beyond), remaining())
    // A late answer belongs to work this session no longer owns: it decides
    // nothing and nobody is told from it.
    if (!fenced()) return notificationPolicySuperseded()
    if (answer === EXPIRED || answer === undefined) return notificationPolicyDefault(request, "policy-failed")
    return notificationPolicyResult(request, answer)
  }

  const route: NotificationPolicyRoute = async (event, people, current) => {
    const candidates = [...new Set(people.candidates)]
    const defaults = candidates.filter((login) => people.defaults.includes(login))
    try {
      return await decide(event, people.owner, current, candidates, defaults)
    } catch {
      /*
       * Rule 3 holds for this seam's own boundary too: an unexpected throw
       * below — a store read, a workspace binding, a transport — is a refusal
       * like any other, so the default audience is told with one closed
       * reason. Nothing of the throw is part of that record, and the caller
       * never has to own a rejection to keep its notifications working.
       *
       * This fallback deliberately does NOT re-ask the scope. It cannot
       * revive one, because no stage between a fence and the next one throws:
       * every stage that awaits is total — `readFactoryProjection` answers
       * `{ error }` for a refused read, and the gateway catches its own fetch
       * and decodes every row through `Schema.decodeUnknownOption`, so no
       * relay answer and no transport failure leaves it as a throw. The one
       * throwing stage a caller can supply, `bindingFor`, is synchronous and
       * runs immediately after the fence above, so a repository or account
       * that moved is already answered as `policy-superseded` before it is
       * called. An origin recheck here was written, tested and ablated: with
       * the fence above in place nothing reached it (lane 81).
       */
      return { recipients: defaults, stamp: { source: "default", reason: "policy-unavailable" }, withheld: [], quiet: false }
    }
  }

  return { route }
}
