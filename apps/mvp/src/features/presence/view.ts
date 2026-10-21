import type { Participant, Where } from "./schema"

// What the branch header shows of the room (docs/features/branch-workspace.md#presence): everyone else on the branch,
// once each however many tabs they have open, with where they are; and where following one of them goes. Pure, so the
// avatars' React view only renders it.

/** Where a place is, in the fewest words: the file or folder's path, or Terminal. */
export const placeOf = (where: Where | null): string | undefined =>
  where === null ? undefined : where.view === "terminal" ? "Terminal" : where.path === "" ? "Code" : where.path

/** An avatar: one person, the place their latest tab is at, and that tab's connection to follow. */
export interface Avatar {
  readonly id: string
  readonly name: string
  readonly title: string
}

/** Everyone in the room but this person, once each, in the room's order; each one's title says where they are. */
export const avatarsOf = (participants: ReadonlyArray<Participant>): ReadonlyArray<Avatar> => {
  const self = new Set(participants.filter((participant) => participant.self).map((participant) => participant.principal))
  const latest = new Map<string, Participant>()
  for (const participant of participants) {
    if (!self.has(participant.principal)) latest.set(participant.principal, participant)
  }
  return [...latest.values()].map((participant) => {
    const place = placeOf(participant.where)
    return { id: participant.id, name: participant.name, title: place === undefined ? participant.name : `${participant.name} · ${place}` }
  })
}

/**
 * Where following the person on connection `id` goes on the branch's page: their path and, in the Terminal view, the
 * terminal they watch (`me` when theirs is unnamed). `undefined` when they are gone or nowhere yet.
 */
export const followOf = (
  participants: ReadonlyArray<Participant>,
  id: string,
): { readonly path: string; readonly terminal?: string } | undefined => {
  const where = participants.find((participant) => participant.id === id)?.where ?? null
  if (where === null) return undefined
  return where.view === "code" ? { path: where.path } : { path: "", terminal: where.terminalId ?? "me" }
}

/** What this person may do now, as the room last said: `write` or `read`, `undefined` until the room says. */
export const selfAccessOf = (participants: ReadonlyArray<Participant>): "write" | "read" | undefined =>
  participants.find((participant) => participant.self)?.access
