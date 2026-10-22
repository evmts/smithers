import { DocsPageView, WebLinkCard, type WebPagePreview, WebPageView } from "@smthrs/ui"
import { Link } from "@tanstack/react-router"
import { useWeb } from "../../web/components/WebContext"
import type { ViewTemplate } from "../contract"

// One view in the conversation (docs/features/web-pages.md#in-the-conversation), rendered from its own synced row: a
// `webpage` inline, with its origin, "Open in new tab" and a link to its full-screen size, and the page's preview over
// the frame until it loads; a `link` card with the page's icon, title, description and domain, whose Open in new tab
// button opens it in a new tab: a `tab`, or an `embed` of a page that refuses framing; a `docs` page of a repository's
// docs, its Markdown from the row, with its site's origin, "Open on site" and its full-screen size
// (docs/features/docs.md#the-docs-view). `@smthrs/ui` refuses a URL that isn't an outside http(s) page.
export function ConversationView(
  { id, template, url, preview, markdown, truncated, conversationId }: {
    id: string
    template: ViewTemplate
    url: string
    preview: WebPagePreview
    /** A `docs` view's Markdown. */
    markdown?: string | undefined
    truncated?: boolean | undefined
    conversationId?: string
  },
) {
  const web = useWeb()
  const fullScreen = (
    <Link
      to="/app/views/$viewId"
      params={{ viewId: id }}
      search={conversationId === undefined ? {} : { conversation: conversationId }}
    >
      Full screen
    </Link>
  )
  return (
    <div className="conversation-view" data-view={id} data-template={template}>
      {template === "webpage" ? (
        <WebPageView url={url} size="inline" preview={preview} actions={fullScreen} />
      ) : template === "docs" ? (
        <DocsPageView
          url={url}
          title={preview.title ?? ""}
          text={markdown ?? ""}
          truncated={truncated === true}
          size="inline"
          headingLevel={3}
          actions={fullScreen}
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
