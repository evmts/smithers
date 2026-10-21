import { Context, Effect, Layer, Metric, type Option, Schema } from "effect"
import type { HttpServerRequest } from "effect/http"
import type { Role } from "../src/features/auth/contract.ts"
import type { registry } from "../src/flows/registry.ts"

// Who is acting (docs/features/sign-in.md). `Sessions` resolves the person behind a request: worker/SignIn.ts
// provides it from the session cookie, local development may provide a local developer, and a test provides its own
// actor through a layer. `CurrentActor` is the actor a flow step runs as.

export type { Role }

/**
 * Who acts for a person (decision 0017 slice 0): an agent's run, a flow's own run, a frame's dispatch (`app`) or a
 * container's (`sandbox`).
 */
export type ActKind = "agent" | "flow" | "app" | "sandbox"

/**
 * The run acting for a person, as its server-minted run credential says (worker/RunCredentials.ts): never from a
 * request's body, so a route reads who acts from here alone.
 */
export interface Act {
  readonly kind: ActKind
  /** The run acting: its execution id. */
  readonly id: string
  /** The run its credential's chain started from: the run a run-bound route, its report or its answer, must be. */
  readonly root?: string
  /** The flows from the chain's root to this run, root first. */
  readonly chain?: ReadonlyArray<string>
  /** Its effective capability ceiling, narrowed at every hop, in transported form: `[]` is unrestricted. */
  readonly ceiling?: ReadonlyArray<ReadonlyArray<string>>
}

/**
 * Who is acting: a signed-in person and their role on the repository (decision 0007), `null` when they have none,
 * and, when an agent, flow, frame or sandbox acts for them, which one (RFC 8693's `act`, decision 0008 §1). Only a
 * run credential sets `act`; the person's own session never does.
 */
export interface Actor {
  readonly subject: { readonly kind: "person"; readonly id: string }
  readonly role: Role | null
  /** The person's GitHub login when sign-in knows it: a snapshot for what they author, such as a terminal's owner. */
  readonly login?: string
  readonly act?: Act
  /**
   * The sign-in session the request came with, when sign-in resolved one: a person's own GitHub write runs with that
   * session's GitHub token (decision 0012 §5). Absent for local development's developer and in tests that need none.
   */
  readonly session?: string
}

/** Member or above (decision 0007 §1): the roles that may ask Smithers (`repo:ask`) and clone. */
const MEMBER_OR_ABOVE: ReadonlySet<Role> = new Set(["admin", "maintainer", "member"])

/**
 * Whether `actor` may ask Smithers (`repo:ask`, decision 0007 §2): Member, Maintainer or Admin. A Guest, or a person
 * with no role, may not. An agent acting for a person asks with that person's role.
 */
export const canAsk = (actor: Actor): boolean => actor.role !== null && MEMBER_OR_ABOVE.has(actor.role)

/**
 * Whether `actor` may clone a repository into Code Storage: Member, Maintainer or Admin, the tier of
 * `repo:branch-create` (decision 0007 §2), because a clone spends the deployment's Code Storage budget and takes one of
 * its repositories. A Guest, or a person with no role, may not.
 */
export const canClone = (actor: Actor): boolean => actor.role !== null && MEMBER_OR_ABOVE.has(actor.role)

/** Sessions couldn't be read, for example because Postgres is unreachable: neither signed in nor signed out. */
export class SessionsUnavailable extends Schema.TaggedError<SessionsUnavailable>()(
  "@smthrs/mvp/auth/SessionsUnavailable",
  {},
) {}

/** Resolves the actor behind a request: `None` for a signed-out request. */
export class Sessions extends Context.Service<
  Sessions,
  {
    readonly resolve: Effect.Effect<Option.Option<Actor>, SessionsUnavailable, HttpServerRequest.HttpServerRequest>
  }
>()("@smthrs/mvp/Sessions") {}

/** Every request signed out: what a deployment without sign-in configured resolves, and the tests' default. */
export const signedOut: Layer.Layer<Sessions> = Layer.succeed(Sessions, Sessions.of({ resolve: Effect.succeedNone }))

/** The actor a flow step runs as. The host that starts the run provides it; a payload never names it. */
export class CurrentActor extends Context.Service<CurrentActor, Actor>()("@smthrs/mvp/CurrentActor") {}

/** Whether a run-bound route may act on run `runId` for `actor`: the person may; a credential only on its own chain. */
export const boundTo = (actor: Actor, runId: string): boolean =>
  actor.act === undefined || (actor.act.root ?? actor.act.id).toLowerCase() === runId.toLowerCase()

// Person-only acts (decision 0017, slice 0): what only the person's own press does. The list is the registry's: every
// flow with a `userOnlyReason` (src/flows/registry.ts) is a key below, and the compiler refuses one missing or one too
// many, so the two can't drift. Each says how the server keeps it the person's: the route that refuses anyone acting
// for them (`403 person_only`), or why no server route needs to. src/flows/registry.test.ts holds each `route` to it.

type Registry = typeof registry
type FlowName = keyof Registry & string

