import type { Room } from "../presence/schema"
import type { Access } from "./contract"
import type { Current } from "./schema"

// What a branch's page lets this person do right now (docs/features/branch-workspace.md#sharing): what `branch/track`
// answered when the page opened, then what the branch's room says as the owner changes it. The room taking the branch
// away (`revoked`) is no access at once; a change of access reconnects the room, whose roster says the new one. Pure,
// so the screen only renders it.

/**
 * What this person may do on the page's branch: `undefined` until it is ready, `none` once it was taken away, `owner`
 * for its owner, else what the room last said (`write` is edit, `read` view), else what tracking answered.
 */
export const accessNow = (
  current: Pick<Current, "status" | "access"> | undefined,
  room: Pick<Room, "status"> | undefined,
  self: "write" | "read" | undefined,
): Access | "none" | undefined => {
  if (current?.status !== "ready" || current.access === null) return undefined
  if (room?.status === "revoked") return "none"
  if (current.access === "owner") return "owner"
  return self === "write" ? "edit" : self === "read" ? "view" : current.access
}

/** Whether `access` writes: asks in the conversation and types in the terminals. */
export const writes = (access: Access | "none" | undefined): boolean => access === "owner" || access === "edit"
