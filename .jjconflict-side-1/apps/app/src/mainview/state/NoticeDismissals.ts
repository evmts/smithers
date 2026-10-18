import { z } from "zod"

/**
 * Hide is durable (#4034). A member-routed notice names the member it reached
 * and the entry occurrence it reported (`ToastAudience.member`/`entryId`); the
 * toast row itself is session chrome — boot reconciliation drops every toast,
 * and the seam that raised the notice raises it again from the same persisted
 * failure on the next read. So pressing Hide removed the notice and the reload
 * brought the identical failure back.
 *
 * One receipt per hidden occurrence is the whole authority: it is scoped to
 * ONE member and ONE entry occurrence, so another account keeps its own
 * notices, and the next occurrence — a new run, a new attempt, a new wait —
 * carries a different `entryId` and notifies normally even under the same
 * title. The failure itself is untouched: its TODO card, its transcript and
 * its journal stay readable.
 */
export const noticeDismissalKey = (member: string, entryId: string): string => JSON.stringify([member, entryId])

/** The member hid this exact entry occurrence. Nothing here names the failure. */
export const NoticeDismissalSchema = z.object({
  id: z.string(), member: z.string(), entryId: z.string()
}).strict().refine(row => row.id === noticeDismissalKey(row.member, row.entryId),
  { message: "Notice dismissal key must match its member and entry" })
export type NoticeDismissal = z.infer<typeof NoticeDismissalSchema>

/** The only hidden-notice authority: a receipt this member wrote for this occurrence. */
export const noticeWasDismissed = (
  dismissals: Pick<ReadonlyMap<string, unknown>, "has">,
  audience: { readonly member: string; readonly entryId: string } | undefined
): boolean => audience !== undefined && dismissals.has(noticeDismissalKey(audience.member, audience.entryId))
