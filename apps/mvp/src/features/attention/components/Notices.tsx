import { Toast, ToastStack } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import type { ReactElement } from "react"
import type { Surface } from "../contract"
import { TRY_AGAIN } from "../../repo/contract"
import type { Entry } from "../schema"
import { useAttention } from "./AttentionContext"

// The feed's toasts (decision 0009 §4), most urgent first: needs you, failed, live, done, updates. Clicking a toast
// opens what it is about; `+N` counts the rest of the person's list and opens the notifications panel. Over a
// conversation (`surface="conversation"`), that conversation's own runs show in it instead, unless they need the
// person. A toast's × hides it and keeps the entry. Every toast fades in after 300 ms, so one gone at once never
// flashes. A focused toast takes the notice keys (`@smthrs/ui` `NOTICE_KEYS`).

/** The feed's toasts, how many more entries the person has, and `+N`'s open, for the stack a screen renders. */
export function useNotices(surface: Surface): {
  readonly toasts: ReadonlyArray<ReactElement>
  readonly moreCount: number
  readonly onMore: () => void
} {
  const { queries, actions } = useAttention()
  const { data: stack } = useLiveQuery(surface === "conversation" ? queries.stackHere : queries.stack)
  const { data: list } = useLiveQuery(surface === "conversation" ? queries.listHere : queries.list)
  return {
    toasts: stack.map((entry) => <Notice key={`${entry.id}:${entry.version}`} entry={entry} surface={surface} />),
    moreCount: list.length,
    onMore: () => actions.openPanel("more"),
  }
}

/** The stack on a page with nothing else to show: the feed alone. */
export function Notices({ surface, placement }: { readonly surface: Surface; readonly placement: "fixed" | "inline" }) {
  const { toasts, moreCount, onMore } = useNotices(surface)
  return (
    <ToastStack label="Smithers" placement={placement} moreCount={moreCount} onMore={onMore}>
      {toasts}
    </ToastStack>
  )
}

function Notice({ entry, surface }: { readonly entry: Entry; readonly surface: Surface }) {
  const { actions } = useAttention()
  const answers = entry.action === "answer"
  const retries = entry.action === "retry"
  return (
    <Toast
      tone={entry.state}
      delayed
      {...(entry.word === null ? {} : { word: entry.word })}
      {...(entry.detail === null ? {} : { detail: entry.detail })}
      unread={entry.unread}
      onOpen={() => actions.open(entry.id, surface)}
      onExpand={() => actions.openPanel("toast", entry.id)}
      onRead={() => actions.read(entry.id)}
      {...(answers
        ? { action: { label: "Answer", onAction: () => actions.open(entry.id, surface) }, onAnswer: () => actions.answer(entry.id, surface) }
        : retries
        ? { action: { label: TRY_AGAIN, onAction: () => actions.retry(entry.id) } }
        : {})}
      onHide={() => actions.hide(entry.id)}
      data-subject={entry.id}
      {...(entry.runId === null ? {} : { "data-run": entry.runId })}
    />
  )
}
