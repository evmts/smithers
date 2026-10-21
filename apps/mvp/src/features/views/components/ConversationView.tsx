import { WebLinkCard, type WebPagePreview, WebPageView } from "@smthrs/ui"
import { Link } from "@tanstack/react-router"
import { useWeb } from "../../web/components/WebContext"
import type { ViewTemplate } from "../contract"

// One view in the conversation (docs/features/web-pages.md#in-the-conversation), rendered from its own synced row: a
// `webpage` inline, with its origin, "Open in new tab" and a link to its full-screen size, and the page's preview over
// the frame until it loads; a `link` card with the page's icon, title, description and domain, whose Open in new tab
// button opens it in a new tab: a `tab`, or an `embed` of a page that refuses framing. `@smthrs/ui` refuses a URL that
// isn't an outside http(s) page.
export function ConversationView(
  { id, template, url, preview, conversationId }: {
    id: string
    template: ViewTemplate
    url: string
    preview: WebPagePreview
    conversationId?: string
  },
) {
  const web = useWeb()
  return (
    <div className="conversation-view" data-view={id} data-template={template}>
      {template === "webpage" ? (
        <WebPageView
          url={url}
          size="inline"
          preview={preview}
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
        <WebLinkCard
          url={url}
          title={preview.title}
          description={preview.description}
          icon={preview.icon}
          onOpen={web.actions.cardOpened}
        />
      )}
    </div>
  )
}
