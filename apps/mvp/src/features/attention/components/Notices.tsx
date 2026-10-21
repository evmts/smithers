import { Toast, ToastStack } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import type { ReactElement } from "react"
import type { Surface } from "../contract"
import type { Entry } from "../schema"
import { useAttention } from "./AttentionContext"

// The feed's toasts (decision 0009 §4), most urgent first: needs you, failed, live, done, updates; and the rest of the
// person's list, which `+N` opens in place. Over a conversation (`surface="conversation"`), that conversation's own runs
// show in it instead, unless they need the person. A toast's × hides it and keeps the entry; a settled entry in the
// list is dismissed by its ×. Every toast fades in after 300 ms, so one gone at once never flashes.

/** The feed's toasts and its list, for the stack a screen renders (src/screens/app/Toasts.tsx, `Notices`). */
export function useNotices(surface: Surface): {
  readonly toasts: ReadonlyArray<ReactElement>
  readonly more: ReadonlyArray<ReactElement>
} {
  const { queries } = useAttention()
  const { data: stack } = useLiveQuery(surface === "conversation" ? queries.stackHere : queries.stack)
  const { data: list } = useLiveQuery(surface === "conversation" ? queries.listHere : queries.list)
  return {
    toasts: stack.map((entry) => <Notice key={`${entry.id}:${entry.version}`} entry={entry} surface={surface} />),
    more: list.map((entry) => <Notice key={`${entry.id}:${entry.version}`} entry={entry} surface={surface} listed />),
  }
}

/** The stack on a page with nothing else to show: the feed alone. */
export function Notices({ surface, placement }: { readonly surface: Surface; readonly placement: "fixed" | "inline" }) {
  const { toasts, more } = useNotices(surface)
  return (
    <ToastStack label="Smithers" placement={placement} more={more}>
      {toasts}
    </ToastStack>
  )
}

function Notice({ entry, surface, listed = false }: { readonly entry: Entry; readonly surface: Surface; readonly listed?: boolean }) {
  const { actions } = useAttention()
  const dismisses = listed && entry.settled
  return (
    <Toast
      tone={entry.state}
      delayed
      {...(entry.word === null ? {} : { word: entry.word })}
      {...(entry.detail === null ? {} : { detail: entry.detail })}
      unread={entry.unread}
      action={{ label: entry.action === "answer" ? "Answer" : "Open", onAction: () => actions.open(entry.id, surface) }}
      hideLabel={dismisses ? "Dismiss" : "Hide"}
      onHide={() => (dismisses ? actions.dismiss(entry.id) : actions.hide(entry.id))}
      data-subject={entry.id}
      {...(entry.runId === null ? {} : { "data-run": entry.runId })}
    />
  )
}