/** The registry's person-only flows: each entry with a `userOnlyReason`. */
export type PersonOnlyFlow = {
  [N in FlowName]: Registry[N] extends { readonly userOnlyReason: string } ? N : never
}[FlowName]

/** The registry's agents: each entry marked `acts: "agent"`. Inside one, every run acts as the agent. */
export type AgentFlow = { [N in FlowName]: Registry[N] extends { readonly acts: "agent" } ? N : never }[FlowName]

/**
 * How a person-only flow stays the person's: its run is the person's act, whose `route` refuses anyone acting for them;
 * or only the person `starts` it, at a route that refuses an `act`, while the run itself acts as an agent; or it reaches
 * no server route at all (`device`), and says why.
 */
export type PersonOnlyEnforcement =
  | { readonly route: string }
  | { readonly starts: string }
  | { readonly device: string }

/** Every person-only flow of the registry, and how the server keeps it the person's. */
export const PERSON_ONLY_FLOWS = {
  "timeline/summarize": { device: "The device projects conversation labels and reaches only the metered model role; no approval or shared write authority is granted." },
  "repo/about": { device: "A repository's page reads what GitHub says of it through RepoApi's about route, which any visitor may read; it grants nothing." },
  "chat/Answer": { starts: "POST /api/questions" },
  "chat/Close": {
    device: "The asking tab settles its own answer through the answer route its agent writes; it grants nothing more.",
  },
  "chat/edit": { device: "It takes a question back from this device's outbox, which no server route serves." },
  "run/answer": { route: "POST /api/runs/<id>/answer" },
  "run/deliver": { device: "It delivers an answer the server already recorded to this device's engine." },
  "flow/answer": { route: "POST /api/flow-drafts/<id>/answers" },
  "flow/run/prompt": { device: "flow/run starts it as its child; its requests are the agent's, under its credential." },
  "branch/share": { route: "POST /api/branches/<id>/shares" },
  "terminal/open": { route: "POST /api/terminals" },
  "issue/commitment": { route: "POST /api/repos/<owner>/<name>/writes" },
  "issue/triage": { route: "POST /api/repos/<owner>/<name>/writes" },
  "triage/run": { route: "POST /api/repos/<owner>/<name>/writes" },
  "triage/enable": { route: "POST /api/repos/<owner>/<name>/writes" },
  "triage/pause": { route: "POST /api/repos/<owner>/<name>/writes" },
  "todo/commit": { route: "POST /api/repos/<owner>/<name>/stack" },
  "todo/drop": { route: "POST /api/repos/<owner>/<name>/stack" },
  "notification/ack": { route: "POST /api/notifications/ack" },
  "alert/channel": { route: "POST /api/alert-channels" },
} as const satisfies { readonly [N in PersonOnlyFlow]: PersonOnlyEnforcement }

/**
 * The server's own protected acts, which no flow of the registry names: each route refuses anyone acting for the
 * person. Merging, approving, pre-approving, members, roles and plugin grants join this list with their routes.
 */
export const PROTECTED_ACTS = {
  secret: { route: "PUT, DELETE /api/repos/<owner>/<name>/secrets/<name>" },
  // Merging a pull request (decision 0012 decision 6): a person's press only, never the agent's or a flow's.
  "pr/merge": { route: "POST /api/repos/<owner>/<name>/writes" },
} as const

/** A person-only act: a registry flow with a `userOnlyReason`, or a protected act. */
export type PersonOnlyAct = PersonOnlyFlow | keyof typeof PROTECTED_ACTS

/**
 * The registry's agents, which the server reads when it mints a credential's `act`: each entry marked
 * `acts: "agent"`, and the compiler refuses one missing or one too many.
 */
export const AGENT_FLOWS: ReadonlySet<string> = new Set(
  Object.keys({ "chat/Answer": true, "flow/new": true, "flow/run/prompt": true } as const satisfies {
    readonly [N in AgentFlow]: true
  }),
)

/** Whether a credential's run may be minted for `flow` at all: no person-only flow whose route refuses an `act`. */
export const refusesCredential = (flow: string): boolean =>
  Object.hasOwn(PERSON_ONLY_FLOWS, flow) && "route" in PERSON_ONLY_FLOWS[flow as PersonOnlyFlow]

/** Person-only acts refused, by `act` and who tried (`by`: the act's kind). */
export const personOnlyRefusals = Metric.counter("smithers_person_only_refusals", {
  description: "Person-only acts refused because an agent, flow, frame or sandbox acted for the person, by act and kind",
  incremental: true,
})

/**
 * Whether person-only `act` must refuse `actor`: anyone acts for the person. A refusal is a log line
 * `auth.person_only` and a count, by the act and who tried; neither carries content.
 */
export const refusesPersonOnly = (actor: Actor, act: PersonOnlyAct): Effect.Effect<boolean> =>
  actor.act === undefined ? Effect.succeed(false) : Effect.gen(function* () {
    const by = actor.act!.kind
    yield* Metric.update(Metric.withAttributes(personOnlyRefusals, { act, by }), 1)
    yield* Effect.logWarning("auth.person_only").pipe(
      Effect.annotateLogs({ act, by, runId: actor.act!.id, depth: actor.act!.chain?.length ?? 1 }),
    )
    return true
  })
