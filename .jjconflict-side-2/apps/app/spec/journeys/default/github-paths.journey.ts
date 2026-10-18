import { journey } from "../../journey"
import { mondayClaim } from "../../mondayClaim"
export const subjects = [
  ["", "region", "Files"],
  ["/tree/main", "region", "Files"],
  ["/blob/main/README.md", "region", "README.md"],
  ["/blame/main/README.md", "region", "Blame"],
  ["/commits/main", "region", "Commits"],
  ["/commit/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "region", "Commit"],
  ["/branches", "region", "Branches"],
  ["/tags", "region", "Tags"],
  ["/issues", "region", "Issues"],
  ["/issues/4267", "region", "Issue"],
  ["/pulls", "region", "Pull requests"],
  ["/pull/1", "region", "Pull request"],
  ["/pull/1/commits", "region", "Commits"],
  ["/pull/1/checks", "region", "Checks"],
  ["/pull/1/files", "region", "Files changed"],
  ["/releases", "region", "Releases"],
  ["/releases/tag/v1.0.0", "region", "Release"],
  ["/wiki", "region", "Wiki"],
  ["/wiki/Home", "region", "Wiki"],
  ["/settings", "alert", undefined],
  ["/runs", "region", "Runs"],
  ["/runs/spec-agent-run", "region", "Run"],
  ["/flows", "region", "Flows"],
  ["/flows/todo", "region", "Flow"],
  ["/stack", "region", "Stack"],
  ["/agents", "region", "Agents"],
  ["/approvals", "region", "Approvals"]
] as const
export default journey({
  id: "default/github-paths",
  site: "default",
  lifecycle: "evergreen",
  spec: "PM D2; repo-ui-spec principle 1, views 1-13",
  world: { base: "default", variant: { as: "out", data: "full", net: "ok" } },
  live: { target: "default", subject: { repo: "smithers-canary/smithers" } },
  steps: subjects.map(([path, role, name]) => ({
    caption: `Host-swapped ${path || "/"}`,
    go: "/${repo}" + path,
    expect: [
      ...mondayClaim,
      { see: { role, ...(name ? { name } : {}) } },
      ...(path === "/settings" ? [{ see: { role: "button", name: "Save" }, count: 0 }] : [])
    ]
  }))
})
