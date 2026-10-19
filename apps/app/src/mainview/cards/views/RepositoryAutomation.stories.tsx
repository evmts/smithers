import type { StoryCallbacks, StoryInteraction, ViewStory } from "./stories"
import { RepositoryFlows, RepositoryFlow } from "../../repository/RepositoryFlows"
import { RepositorySettings } from "../../repository/RepositorySettings"

const flow = { name: "review", path: ".smithers/flows/review/flow.ts", description: "Review changes", source: 'export default Flow.make("review", {\n  description: "Review changes",\n})\n' }
/** The view's encoded command line reaches the harness as one `args` field, so each control's flow and line are checked. */
const run = ({ onAction }: StoryCallbacks) => (tag: string, args?: string) => onAction(tag, args === undefined ? {} : { args })
/** Copy and Sign in are always shown, so each is a declared gesture: clicked once, its flow and line checked. */
const copy = { gestures: { copy: { tag: "chat.copy-message", label: "Copy", args: { args: "npx smthrs@next flow start review" } } }, interactions: [{ selector: "button.repo-ui-copy", gesture: "copy" }] }
/** The section picker navigates through the router; it calls neither callback. */
const section: StoryInteraction[] = [{ selector: "select", event: "change", value: "sync", action: null }]
export const stories: ViewStory[] = [
  { name: "flows", expect: ["Flows", "review"], ...copy, render: callbacks => <RepositoryFlows repo="a/b" revision="main" onRunCommand={run(callbacks)} read={{ state: "ready", value: [flow] }} /> },
  { name: "source", expect: ["Review changes", "Copy"], ...copy, render: callbacks => <RepositoryFlow repo="a/b" name="review" revision="main" onRunCommand={run(callbacks)} read={{ state: "ready", value: flow }} /> },
  { name: "loading", expect: ["Loading…"], render: callbacks => <RepositoryFlows repo="a/b" revision="main" onRunCommand={run(callbacks)} read={{ state: "loading" }} /> },
  { name: "error", expect: ["Host unavailable"], render: callbacks => <RepositoryFlows repo="a/b" revision="main" onRunCommand={run(callbacks)} read={{ state: "error", reason: "Host unavailable" }} /> },
  { name: "empty", expect: ["No flows yet."], render: callbacks => <RepositoryFlows repo="a/b" revision="main" onRunCommand={run(callbacks)} read={{ state: "ready", value: [] }} /> },
  { name: "settings", expect: ["Models", "GitHub sync"], interactions: section, render: callbacks => <RepositorySettings repo="a/b" access="member" onRunCommand={run(callbacks)} sync={{ state: "synced" }} /> },
  { name: "settings-stale", expect: ["Synced 3 h ago"], interactions: section, render: callbacks => <RepositorySettings repo="a/b" access="member" section="sync" onRunCommand={run(callbacks)} sync={{ state: "stale", age: "3 h ago" }} /> },
  { name: "settings-error", expect: ["GitHub sync failed: App permission missing"], interactions: section, render: callbacks => <RepositorySettings repo="a/b" access="member" section="sync" onRunCommand={run(callbacks)} sync={{ state: "failed", failure: "GitHub sync failed: App permission missing", age: "2 h ago" }} /> },
  { name: "settings-signed-out", expect: ["Sign in to open repository settings."], gestures: { signIn: { tag: "sign-in", label: "Sign in with GitHub" } }, interactions: [{ selector: "button.repo-ui-btn-primary", gesture: "signIn" }], render: callbacks => <RepositorySettings repo="a/b" access="signed-out" onRunCommand={run(callbacks)} sync={{ state: "synced" }} /> },
  { name: "settings-reader", expect: ["Page not found."], render: callbacks => <RepositorySettings repo="a/b" access="reader" onRunCommand={run(callbacks)} sync={{ state: "synced" }} /> },
]
