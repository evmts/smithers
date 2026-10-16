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
 * 250 ms apart, so ten seconds at most, then the built-in audience is told
 * with `policy-failed`. A repository that claims the decision owns that wait;
 * a repository that claims nothing waits for nothing, because no run starts.
 */
const DEFAULT_ATTEMPTS = 40

const DEFAULT_POLL_MS = 250

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
    current: () => boolean
  ): Promise<unknown> => {
    const attempts = options.attempts ?? DEFAULT_ATTEMPTS
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (!current()) return undefined
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

  const route: NotificationPolicyRoute = async (event, people, current) => {
    const candidates = [...new Set(people.candidates)]
    const defaults = candidates.filter((login) => people.defaults.includes(login))
    const repo = options.repoFor?.() ?? (() => {
      const target = resolveTargetRepo(ctx.store, undefined)
      return "error" in target ? undefined : target.repo
    })()
    const parsed = NotificationPolicyRequestSchema.safeParse({ repo: repo ?? "", event, owner: people.owner, candidates, defaults })
    /*
     * No repository, or an identity this contract cannot name: there is no
     * repository policy to ask, so the built-in audience stands exactly as it
     * does today. This is the ordinary path for every notice on a host with no
     * repository target, and it records nothing.
     */
    if (!parsed.success) return { recipients: defaults, stamp: { source: "default" }, withheld: [], quiet: false }
    const request: NotificationPolicyRequest = parsed.data
    if (!current()) return notificationPolicySuperseded()
    const declaration = await readDeclaration(request.repo)
    if (declaration === undefined) return notificationPolicyDefault(request, "policy-unavailable")
    if (declaration.kind === "ambiguous") return notificationPolicyDefault(request, "policy-ambiguous")
    if (declaration.kind === "none") return notificationPolicyDefault(request)
    if (!current()) return notificationPolicySuperseded()
    const binding = options.bindingFor(request.repo)
    if ("error" in binding) return notificationPolicyDefault(request, "policy-unavailable")
    /*
     * One run per event: the key is the notice's own identity, so a repeated
     * read of the same TODO joins the decision already in flight instead of
     * starting a second policy run.
     */
    const launched = await options.gateway.launch(request.repo, declaration.flowId, request, binding, {
      idempotencyKey: `notification-policy:${request.repo}:${request.event.kind}:${request.event.entryId}`,
      stillCurrent: current
    })
    if (!current()) return notificationPolicySuperseded()
    if (launched.status !== "ok") return notificationPolicyDefault(request, "policy-failed")
    const answer = await decisionOf(request.repo, launched.value.runId, binding, current)
    // A late answer belongs to work this session no longer owns: it decides
    // nothing and nobody is told from it.
    if (!current()) return notificationPolicySuperseded()
    if (answer === undefined) return notificationPolicyDefault(request, "policy-failed")
    return notificationPolicyResult(request, answer)
  }

  return { route }
}
