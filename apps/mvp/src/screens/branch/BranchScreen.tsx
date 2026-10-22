import { Card, EmptyState } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { useSearch } from "@tanstack/react-router"
import { ComposerGate } from "../../features/auth/components/ComposerGate"
import { BranchHeader } from "../../features/branch/components/BranchHeader"
import { useBranch } from "../../features/branch/components/BranchContext"
import { accessNow, writes } from "../../features/branch/view"
import { Composer } from "../../features/chat/components/Composer"
import { SharedFile } from "../../features/coedit/components/SharedFile"
import { FileTabsBar } from "../../features/files/components/FileTabsBar"
import { Conversation } from "../../features/chat/components/Conversation"
import { NO_MESSAGES } from "../../features/chat/contract"
import { selfAccessOf } from "../../features/presence/view"
import { RepoHeader } from "../../features/repo/components/RepoHeader"
import { RepoPage } from "../../features/repo/components/RepoPage"
import { TerminalPanel } from "../../features/terminal/components/TerminalPanel"
import { Toasts } from "../app/Toasts"
import "./branch-screen.css"

// /$owner/$repo/tree/$ref/$: the repository at a branch, and the branch's workspace once the app tracks it and this
// person may open it (decision 0013 §5). The workspace is two columns: the branch's view, Code or Terminal, beside its
// conversation, with the composer at the conversation's foot: on a branch its owner shared, the branch's prompt, typed
// together by those who may edit it and shown read-only to those who may only view it; else the person's own draft
// (docs/features/coedit.md#the-prompt). Under `?edit`, a file of the
// branch's working copy is in the live editor in Code's place. A branch that isn't shared
// with them, or stops being, says No access where the conversation would be; the code stays as GitHub shows it. The
// route's loader opens the location, the branch, its room and its terminal; this screen only renders what the device
// has.
export function BranchScreen() {
  const { queries, presence } = useBranch()
  const { data: current } = useLiveQuery(queries.current)
  const { data: room } = useLiveQuery(presence.queries.room)
  const { data: participants } = useLiveQuery(presence.queries.participants)
  const search = useSearch({ strict: false }) as { readonly terminal?: string; readonly edit?: string }
  const access = accessNow(current, room, selfAccessOf(participants))
  const open = access !== undefined && access !== "none"
  const savedConversation = current?.status === "offline" && current.conversationId !== null
  const denied = access === "none" || current?.status === "forbidden"
  return (
    <main className="branch-screen" aria-label="Repository" data-workspace={open || denied || savedConversation ? "true" : "false"}>
      <RepoHeader />
      {/* Offline before tracking answered: the pending view's public chrome until the route opens again online. */}
      {open ? <BranchHeader access={access} /> : current?.status === "offline" ? <BranchHeader access={undefined} pending /> : null}
      <div className="branch-screen-notices"><Toasts surface={open ? "conversation" : "page"} /></div>
      <div className="branch-screen-view">
        {open && search.terminal !== undefined
          ? <TerminalPanel canOpen={writes(access) && current?.mode === "open"} />
          : open && search.edit !== undefined && current?.conversationId != null
          ? <SharedFile conversationId={current.conversationId} path={search.edit} readOnly={!writes(access)} />
          : (
            <>
              <FileTabsBar />
              <RepoPage editFiles={open && writes(access) && current?.mode === "open"} />
            </>
          )}
      </div>
      {denied ? (
        <div className="branch-screen-side">
          <Card className="branch-screen-denied">
            <EmptyState title="No access" />
          </Card>
        </div>
      ) : null}
      {open || savedConversation ? (
        <div className="branch-screen-side">
          <Card className="branch-screen-conversation" aria-label="Conversation">
            <Conversation readOnly={savedConversation} empty={<EmptyState title={NO_MESSAGES} />} />
          </Card>
          {open ? <div className="branch-screen-composer">
            {writes(access) ? (
              <ComposerGate>
                <Composer docked={false} />
              </ComposerGate>
            ) : <Composer docked={false} readOnly />}
          </div> : null}
        </div>
      ) : null}
    </main>
  )
}
