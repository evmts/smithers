import type { Action } from "@smthrs/rpc/CardAction"
import type { UserFailure } from "@smthrs/rpc/UserFailure"
import type { SharedConversation } from "../../state/seams/SharedConversationSeam"
import { HistoryView, type HistoryViewProps } from "./HistoryView"
import type { StoryInteraction, ViewStory } from "./stories"

type Model = HistoryViewProps["model"]
const at = Date.UTC(2026, 9, 13, 12)
const summary = "You asked why login failed in Safari. The cookie lacked SameSite, and the fix merged as one pull request."
const run: Action = { tag: "run", label: "run-1", args: { id: "run-1" } }
const opened: SharedConversation = { id: "archive-a", entries: [{
  id: "turn-1", author: 7, authorLogin: "maya", runId: "r1", prompt: "Why does login fail in Safari?", state: "completed",
  frames: [{ runId: "r1", type: "delta", kind: "text", text: "The cookie lacks **SameSite**. Safari drops it on the redirect back from GitHub." }, { runId: "r1", type: "done", reason: "stop" }]
}] }
const one: Model["repositories"] = [{ repository: "acme/api", current: true, branches: [{ branch: "main", current: true, chats: [
  { id: "a", title: "Fix Safari login", archivedAt: at, summary, runs: ["run-1"] },
  { id: "b", title: "Rename the billing page", archivedAt: at - 86_400_000, summary: undefined, runs: [] }] }] }]
const many: Model["repositories"] = [
  { repository: "acme/api", current: true, branches: [
    { branch: "main", current: true, chats: [{ id: "a", title: "Fix Safari login", archivedAt: at, summary, runs: [] }] },
    { branch: null, current: false, chats: [{ id: "d", title: "Compare two queue designs", archivedAt: at, summary: undefined, runs: [] }] }] },
  { repository: "acme/web", current: false, branches: [{ branch: "main", current: false, chats: [{ id: "e", title: "Ship checkout", archivedAt: at, summary: undefined, runs: [] }] }] },
  { repository: null, current: false, branches: [{ branch: null, current: false, chats: [{ id: "f", title: "Plan the week", archivedAt: at, summary: undefined, runs: [] }] }] }
]
const failure: UserFailure = { tag: "HistoryUnavailable", fault: "infra", sentence: "History unavailable", actions: ["retry"], detail: "History unavailable" }
const chatFailure: UserFailure = { tag: "ArchivedChatUnavailable", fault: "infra", sentence: "Archived chat unavailable", actions: ["retry"], detail: "Archived chat unavailable" }
/* A retry reads again; the story records the press and expects no flow and no view patch. */
const retry: StoryInteraction = { selector: "[role='status'] button", action: null }

const chat = (id: string, selected: string | undefined): StoryInteraction => ({ selector: `[data-archive="${id}"] > button`, patch: { selected } })
const group = (kind: "repository" | "branch", name: string): StoryInteraction => ({ selector: `[data-history="${kind}"][data-name="${name}"] > button` })
// A closed group opens rows no interaction names, so it is opened and then closed again.
const closed = (name: string): StoryInteraction[] => [group("repository", name), group("repository", name)]

const story = (name: string, expect: readonly string[], model: Partial<Model>, selected: string | undefined, interactions: readonly StoryInteraction[], actions: readonly Action[] = []): ViewStory => ({
  name, expect, actions, interactions,
  render: (callbacks, supplied = actions) => <HistoryView
    model={{ repositories: [], loaded: true, reading: false, failure: undefined, opened: undefined, openedReading: false, openedFailure: undefined, ...model }}
    actions={supplied as readonly Action[]} view={{ selected }} onAction={callbacks.onAction} onView={callbacks.onView} onRetry={() => {}} />,
})

export const stories: ViewStory[] = [
  story("Open chat", ["acme/api", "main", "Fix Safari login", summary, "run-1", "Why does login fail in Safari?", "Rename the billing page"], { repositories: one, opened }, "a",
    [chat("a", undefined), chat("b", "b"), group("branch", "main"), group("repository", "acme/api")], [run]),
  story("Other repositories closed", ["acme/api", "main", "Fix Safari login", "Compare two queue designs", "acme/web", "No repository"], { repositories: many }, undefined,
    [chat("a", "a"), chat("d", "d"), group("branch", "main"), ...closed("acme/web"), ...closed("No repository"), group("repository", "acme/api")]),
  story("No archived chats", ["No archived chats"], {}, undefined, []),
  story("Reading", ["Reading history"], { loaded: false, reading: true }, undefined, []),
  story("Unavailable", ["History unavailable", "Retry", "acme/api", "Fix Safari login"], { repositories: one, failure }, undefined,
    [retry, chat("a", "a"), chat("b", "b"), group("branch", "main"), group("repository", "acme/api")]),
  story("Reading a chat", ["Reading chat", "Fix Safari login"], { repositories: one, openedReading: true }, "a",
    [chat("a", undefined), chat("b", "b"), group("branch", "main"), group("repository", "acme/api")]),
  story("Chat unavailable", ["Archived chat unavailable", "Retry", "Fix Safari login"], { repositories: one, openedFailure: chatFailure }, "a",
    [retry, chat("a", undefined), chat("b", "b"), group("branch", "main"), group("repository", "acme/api")]),
]
