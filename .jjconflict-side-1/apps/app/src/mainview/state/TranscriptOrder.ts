import type { IdentitySession, Session, TranscriptAnchor } from "./AppState"
import type { SharedConversation } from "./seams/SharedConversationSeam"

type SharedEntry = SharedConversation["entries"][number]

/** Places private local output among authoritative shared turns without comparing their independent ordinals. */
export class TranscriptOrder {
  /** A stable private scope across reloads; an account or repository/branch change selects another scope. */
  static scope(identity: IdentitySession | undefined, session: Pick<Session, "branchNavigation" | "activeRepoKey">): string | undefined {
    if (identity?.state !== "signed-in" || !identity.login) return undefined
    const branch = session.branchNavigation?.owner === identity.login ? session.branchNavigation.selected_branch : "main"
    return JSON.stringify([identity.login, identity.memberId ?? null, session.activeRepoKey ?? null, branch])
  }

  /** A local id has an independent placement in each private scope. */
  static key(scope: string, id: string): string { return JSON.stringify([scope, id]) }

  /** Legacy replies without sequence metadata retain their served order. */
  static sequence(entries: readonly SharedEntry[]): number {
    return entries.reduce((latest, entry, index) => Math.max(latest, entry.sequence ?? index + 1), 0)
  }

  /** Local entries retain their relative order at each anchor. Unstamped legacy output precedes shared history. */
  static merge<T>(shared: readonly SharedEntry[], local: readonly { id: string; value: T }[], anchors: Session["transcriptAnchors"], scope: string | undefined): Array<
    { kind: "shared"; turn: SharedEntry } | { kind: "local"; entry: { id: string; value: T } }
  > {
    const placed = local.map((entry, index) => {
      const anchor: TranscriptAnchor | undefined = scope === undefined ? undefined : anchors?.[this.key(scope, entry.id)]
      return { entry, index, localOrdinal: anchor?.localOrdinal ?? index, sequence: anchor?.scope === scope ? anchor?.afterSequence ?? 0 : 0 }
    }).sort((left, right) => left.sequence - right.sequence || left.localOrdinal - right.localOrdinal || left.index - right.index)
    const result: ReturnType<typeof TranscriptOrder.merge<T>> = []
    let cursor = 0
    for (const [index, turn] of shared.entries()) {
      const sequence = turn.sequence ?? index + 1
      while (placed[cursor] && placed[cursor]!.sequence < sequence) result.push({ kind: "local", entry: placed[cursor++]!.entry })
      result.push({ kind: "shared", turn })
    }
    while (placed[cursor]) result.push({ kind: "local", entry: placed[cursor++]!.entry })
    return result
  }
}
