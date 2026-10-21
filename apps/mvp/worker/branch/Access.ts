import { Effect, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import {
  type Access,
  type Mode,
  MODES,
  REPOSITORY_GRANTEE,
  SHARE_ACCESSES,
  type ShareAccess,
} from "../../src/features/branch/contract.ts"
import { type Actor, canAsk, type Role } from "../Actor.ts"

// Who may do what on a branch's live workspace (decision 0013 §2 and §4, docs/features/branch-workspace.md#sharing):
// its conversation, its terminals, its room. A live branch is private to its creator until they share it, Google Docs
// style: with people by name, to view or edit, or with anyone in the repository who has the link. Every route, socket
// and host of the branch workspace decides with `accessOf`, at every check, so a change of policy is a change here.
//
// Seams for the features beside this one (no tables of their own):
// - Notifications (worker/Notifications.ts) route a run on a branch to the people watching it: a watcher whose
//   `branchAccess` is `none` gets nothing, and a watch is recorded only for someone who may view the branch.
// - Presence (worker/BranchRooms.ts): the room admits `view` and up, and `enforce` closes the sockets of anyone a
//   change narrowed. The agent's run on a branch shows from the runs a branch's people see, not from presence.

/** Who a share narrows to: what each role may get at most. A Member or above may edit; a Guest only view. */
const MEMBER_OR_ABOVE: ReadonlySet<Role> = new Set(["admin", "maintainer", "member"])

/** The most a person with `role` may do on any branch: `edit` for a Member or above, `view` for a Guest, else nothing. */
export const ceilingOf = (role: Role | null): ShareAccess | "none" =>
  role === null ? "none" : MEMBER_OR_ABOVE.has(role) ? "edit" : "view"

/**
 * A branch's grants as one person's check reads them: who created it (its owner, `null` for the team's branches), the
 * person's own share, and the grant to anyone in the repository with the link.
 */
export interface Grants {
  readonly createdBy: string | null
  readonly person: ShareAccess | null
  readonly repository: ShareAccess | null
}

const rank = { none: 0, view: 1, edit: 2 } as const

const lower = (left: ShareAccess | "none", right: ShareAccess | "none") => (rank[left] <= rank[right] ? left : right)

/**
 * What `actor` may do on a branch with `grants`: `owner` (its creator, a Member or above), else the best of their own
 * share and, for a Member or above, the link's, never above their role's ceiling; `none` when signed out or granted
 * nothing. A Guest opens a branch only when it is shared with them by name, and only to view.
 */
export const accessOf = (actor: Option.Option<Actor>, grants: Grants): Access | "none" => {
  if (Option.isNone(actor)) return "none"
  const ceiling = ceilingOf(actor.value.role)
  if (ceiling === "none") return "none"
  if (ceiling === "edit" && grants.createdBy === actor.value.subject.id) return "owner"
  const person = grants.person ?? "none"
  const link = ceiling === "edit" ? grants.repository ?? "none" : "none"
  return lower(rank[person] >= rank[link] ? person : link, ceiling)
}

/** Whether `access` opens the live branch: its conversation, terminals and room. */
export const canView = (access: Access | "none"): access is Access => access !== "none"

/** Whether `access` writes to the live branch: asks in its conversation and types in its terminals. */
export const canEdit = (access: Access | "none"): boolean => access === "owner" || access === "edit"

/** A branch's whole permission list, as the hosts of its sockets apply it to everyone connected (`underPolicy`). */
export interface Policy {
  readonly createdBy: string | null
  readonly grants: Readonly<Record<string, ShareAccess>>
}

export const PolicySchema = Schema.Struct({
  createdBy: Schema.NullOr(Schema.String),
  grants: Schema.Record(Schema.String, Schema.Literals(SHARE_ACCESSES)),
})

/** What `principal`, with `role`, may do under `policy`. */
export const underPolicy = (policy: Policy, principal: string, role: Role | null): Access | "none" =>
  accessOf(Option.some({ subject: { kind: "person", id: principal }, role }), {
    createdBy: policy.createdBy,
    person: Object.hasOwn(policy.grants, principal) ? policy.grants[principal]! : null,
    repository: Object.hasOwn(policy.grants, REPOSITORY_GRANTEE) ? policy.grants[REPOSITORY_GRANTEE]! : null,
  })

/** A living branch as an access check reads it. */
export interface BranchAccess {
  readonly branchId: string
  readonly conversationId: string
  readonly repoId: string
  readonly name: string
  readonly mode: Mode
  readonly createdBy: string | null
  readonly access: Access | "none"
}

const Row = Schema.Struct({
  branchId: Schema.String,
  conversationId: Schema.String,
  repoId: Schema.String,
  name: Schema.String,
  mode: Schema.Literals(MODES),
  createdBy: Schema.NullOr(Schema.String),
  person: Schema.NullOr(Schema.Literals(SHARE_ACCESSES)),
  repository: Schema.NullOr(Schema.Literals(SHARE_ACCESSES)),
})
const decodeRow = Schema.decodeUnknownEffect(Row)

/** The person `actor` acts as, for reading their own share: nobody signed out. */
const personOf = (actor: Option.Option<Actor>) => (Option.isSome(actor) ? actor.value.subject.id : "")

/**
 * Living branch `branchId` (or, with `by: "conversation"`, the branch of conversation `id`) and what `actor` may do on
 * it, in one query: `undefined` when there is no such branch.
 */
export const branchAccess = (actor: Option.Option<Actor>, id: string, by: "branch" | "conversation" = "branch") =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const person = personOf(actor)
    const rows = yield* sql`
      SELECT b.id AS "branchId", c.id AS "conversationId", b.repo_id AS "repoId", b.name, b.mode,
        b.created_by AS "createdBy",
        (SELECT access FROM branch_shares s WHERE s.branch_id = b.id AND s.grantee = ${person}
          AND ${person} <> ${REPOSITORY_GRANTEE}) AS person,
        (SELECT access FROM branch_shares s WHERE s.branch_id = b.id AND s.grantee = ${REPOSITORY_GRANTEE}) AS repository
      FROM branches b JOIN conversations c ON c.branch_id = b.id
      WHERE ${by === "branch" ? sql`b.id = ${id}` : sql`c.id = ${id}`} AND b.deleted_at IS NULL`
    if (rows[0] === undefined) return undefined
    const row = yield* decodeRow(rows[0]).pipe(Effect.orDie)
    const access = accessOf(actor, { createdBy: row.createdBy, person: row.person, repository: row.repository })
    const { person: _person, repository: _repository, ...branch } = row
    return { ...branch, access } satisfies BranchAccess
  })

/** Branch `branchId`'s whole permission list, as `underPolicy` applies it. */
export const policyOf = (branchId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [branch] = yield* sql<{ readonly createdBy: string | null }>`
      SELECT created_by AS "createdBy" FROM branches WHERE id = ${branchId}`
    const rows = yield* sql<{ readonly grantee: string; readonly access: ShareAccess }>`
      SELECT grantee, access FROM branch_shares WHERE branch_id = ${branchId}`
    return {
      createdBy: branch?.createdBy ?? null,
      grants: Object.fromEntries(rows.map((row) => [row.grantee, row.access])),
    } satisfies Policy
  })

/** Whether `actor` is a Member or above: who may track a branch, and own one (`repo:branch-create`, decision 0007). */
export const isMember = (actor: Option.Option<Actor>): actor is Option.Some<Actor> =>
  Option.isSome(actor) && canAsk(actor.value)
