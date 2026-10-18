import { useCallback, useSyncExternalStore } from "react"
import { useLiveQuery } from "@tanstack/react-db"
import { cardActions, type CardActionDefinition, type CardCommandDispatch } from "../flows/cardActions"
import { useController } from "../ControllerContext"
import { retryableFailure } from "../FailureNotice"
import { archiveTitle, historyTree, type ArchiveLabel, type ChatArchiveSnapshot } from "../state/seams/ChatArchiveSeam"
import type { CardFamily } from "./CardFamily"
import { HistoryView, type HistoryViewProps } from "./views/HistoryView"

/** The sentence an archived chat the host would not answer for reads. */
const CHAT_UNAVAILABLE = "Archived chat unavailable"

export interface HistoryContainerProps {
  readonly snapshot: ChatArchiveSnapshot
  /** The header's repository and branch: their groups come first and start open. */
  readonly label: ArchiveLabel
  readonly dispatch: CardCommandDispatch
  readonly view: HistoryViewProps["view"]
  readonly onView: HistoryViewProps["onView"]
  readonly onRetry: HistoryViewProps["onRetry"]
}

/** Projects the host's archives as rows and binds one `run` action per run a chat started. */
export const HistoryContainer = ({ snapshot, label, dispatch, view, onView, onRetry }: HistoryContainerProps) => {
  const archives = snapshot.archives ?? []
  const runs = [...new Set(archives.flatMap(chat => chat.runs.map(run => run.runId)))]
  const bindings = cardActions(dispatch, runs.map((id): CardActionDefinition<"run"> => ({ tag: "run", label: id, args: { id }, command_input: { id } })))
  const opened = view.selected === undefined ? undefined : snapshot.opened[view.selected]
  const repositories = historyTree(archives, label).map(repository => ({ ...repository, branches: repository.branches.map(branch => ({ ...branch,
    chats: branch.chats.map(chat => ({ id: chat.id, title: archiveTitle(chat), archivedAt: chat.archived_at, runs: chat.runs.map(run => run.runId),
      summary: chat.summary ?? undefined })) })) }))
  /* A chat nobody has read the entries of is not a chat that holds none, so its state is its own. */
  const read = view.selected === undefined || opened !== undefined ? undefined : snapshot.reads?.[view.selected]
  const model: HistoryViewProps["model"] = { repositories, loaded: snapshot.archives !== undefined, reading: snapshot.reading === true, opened,
    openedReading: read === "reading",
    openedFailure: read === "unavailable" ? retryableFailure("ArchivedChatUnavailable", CHAT_UNAVAILABLE, CHAT_UNAVAILABLE) : undefined,
    failure: snapshot.error === undefined ? undefined : retryableFailure("HistoryUnavailable", snapshot.error, snapshot.error) }
  return <HistoryView model={model} actions={bindings.actions} onAction={bindings.onAction} view={view} onView={onView} onRetry={onRetry} />
}

const HistoryBody = ({ selected }: { readonly selected: string | undefined }) => {
  const controller = useController()
  const archives = controller.chatArchives
  // The header's repository and branch decide which groups open first.
  useLiveQuery(controller.store.collections.sessions)
  useLiveQuery(controller.store.collections.repositories)
  /* Archives belong to one identity, so a changed session asks the host again instead of showing the last one's. */
  const session = useLiveQuery(controller.store.collections.identitySessions).data[0]
  const stamp = `${session?.state ?? ""}:${session?.login ?? ""}`
  const snapshot = useSyncExternalStore(useCallback((notify: () => void) => {
    const stop = archives.subscribe(notify)
    /*
     * The card a reload reconstructed asks for the index this identity
     * reaches, and for the chat it still holds open; `/history` is the same
     * read through the slash and agent doors. `ensure` joins a request in
     * flight and skips an answer in hand, so a remount and StrictMode's
     * second subscription read once (#4033).
     */
    archives.ensure(selected)
    return stop
  }, [archives, selected, stamp]), archives.get, archives.get)
  return <HistoryContainer snapshot={snapshot} label={controller.archiveLabel()} view={{ selected }}
    // The selection is the card's saved view state: the same act as `/history <id>`.
    onView={patch => { void controller.showHistory(patch.selected ?? selected) }}
    onRetry={id => { archives.retry(id) }}
    dispatch={(tag, input) => controller.commands.submit({ name: tag, payload: (input ?? {}) as Record<string, unknown>, actor: "user" })} />
}

export const historyCardFamily: CardFamily<"archives"> = {
  "archives": { render: card => <HistoryBody selected={card.payload.selected} />, pill: () => "" }
}
