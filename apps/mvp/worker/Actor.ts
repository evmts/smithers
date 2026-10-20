import { Context, Effect, Layer, type Option, Schema } from "effect"
import type { HttpServerRequest } from "effect/http"
import type { Role } from "../src/features/auth/contract.ts"

// Who is acting (docs/features/sign-in.md). `Sessions` resolves the person behind a request: worker/SignIn.ts
// provides it from the session cookie, local development may provide a local developer, and a test provides its own
// actor through a layer. `CurrentActor` is the actor a flow step runs as.

export type { Role }

/**
 * Who is acting: a signed-in person and their role on the repository (decision 0007), `null` when they have none,
 * and, when an agent, flow or sandbox acts for them, which one (RFC 8693's `act`, decision 0008 §1).
 */
export interface Actor {
  readonly subject: { readonly kind: "person"; readonly id: string }
  readonly role: Role | null
  /** The person's GitHub login when sign-in knows it: a snapshot for what they author, such as a terminal's owner. */
  readonly login?: string
  readonly act?: { readonly kind: "agent" | "flow" | "sandbox"; readonly id: string }
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
