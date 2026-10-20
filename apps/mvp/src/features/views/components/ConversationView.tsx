import { WebLinkCard, WebPageView } from "@smthrs/ui"
import { Link } from "@tanstack/react-router"
import { useWeb } from "../../web/components/WebContext"
import type { ViewTemplate } from "../contract"

// One view in the conversation (docs/features/web-pages.md#in-the-conversation), rendered from its own synced row: a
// `webpage` inline, with its origin, "Open in new tab" and a link to its full-screen size; a `link` card whose Open
// button opens the page in a new tab. `@smthrs/ui` refuses a URL that isn't an outside http(s) page.
export function ConversationView(
  { id, template, url, conversationId }: { id: string; template: ViewTemplate; url: string; conversationId?: string },
) {
  const web = useWeb()
  return (
    <div className="conversation-view" data-view={id} data-template={template}>
      {template === "webpage" ? (
        <WebPageView
          url={url}
          size="inline"
          actions={
            <Link
              to="/app/views/$viewId"
              params={{ viewId: id }}
              search={conversationId === undefined ? {} : { conversation: conversationId }}
            >
              Full screen
            </Link>
          }
        />
      ) : (
        <WebLinkCard url={url} onOpen={web.actions.cardOpened} />
      )}
    </div>
  )
}
