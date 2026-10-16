/* The History card's tree (#3827): repository, branch, chat, then the runs a chat started. */
import { afterEach, expect, mock, test } from "bun:test"
import { act } from "react"
import type { Action } from "@smthrs/rpc/CardAction"
import { SharedConversationSchema } from "../../state/seams/SharedConversationSeam"
import { describedFailure } from "../../FailureNotice"
import { lintCopy } from "../productWords"
import { createRoot } from "./testDom"
import { HistoryView, type HistoryViewProps } from "./HistoryView"

const at = Date.UTC(2026, 9, 13, 12)
const repositories: HistoryViewProps["model"]["repositories"] = [
  { repository: "acme/api", current: true, branches: [
    { branch: "main", current: true, chats: [
      { id: "a", title: "Fix Safari login", archivedAt: at, summary: "You asked why login failed. The cookie flag was fixed.", runs: ["run-1"] },
      { id: "b", title: "<script>alert(1)</script>", archivedAt: at - 86_400_000, summary: undefined, runs: [] }] },
    { branch: "feature", current: false, chats: [{ id: "c", title: "Ship checkout", archivedAt: at, summary: undefined, runs: [] }] },
    { branch: null, current: false, chats: [{ id: "d", title: "No branch chat", archivedAt: at, summary: undefined, runs: [] }] }] },
  { repository: "acme/web", current: false, branches: [{ branch: "main", current: false, chats: [{ id: "e", title: "Other repo", archivedAt: at, summary: undefined, runs: [] }] }] },
  { repository: null, current: false, branches: [{ branch: null, current: false, chats: [{ id: "f", title: "Loose chat", archivedAt: at, summary: undefined, runs: [] }] }] }
]
const run: Action = { tag: "run", label: "run-1", args: { id: "run-1" } }
const opened = SharedConversationSchema.parse({ id: "archive-a", entries: [{
  id: "turn-1", author: 7, authorLogin: "maya", runId: "r1", prompt: "Why does login fail?", state: "completed", title: "Why does login fail?", tone: "quiet", sequence: 1,
  frames: [{ runId: "r1", type: "delta", kind: "text", text: "The cookie lacks **SameSite**." }, { runId: "other", type: "delta", kind: "text", text: "foreign frame" }, { runId: "r1", type: "done", reason: "stop" }]
}] })

let unmount: (() => Promise<void>) | undefined
afterEach(async () => { await unmount?.(); unmount = undefined })
const unavailable = (tag: string, sentence: string) => describedFailure(tag, { fault: "infra", sentence, actions: ["retry"] }, sentence)
const mount = async (model: Partial<HistoryViewProps["model"]> = {}, selected?: string) => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const onAction = mock((_tag: string, _input?: Record<string, string>) => {})
  const onView = mock((_patch: { readonly selected: string | undefined }) => {})
  const onRetry = mock((_id?: string) => {})
  await act(async () => root.render(<HistoryView
    model={{ repositories, loaded: true, reading: false, failure: undefined, opened: undefined, openedReading: false, openedFailure: undefined, ...model }}
    actions={[run]} onAction={onAction} view={{ selected }} onView={onView} onRetry={onRetry} />))
  unmount = async () => { await act(async () => root.unmount()); host.remove() }
  const names = () => [...host.querySelectorAll(".tree-name")].map(node => node.textContent)
  const press = async (button: Element | null | undefined) => { await act(async () => (button as HTMLButtonElement).click()) }
  return { host, onAction, onView, onRetry, names, press }
}

test("the header's repository and branch start open; other repositories and branches start closed", async () => {
  const { host, names, press } = await mount()
  expect(names()).toEqual(["acme/api", "main", "Fix Safari login", "<script>alert(1)</script>", "feature", "No branch chat", "acme/web", "No repository"])
  expect([...host.querySelectorAll(".history-count")].map(node => node.textContent)).toEqual(["4", "2", "1", "1", "1"])
  expect([...host.querySelectorAll("[data-history='repository'] > button, [data-history='branch'] > button")].map(node => node.getAttribute("aria-expanded")))
    .toEqual(["true", "true", "false", "false", "false"])
  // A chat title is text, never markup.
  expect(host.querySelector("script")).toBeNull()
  // A chat archived with no branch sits directly under its repository.
  expect(host.querySelector("[data-archive='d']")?.parentElement?.parentElement?.getAttribute("data-history")).toBe("repository")
  await press(host.querySelector("[data-name='feature'] > button"))
  expect(names()).toContain("Ship checkout")
  await press(host.querySelector("[data-name='acme/web'] > button"))
  // A repository with one branch opens that branch with it.
  expect(names()).toContain("Other repo")
  await press(host.querySelector("[data-name='acme/api'] > button"))
  expect(names()).not.toContain("Fix Safari login")
  expect(host.querySelector("[data-name='acme/api'] > button")?.getAttribute("aria-expanded")).toBe("false")
  expect(host.querySelector("[data-keyboard-pane='History']")?.getAttribute("aria-label")).toBe("History")
})

