import { RepositoryHome } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { useNavigate } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { useChat } from "../../../AppContext"
import { draftFor, filesOf, homePageOf, offered } from "../view"
import { useHome } from "./HomeContext"

// `/$owner/$repo`: the repository's own home when it declares one, else `tree`, its file tree, under one line when the
// declared home can't show. Nothing shows while the home is read. A prompt or app block opens the default branch's
// workspace with its composer open, starting it with the block's command when it has one.
export function HomePage({ tree }: { readonly tree: ReactNode }) {
  const { queries } = useHome()
  const chat = useChat()
  const navigate = useNavigate()
  const { data } = useLiveQuery(queries.home)
  const { data: files } = useLiveQuery(queries.files)
  if (data === undefined) return null
  const page = homePageOf(data.current, data.home)
  if (page.kind === "loading") return null
  if (page.kind === "tree") {
    return (
      <>
        {page.notice === null ? null : <p className="home-notice" role="status">{page.notice}</p>}
        {tree}
      </>
    )
  }
  const ask = (flow: string | undefined) => {
    const draft = draftFor(flow)
    void navigate({ href: page.askHref }).then(() => {
      if (draft !== undefined) chat.actions.setDraft(draft)
      chat.actions.openComposer("button")
    })
  }
  return (
    <RepositoryHome
      className="home-page"
      aria-label="Home"
      blocks={page.blocks}
      files={filesOf(files ?? [])}
      askHref={page.askHref}
      onAsk={ask}
      offered={offered}
    />
  )
}
