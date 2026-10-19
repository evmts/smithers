import type { StoryCallbacks, StoryInteraction, ViewStory } from "./stories"
import { flowArgs } from "../../flows/FlowArgs"
import { flowCommand } from "../../repository/FlowContents"
import { RepositoryFlows, RepositoryFlow } from "../../repository/RepositoryFlows"
import { RepositorySettings } from "../../repository/RepositorySettings"

const flow = { name: "review", path: ".smithers/flows/review/flow.ts", description: "Review changes", source: 'export default Flow.make("review", {\n  description: "Review changes",\n})\n' }
/** Every control routes through onRunCommand; the story forwards it to onAction so each press has a declared expectation. */
const runner = (callbacks: StoryCallbacks) => (name: string, args?: string) => callbacks.onAction(name, args === undefined ? {} : { args })
/** Copy is a local gesture, not a supplied action: the gesture names its exact flow call and the interaction presses it once. */
const copyGesture = (name: string) => ({ copy: { tag: "chat.copy-message", label: "Copy", args: { args: flowArgs("chat.copy-message", { text: flowCommand(name) }) } } })
const copy = (name: string): StoryInteraction => ({ selector: `button[aria-label="Copy ${flowCommand(name)}"]`, gesture: "copy" })
const signInGesture = { "sign-in": { tag: "sign-in", label: "Sign in with GitHub", args: {} } }
/** The mobile section picker navigates through the router; it calls neither story callback. */
const sectionPicker: StoryInteraction = { selector: "select", event: "change", value: "sync", action: null }
export const stories: ViewStory[] = [
  { name: "flows", expect: ["Flows", "review"], gestures: copyGesture("review"), interactions: [copy("review")], render: callbacks => <RepositoryFlows repo="a/b" revision="main" onRunCommand={runner(callbacks)} read={{ state: "ready", value: [flow] }} /> },
  { name: "source", expect: ["Review changes", "Copy"], gestures: copyGesture("review"), interactions: [copy("review")], render: callbacks => <RepositoryFlow repo="a/b" name="review" revision="main" onRunCommand={runner(callbacks)} read={{ state: "ready", value: flow }} /> },
  { name: "loading", expect: ["Loading…"], render: callbacks => <RepositoryFlows repo="a/b" revision="main" onRunCommand={runner(callbacks)} read={{ state: "loading" }} /> },
  { name: "error", expect: ["Host unavailable"], render: callbacks => <RepositoryFlows repo="a/b" revision="main" onRunCommand={runner(callbacks)} read={{ state: "error", reason: "Host unavailable" }} /> },
  { name: "empty", expect: ["No flows yet."], render: callbacks => <RepositoryFlows repo="a/b" revision="main" onRunCommand={runner(callbacks)} read={{ state: "ready", value: [] }} /> },
  { name: "settings", interactions: [sectionPicker], expect: ["Models", "GitHub sync"], render: callbacks => <RepositorySettings repo="a/b" access="member" onRunCommand={runner(callbacks)} sync={{ state: "synced" }} /> },
  { name: "settings-stale", interactions: [sectionPicker], expect: ["Synced 3 h ago"], render: callbacks => <RepositorySettings repo="a/b" access="member" section="sync" onRunCommand={runner(callbacks)} sync={{ state: "stale", age: "3 h ago" }} /> },
  { name: "settings-error", interactions: [sectionPicker], expect: ["GitHub sync failed: App permission missing"], render: callbacks => <RepositorySettings repo="a/b" access="member" section="sync" onRunCommand={runner(callbacks)} sync={{ state: "failed", failure: "GitHub sync failed: App permission missing", age: "2 h ago" }} /> },
  { name: "settings-signed-out", gestures: signInGesture, interactions: [{ selector: "button", gesture: "sign-in" }], expect: ["Sign in to open repository settings."], render: callbacks => <RepositorySettings repo="a/b" access="signed-out" onRunCommand={runner(callbacks)} sync={{ state: "synced" }} /> },
  { name: "settings-reader", expect: ["Page not found."], render: callbacks => <RepositorySettings repo="a/b" access="reader" onRunCommand={runner(callbacks)} sync={{ state: "synced" }} /> },
]
