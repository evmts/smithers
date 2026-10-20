import { Button, EmptyState, ItemConversation } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { useParams } from "@tanstack/react-router"
import { useAuth } from "../../features/auth/components/AuthContext"
import { SignInButton } from "../../features/auth/components/SignInButton"
import { useIssues } from "../../features/issues/components/IssuesContext"
import { DISCARD, EDIT, NOT_FOUND } from "../../features/issues/contract"
import { conversationProps, draftOf, mayWrite, pageOf } from "../../features/issues/view"
import "./issues-screen.css"

// /$owner/$repo/issues/$number: one issue and its comments, this device's own last with their chip, "Open on GitHub ↗",
// and the comment composer for a person who may comment. A comment that wasn't sent gets Edit, back to the composer,
// and Discard. Loading until the repository's first complete sync; then an issue the device doesn't have isn't there.
// A repository whose issues this person may not read shows sign-in, or Not found.
export function IssueScreen() {
  const { owner, repo, number } = useParams({ from: "/$owner/$repo/issues/$number" })
  const { queries, actions } = useIssues()
  const auth = useAuth()
  const { data: item } = useLiveQuery(queries.item)
  const { data: rows } = useLiveQuery(queries.conversation)
  const { data: synced } = useLiveQuery(queries.synced)
  const { data: view } = useLiveQuery(queries.view)
  const { data: access } = useLiveQuery(queries.access)
  const { data: session } = useLiveQuery(auth.queries.session)
  const { data: confirmed } = useLiveQuery(auth.queries.confirmed)
  const page = pageOf(item, synced, access)
  if (page === "sign_in") return <main className="issues-screen"><SignInButton /></main>
  if (page === "missing") return <main className="issues-screen"><EmptyState title={NOT_FOUND} /></main>
  if (item === undefined) {
    return (
      <main className="issues-screen">
        <ItemConversation loading title="" number={number} state="open" body="" comments={[]} />
      </main>
    )
  }
  const shown = conversationProps(item, rows ?? [], { owner, name: repo })
  return (
    <main className="issues-screen">
      <ItemConversation
        {...shown}
        comments={shown.comments.map((comment) => ({
          ...comment,
          actions: comment.editable
            ? (
              <>
                <Button variant="outline" size="sm" onClick={() => actions.edit(comment.id)}>{EDIT}</Button>
                <Button variant="ghost" size="sm" onClick={() => actions.discard(comment.id)}>{DISCARD}</Button>
              </>
            )
            : undefined,
        }))}
        composer={session !== undefined && mayWrite(session, confirmed)
          ? {
            draft: draftOf(view).body,
            onDraft: (body) => actions.setCommentDraft(owner, repo, number, body),
            onSubmit: () => void actions.comment(owner, repo, number),
            disabled: view?.submitting === true,
          }
          : undefined}
      />
    </main>
  )
}
