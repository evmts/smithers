import type { Option } from "effect"
import type { Mode } from "../../src/features/branch/contract.ts"
import { type Actor, canAsk } from "../Actor.ts"

// Who may watch and write a branch's live workspace (decision 0013 §2, "Who may watch and write"): its conversation,
// its terminals, and later its presence and live edits. Every route and flow of the branch workspace asks these two
// functions, so a change of policy is a change here.

/**
 * Whether the live workspace of a public repository is open to everyone, rather than only to its Members (decision
 * 0013, question 1 for Will). Unanswered; built with the recommended answer, `false`: Members only. A "no" from Will is
 * this one line set to `true`.
 */
export const LIVE_BRANCHES_PUBLIC = false

/** What a repository's visibility is. Every repository this deployment can track today is public (decision 0006). */
export type Visibility = "public" | "private"

/**
 * Who may watch under a policy: a Member or above (`repo:branch-watch`), or, only if `livePublic`, anyone at all on a
 * public repository. Signed out, nobody watches a private one.
 */
export const watchPolicy = (livePublic: boolean) => (actor: Option.Option<Actor>, visibility: Visibility): boolean =>
  (actor._tag === "Some" && canAsk(actor.value)) || (livePublic && visibility === "public")

/** Whether `actor` may watch a branch's live workspace, under `LIVE_BRANCHES_PUBLIC`. */
export const mayWatch = watchPolicy(LIVE_BRANCHES_PUBLIC)

/**
 * Whether `actor` may write to a branch (`repo:branch-write`): open a terminal, and later edit files and run jobs. A
 * Member or above, on a branch that isn't `locked`. `restricted` branches' named writers come with sharing.
 */
export const mayWrite = (actor: Option.Option<Actor>, mode: Mode): boolean =>
  actor._tag === "Some" && canAsk(actor.value) && mode === "open"
