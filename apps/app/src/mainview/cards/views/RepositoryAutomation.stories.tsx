import type { ViewStory } from "./stories"
import { RepositoryFlows, RepositoryFlow } from "../../repository/RepositoryFlows"
import { RepositorySettings } from "../../repository/RepositorySettings"

const flow = { name: "review", path: ".smithers/flows/review/flow.ts", description: "Review changes", source: 'export default Flow.make("review", {\n  description: "Review changes",\n})\n' }
const run = () => {}
export const stories: ViewStory[] = [
  { name: "flows", expect: ["Flows", "review"], render: () => <RepositoryFlows repo="a/b" revision="main" onRunCommand={run} read={{ state: "ready", value: [flow] }} /> },
  { name: "source", expect: ["Review changes", "Copy"], render: () => <RepositoryFlow repo="a/b" name="review" revision="main" onRunCommand={run} read={{ state: "ready", value: flow }} /> },
  { name: "loading", expect: ["Loading…"], render: () => <RepositoryFlows repo="a/b" revision="main" onRunCommand={run} read={{ state: "loading" }} /> },
  { name: "error", expect: ["Host unavailable"], render: () => <RepositoryFlows repo="a/b" revision="main" onRunCommand={run} read={{ state: "error", reason: "Host unavailable" }} /> },
  { name: "empty", expect: ["No flows yet."], render: () => <RepositoryFlows repo="a/b" revision="main" onRunCommand={run} read={{ state: "ready", value: [] }} /> },
  { name: "settings", expect: ["Models", "GitHub sync"], render: () => <RepositorySettings repo="a/b" access="member" onRunCommand={run} sync={{ state: "synced" }} /> },
  { name: "settings-stale", expect: ["Synced 3 h ago"], render: () => <RepositorySettings repo="a/b" access="member" section="sync" onRunCommand={run} sync={{ state: "stale", age: "3 h ago" }} /> },
  { name: "settings-error", expect: ["GitHub sync failed: App permission missing"], render: () => <RepositorySettings repo="a/b" access="member" section="sync" onRunCommand={run} sync={{ state: "failed", failure: "GitHub sync failed: App permission missing", age: "2 h ago" }} /> },
  { name: "settings-signed-out", expect: ["Sign in to open repository settings."], render: () => <RepositorySettings repo="a/b" access="signed-out" onRunCommand={run} sync={{ state: "synced" }} /> },
  { name: "settings-reader", expect: ["Page not found."], render: () => <RepositorySettings repo="a/b" access="reader" onRunCommand={run} sync={{ state: "synced" }} /> },
]
