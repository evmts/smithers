import { useSyncExternalStore } from "react"
import { useLiveQuery } from "@tanstack/react-db"
import { cardActions, type CardActionDefinition, type CardCommandDispatch } from "../flows/cardActions"
import { useController } from "../ControllerContext"
import { unavailableFailure } from "../FailureNotice"
import { archiveTitle, historyTree, type ArchiveLabel, type ChatArchiveSnapshot } from "../state/seams/ChatArchiveSeam"
import type { CardFamily } from "./CardFamily"
import { HistoryView, type HistoryViewProps } from "./views/HistoryView"

export interface HistoryContainerProps {
  readonly snapshot: ChatArchiveSnapshot
  /** The header's repository and branch: their groups come first and start open. */
  readonly label: ArchiveLabel
  readonly dispatch: CardCommandDispatch
  readonly view: HistoryViewProps["view"]
  readonly onView: HistoryViewProps["onView"]
}

/** Projects the host's archives as rows and binds one `run` action per run a chat started. */
export const HistoryContainer = ({ snapshot, label, dispatch, view, onView }: HistoryContainerProps) => {
  const archives = snapshot.archives ?? []
  const runs = [...new Set(archives.flatMap(chat => chat.runs.map(run => run.runId)))]
  const bindings = cardActions(dispatch, runs.map((id): CardActionDefinition<"run"> => ({ tag: "run", label: id, args: { id }, command_input: { id } })))
  const opened = view.selected === undefined ? undefined : snapshot.opened[view.selected]
  const repositories = historyTree(archives, label).map(repository => ({ ...repository, branches: repository.branches.map(branch => ({ ...branch,
    chats: branch.chats.map(chat => ({ id: chat.id, title: archiveTitle(chat), archivedAt: chat.archived_at, runs: chat.runs.map(run => run.runId),
      summary: chat.summary ?? undefined })) })) }))
  const model: HistoryViewProps["model"] = { repositories, loaded: snapshot.archives !== undefined, opened,
    failure: snapshot.error === undefined ? undefined : unavailableFailure("HistoryUnavailable", snapshot.error, snapshot.error) }
  return <HistoryView model={model} actions={bindings.actions} onAction={bindings.onAction} view={view} onView={onView} />
}

const HistoryBody = ({ selected }: { readonly selected: string | undefined }) => {
  const controller = useController()
  const archives = controller.chatArchives
  const snapshot = useSyncExternalStore(archives.subscribe, archives.get, archives.get)
  // The header's repository and branch decide which groups open first.
  useLiveQuery(controller.store.collections.sessions)
  useLiveQuery(controller.store.collections.repositories)
  return <HistoryContainer snapshot={snapshot} label={controller.archiveLabel()} view={{ selected }}
    // The selection is the card's saved view state: the same act as `/history <id>`.
    onView={patch => { void controller.showHistory(patch.selected ?? selected) }}
    dispatch={(tag, input) => controller.commands.submit({ name: tag, payload: (input ?? {}) as Record<string, unknown>, actor: "user" })} />
}

export const historyCardFamily: CardFamily<"archives"> = {
  "archives": { render: card => <HistoryBody selected={card.payload.selected} />, pill: () => "" }
}
