import { EmptyState } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { useSearch } from "@tanstack/react-router"
import { ComposerGate } from "../../features/auth/components/ComposerGate"
import { BranchHeader } from "../../features/branch/components/BranchHeader"
import { useBranch } from "../../features/branch/components/BranchContext"
import { accessNow, writes } from "../../features/branch/view"
import { Composer } from "../../features/chat/components/Composer"
import { Conversation } from "../../features/chat/components/Conversation"
import { selfAccessOf } from "../../features/presence/view"
import { RepoHeader } from "../../features/repo/components/RepoHeader"
import { RepoPage } from "../../features/repo/components/RepoPage"
import { TerminalPanel } from "../../features/terminal/components/TerminalPanel"
import "./branch-screen.css"

// /$owner/$repo/tree/$ref/$: the repository at a branch, and the branch's workspace once the app tracks it and this
// person may open it (decision 0013 §5): its Code and Terminal views, its conversation, and the composer, which asks
// there, for those who may edit it. A branch that isn't shared with them, or stops being, says No access; the code
// stays as GitHub shows it. The route's loader opens the location, the branch, its room and its terminal; this screen
// only renders what the device has.
export function BranchScreen() {
  const { queries, presence } = useBranch()
  const { data: current } = useLiveQuery(queries.current)
  const { data: room } = useLiveQuery(presence.queries.room)
  const { data: participants } = useLiveQuery(presence.queries.participants)
  const search = useSearch({ strict: false }) as { readonly terminal?: string }
  const access = accessNow(current, room, selfAccessOf(participants))
  const open = access !== undefined && access !== "none"
  const denied = access === "none" || current?.status === "forbidden"
  return (
    <main className="branch-screen" aria-label="Repository">
      <RepoHeader />
      {open ? <BranchHeader /> : null}
      <div className="branch-screen-view">
        {open && search.terminal !== undefined
          ? <TerminalPanel canOpen={writes(access) && current?.mode === "open"} />
          : <RepoPage />}
      </div>
      {denied ? <EmptyState className="branch-screen-denied" title="No access" /> : null}
      {open ? (
        <>
          <section className="branch-screen-conversation" aria-label="Conversation">
            <Conversation />
          </section>
          {writes(access) ? (
            <div className="branch-screen-composer">
              <ComposerGate>
                <Composer />
              </ComposerGate>
            </div>
          ) : null}
        </>
      ) : null}
    </main>
  )
}
