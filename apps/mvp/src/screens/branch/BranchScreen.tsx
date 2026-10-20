import { useLiveQuery } from "@tanstack/react-db"
import { useSearch } from "@tanstack/react-router"
import { ComposerGate } from "../../features/auth/components/ComposerGate"
import { BranchHeader } from "../../features/branch/components/BranchHeader"
import { useBranch } from "../../features/branch/components/BranchContext"
import { Composer } from "../../features/chat/components/Composer"
import { Conversation } from "../../features/chat/components/Conversation"
import { RepoHeader } from "../../features/repo/components/RepoHeader"
import { RepoPage } from "../../features/repo/components/RepoPage"
import { TerminalPanel } from "../../features/terminal/components/TerminalPanel"
import "./branch-screen.css"

// /$owner/$repo/tree/$ref/$: the repository at a branch, and the branch's workspace once the app tracks it (decision
// 0013 §5): its Code and Terminal views, its conversation, and the composer, which asks there. The route's loader
// opens the location, the branch and its terminal; this screen only renders what the device has.
export function BranchScreen() {
  const { queries } = useBranch()
  const { data: current } = useLiveQuery(queries.current)
  const search = useSearch({ strict: false }) as { readonly terminal?: string }
  const ready = current?.status === "ready"
  return (
    <main className="branch-screen" aria-label="Repository">
      <RepoHeader />
      <BranchHeader />
      <div className="branch-screen-view">{ready && search.terminal !== undefined ? <TerminalPanel /> : <RepoPage />}</div>
      {ready ? (
        <>
          <section className="branch-screen-conversation" aria-label="Conversation">
            <Conversation />
          </section>
          <div className="branch-screen-composer">
            <ComposerGate>
              <Composer />
            </ComposerGate>
          </div>
        </>
      ) : null}
    </main>
  )
}
