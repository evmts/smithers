import { DocsPageView, Button, FlowFormView, GeneratedView, WebLinkCard, type WebPagePreview, WebPageView } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { Link } from "@tanstack/react-router"
import { useChat } from "../../../AppContext"
import { useShownMode } from "../../theme/components/ThemeButton"
import { useWeb } from "../../web/components/WebContext"
import { FULL_SCREEN, SUBMIT_EVENT } from "../contract"
import { formOf, generatedOf, pageOf, type ViewRow } from "../rows"
import { useViews } from "./ViewsContext"

// One view in the conversation (docs/features/web-pages.md#in-the-conversation, docs/features/views.md), rendered from
// its own synced row: a `webpage` inline, with its origin, "Open in new tab" and a link to its full-screen size, and the
// page's preview over the frame until it loads; a `link` card with the page's icon, title, description and domain,
// whose Open in new tab button opens it in a new tab; the agent's form, whose submission is the person's next question;
// and a generated view in its sandboxed frame, whose moves go to ChatApi and whose message events are questions. Each
// but a `link` has a Full screen link to `/app/views/<id>`.
export function ConversationView({ id, conversationId }: { id: string; conversationId?: string }) {
  const web = useWeb()
  const { data: rows } = useLiveQuery(useViews().queries.rowsIn(conversationId))
  const view = rows.find((row) => row.id === id)
  if (view === undefined) return null
  const fullScreen = (
    <Link
      to="/app/views/$viewId"
      params={{ viewId: view.id }}
      search={conversationId === undefined ? {} : { conversation: conversationId }}
    >
      {FULL_SCREEN}
    </Link>
  )
  return (
    <div className="conversation-view" data-view={view.id} data-template={view.template}>
      {view.template === "webpage" ? (
        <WebPageView url={pageOf(view).url} size="inline" preview={previewOf(view)} actions={fullScreen} />
      ) : view.template === "docs" ? (
        <DocsPageView url={pageOf(view).url} title={pageOf(view).title ?? ""}
          text={pageOf(view).text ?? ""} truncated={pageOf(view).truncated === true}
          size="inline" headingLevel={3} actions={fullScreen} />
      ) : view.template === "link" ? (
        <WebLinkCard
          url={pageOf(view).url}
          title={pageOf(view).title}
          description={pageOf(view).description}
          icon={pageOf(view).icon}
          onOpen={web.actions.cardOpened}
        />
      ) : (
        <>
          <AgentView view={view} size="inline" conversationId={conversationId} />
          <Button asChild variant="ghost" size="sm">{fullScreen}</Button>
        </>
      )}
    </div>
  )
}

/** What a page says about itself, read by ChatApi's check. */
export const previewOf = (view: ViewRow): WebPagePreview => {
  const { title, description, icon } = pageOf(view)
  return { title, description, icon }
}

/**
 * The agent's form or generated view at `size`: the same component, from the same row, inline and full screen. A form's
 * submission and a view's message event are asked in the view's own conversation; a move is `view/set-state`.
 */
export function AgentView({ view, size, conversationId }: { view: ViewRow; size: "inline" | "full"; conversationId?: string | undefined }) {
  const chat = useChat()
  const views = useViews()
  const mode = useShownMode()
  const form = formOf(view)
  const generated = generatedOf(view)
  const place = conversationId === undefined ? {} : { conversationId }
  if (form !== undefined) {
    return (
      <FlowFormView
        title={form.props.title}
        schema={form.props.schema}
        submitLabel={form.props.submitLabel}
        submitted={form.state.submitted}
        values={form.state.values}
        size={size}
        onSubmit={(submission) =>
          chat.actions.askFromView(submission.text, {
            source: { viewId: view.id, event: SUBMIT_EVENT },
            data: submission.data,
            ...place,
          })}
      />
    )
  }
  if (generated === undefined) return null
  return (
    <GeneratedView
      html={generated.html}
      interactions={generated.interactions}
      title={generated.title}
      theme={mode}
      size={size}
      onInteraction={(interaction) =>
        interaction._tag === "State"
          ? void views.actions.move(view.id, generated.revision, interaction.event)
          : void chat.actions.askFromView(interaction.label, {
            source: { viewId: view.id, event: interaction.event.name },
            ...(interaction.values === undefined ? {} : { data: interaction.values }),
            ...place,
          })}
    />
  )
}
