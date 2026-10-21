import { Schema } from "effect"
import { ACCESSES, MODES, REFUSALS } from "./contract"

// The branch workspace's rows (decision 0013, docs/features/branch-workspace.md): what `POST /api/branches` answers,
// and the branch this tab's route shows.

/**
 * A branch the app tracks, as `POST /api/branches` answers it: its id, its conversation's, its mode, and what the
 * person may do on it (docs/features/branch-workspace.md#sharing).
 */
export const Tracked = Schema.Struct({
  branchId: Schema.String,
  conversationId: Schema.String,
  repoId: Schema.String,
  name: Schema.String,
  mode: Schema.Literals(MODES),
  access: Schema.Literals(ACCESSES),
})
export type Tracked = typeof Tracked.Type

/** A refusal's body: its code. */
export const Refused = Schema.Struct({ code: Schema.Literals(REFUSALS) })

/**
 * The branch this tab's route shows. One row:
 * - `tracking` while `branch/track` runs;
 * - `ready` with the branch's ids, mode and what this person may do on it;
 * - `missing` when GitHub has no such branch, `sign_in` or `forbidden` when this person may not open it, `failed`
 *   when it couldn't be reached.
 */
export const CURRENT = "current"
export const Current = Schema.Struct({
  id: Schema.Literal(CURRENT),
  owner: Schema.String,
  repo: Schema.String,
  name: Schema.String,
  status: Schema.Literals(["none", "tracking", "ready", "missing", "sign_in", "forbidden", "failed"]),
  branchId: Schema.NullOr(Schema.String),
  conversationId: Schema.NullOr(Schema.String),
  mode: Schema.NullOr(Schema.Literals(MODES)),
  access: Schema.NullOr(Schema.Literals(ACCESSES)),
})
export type Current = typeof Current.Type
