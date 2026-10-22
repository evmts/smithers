import { DocsPageView, WebPageView } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { Link, useSearch } from "@tanstack/react-router"
import { useViews } from "../../features/views/components/ViewsContext"
import "./view-screen.css"

// /app/views/$viewId: one view at its full size (decision 0004 §6), from the same synced row the conversation shows
// inline: a web page in its frame, or a page of a repository's docs. The route's loader shows it (`show`); this screen
// renders it once the device has it, and nothing before.
export function ViewScreen() {
  const { queries } = useViews()
  // A branch conversation's view names its conversation (decision 0013 §1); the home conversation's names none.
  const { conversation } = useSearch({ strict: false }) as { readonly conversation?: string }
  const { data: view } = useLiveQuery(queries.shownIn(conversation))
  return (
    <main className="view-screen" aria-label="View">
      <header className="view-screen-header">
        <Link to="/app">Back to chat</Link>
      </header>
      {view === undefined ? null : view.template === "docs" ? (
        <DocsPageView
          url={view.url}
          title={view.title ?? ""}
          text={view.markdown ?? ""}
          truncated={view.truncated === true}
          size="full"
          headingLevel={1}
        />
      ) : (
        <WebPageView
          url={view.url}
          size="full"
          preview={{ title: view.title, description: view.description, icon: view.icon }}
        />
      )}
    </main>
  )
}