test("pressing a chat selects it, pressing the open chat closes it, and a run row runs its command", async () => {
  const closed = await mount()
  expect(closed.host.querySelector(".history-chat")).toBeNull()
  await closed.press(closed.host.querySelector("[data-archive='a'] > button"))
  expect(closed.onView).toHaveBeenCalledWith({ selected: "a" })
  await unmount!()
  const open = await mount({ opened }, "a")
  const row = open.host.querySelector("[data-archive='a']")!
  expect(row.querySelector(":scope > button")?.getAttribute("aria-current")).toBe("true")
  expect(row.querySelector(".history-summary")?.textContent).toBe("You asked why login failed. The cookie flag was fixed.")
  expect(row.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-13T12:00:00.000Z")
  // Entries are prose from this turn's own frames: the prompt, its author, and the answer text.
  const turn = row.querySelector("[data-archived-turn='turn-1']")!
  expect(turn.getAttribute("data-state")).toBe("completed")
  expect(turn.querySelector(".history-prompt")?.textContent).toBe("maya Why does login fail?")
  expect(turn.textContent).toContain("The cookie lacks SameSite.")
  expect(turn.textContent).not.toContain("foreign frame")
  expect(turn.querySelector("button, input, textarea, a[href]")).toBeNull()
  const runRow = row.querySelector("[data-history='run'] button")!
  expect(runRow.getAttribute("data-flow")).toBe("run")
  await open.press(runRow)
  expect(open.onAction).toHaveBeenCalledWith("run", { id: "run-1" })
  await open.press(row.querySelector(":scope > button"))
  expect(open.onView).toHaveBeenCalledWith({ selected: undefined })
  // Only the selected chat shows its body; an unselected chat with no summary shows only its line.
  expect(open.host.querySelectorAll(".history-chat")).toHaveLength(1)
  // The summary and the archived replies are the person's content, so the copy lint reads only the card's own words.
  expect(lintCopy(open.host)).toEqual([])
})

test("a selected chat in a closed group opens the groups that hold it, and one whose entries or summary never arrived still lists", async () => {
  const { host, names } = await mount({}, "e")
  expect(names()).toContain("Other repo")
  const body = host.querySelector("[data-archive='e'] .history-chat")!
  expect(body.textContent).toBe("")
  expect(host.querySelector("[data-archive='e'] time")?.textContent).toBe("Oct 13")
})

test("empty, loading and failed listings", async () => {
  const empty = await mount({ repositories: [] })
  expect(empty.host.textContent).toBe("No archived chats")
  await unmount!()
  // A listing in flight says so; it never claims this identity archived nothing.
  const reading = await mount({ repositories: [], loaded: false, reading: true })
  expect(reading.host.querySelector("[role='status']")?.textContent).toBe("Reading history")
  expect(reading.host.textContent).not.toContain("No archived chats")
  await unmount!()
  // Nobody asked yet, so the card neither claims an empty history nor says it is reading one.
  const unasked = await mount({ repositories: [], loaded: false })
  expect(unasked.host.textContent).toBe("")
  await unmount!()
  const failed = await mount({ repositories: [], failure: unavailable("HistoryUnavailable", "History unavailable") })
  expect(failed.host.querySelector("[role='status']")?.getAttribute("data-failure")).toBe("HistoryUnavailable")
  expect(failed.host.textContent).toContain("History unavailable")
  expect(failed.host.textContent).not.toContain("No archived chats")
  // The one act that can change a failed read is offered, and it asks for the listing, not a chat.
  const retry = failed.host.querySelector<HTMLButtonElement>("[role='status'] button")!
  expect(retry.textContent).toBe("Retry")
  await failed.press(retry)
  expect(failed.onRetry.mock.calls).toEqual([[undefined]])
  expect(failed.onAction).toHaveBeenCalledTimes(0)
  expect(failed.onView).toHaveBeenCalledTimes(0)
  await unmount!()
  // While the next read is in flight the card says so; the failed read before it no longer offers a retry.
  const retrying = await mount({ repositories: [], loaded: false, reading: true, failure: unavailable("HistoryUnavailable", "History unavailable") })
  expect(retrying.host.querySelector("[role='status']")?.textContent).toBe("Reading history")
  expect(retrying.host.textContent).not.toContain("History unavailable")
  expect(retrying.host.querySelector("button")).toBeNull()
  await unmount!()
  // A failed refresh keeps the rows already shown beside its notice.
  const stale = await mount({ failure: unavailable("HistoryUnavailable", "History unavailable") })
  expect(stale.names()).toContain("Fix Safari login")
  expect(stale.host.querySelector("[role='status']")?.textContent).toContain("History unavailable")
})

test("a selected chat whose entries are being read says so, and a failed read offers that chat's retry", async () => {
  const reading = await mount({ openedReading: true }, "a")
  const body = reading.host.querySelector("[data-archive='a'] .history-chat")!
  expect(body.querySelector("[role='status']")?.textContent).toBe("Reading chat")
  expect(body.querySelector("[data-archived-entries]")).toBeNull()
  expect(lintCopy(reading.host)).toEqual([])
  await unmount!()
  const failed = await mount({ openedFailure: unavailable("ArchivedChatUnavailable", "Archived chat unavailable") }, "a")
  const notice = failed.host.querySelector("[data-archive='a'] .history-chat [role='status']")!
  expect(notice.getAttribute("data-failure")).toBe("ArchivedChatUnavailable")
  expect(notice.textContent).toContain("Archived chat unavailable")
  await failed.press(notice.querySelector("button"))
  expect(failed.onRetry.mock.calls).toEqual([["a"]])
  expect(failed.onView).toHaveBeenCalledTimes(0)
  await unmount!()
  // Entries in hand win: no notice stands beside a chat the host already answered for.
  const read = await mount({ opened, openedReading: true, openedFailure: unavailable("ArchivedChatUnavailable", "Archived chat unavailable") }, "a")
  expect(read.host.querySelector("[data-archive='a'] [data-archived-entries]")).not.toBeNull()
  expect(read.host.textContent).not.toContain("Archived chat unavailable")
  expect(read.host.textContent).not.toContain("Reading chat")
  // An unselected chat never wears another chat's read state.
  expect(read.host.querySelectorAll("[role='status']")).toHaveLength(0)
})
