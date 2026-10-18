import type { Route, Screen } from "../../../core/router"
import { BranchesPage } from "./Branches"
import { CommitPage } from "./Commit"
import { Commits } from "./Commits"
import { TagsPage } from "./Tags"
import { TerminalPage } from "./Terminal"

const screen = (id: string, path: string, label: string, overrides = ""): Screen => {
  const query = new URLSearchParams("as=in&role=member&host=hosted&hosted=up&net=ok&data=full&landing=open")
  new URLSearchParams(overrides).forEach((value, key) => query.set(key, value))
  return { id: "history-" + id, route: "smithers.sh/maya/tinyhttp/" + path + "?" + query, label }
}

export const routes: Route[] = [
  {
    pattern: "smithers.sh/:owner/:repo/branches/:branch/terminal",
    name: "Repository · Branch terminal",
    render: ({ params }) => <TerminalPage name={params.branch} />,
    screens: [
      screen("terminal-running", "branches/sandbox%2Fbun-compat/terminal", "Terminal · running", "state=running"),
      screen("terminal-suspended", "branches/sandbox%2Fnode-streams/terminal", "Terminal · suspended", "state=suspended"),
      screen("terminal-hosted-paused", "branches/sandbox%2Fbun-compat/terminal", "Terminal · hosted paused", "hosted=paused"),
      screen("terminal-signed-out", "branches/main/terminal", "Terminal · sign in", "as=out"),
      screen("terminal-reader", "branches/main/terminal", "Terminal · membership required", "role=reader"),
      screen("terminal-loading", "branches/main/terminal", "Terminal · loading", "net=slow"),
      screen("terminal-error", "branches/main/terminal", "Terminal · connection failed", "net=error"),
      screen("terminal-empty", "branches/main/terminal", "Terminal · branch missing", "data=empty"),
      screen("terminal-watched", "branches/smithers%2Fempty-query-values/terminal", "Terminal · attached run", "state=running")
    ]
  },
  {
    pattern: "smithers.sh/:owner/:repo/commits/:ref",
    name: "Repository · Commits",
    render: ({ params }) => <Commits reference={params.ref} />,
    screens: [
      screen("commits-main", "commits/main", "History · main"),
      screen("commits-agent-only", "commits/main", "History · agent-made only", "agent=1"),
      screen("commits-older", "commits/main", "History · older commits", "page=1"),
      screen("commits-loading", "commits/main", "History · loading", "net=slow"),
      screen("commits-error", "commits/main", "History · read failed", "net=error"),
      screen("commits-empty", "commits/main", "History · empty", "data=empty"),
      screen("commits-signed-out", "commits/main", "History · signed out", "as=out"),
      screen("commits-reader", "commits/main", "History · reader", "role=reader")
    ]
  },
  {
    pattern: "smithers.sh/:owner/:repo/commits/:ref/*",
    name: "Repository · Path history",
    render: ({ params }) => <Commits reference={params.ref} path={params["*"]} />,
    screens: [
      screen("commits-path", "commits/main/src/router.ts", "History · src/router.ts")
    ]
  },
  {
    pattern: "smithers.sh/:owner/:repo/commit/:sha",
    name: "Repository · Commit",
    render: ({ params }) => <CommitPage sha={params.sha} />,
    screens: [
      screen("commit-agent", "commit/0d96451d52dbbc3567593b74fa12638d7b7de262", "Commit · agent fix for #31"),
      screen("commit-human", "commit/a41c9e0b0a300d7b3206e3e41b5393fdf22f6a75", "Commit · human"),
      screen("commit-failing-check", "commit/d36e2c209d0e25809dc611ee7c4eeb4c3c40c7e4", "Commit · failing check"),
      screen("commit-line", "commit/0d96451d52dbbc3567593b74fa12638d7b7de262", "Commit · selected diff line", "file=src%2Frouter.ts&L=R19"),
      screen("commit-loading", "commit/a41c9e0", "Commit · loading", "net=slow"),
      screen("commit-error", "commit/a41c9e0", "Commit · read failed", "net=error"),
      screen("commit-empty", "commit/a41c9e0", "Commit · missing", "data=empty"),
      screen("commit-reader", "commit/a41c9e0", "Commit · reader", "role=reader"),
      screen("commit-signed-out", "commit/a41c9e0", "Commit · signed out", "as=out")
    ]
  },
  {
    pattern: "smithers.sh/:owner/:repo/branches",
    name: "Repository · Branches",
    render: () => <BranchesPage />,
    screens: [
      screen("branches", "branches", "Branches · overview"),
      screen("branches-empty", "branches", "Branches · only main", "data=empty"),
      screen("branches-reader", "branches", "Branches · reader", "role=reader"),
      screen("branches-signed-out", "branches", "Branches · signed out", "as=out"),
      screen("branches-loading", "branches", "Branches · loading", "net=slow"),
      screen("branches-error", "branches", "Branches · read failed", "net=error"),
      screen("branches-stale", "branches", "Branches · stale", "tab=stale"),
      screen("branches-new", "branches", "Branches · new branch form", "dialog=new"),
      screen("branches-fork", "branches", "Branches · fork branch", "dialog=fork"),
      screen("branches-rebase", "branches", "Branches · rebase confirmation", "dialog=rebase&branch=archive%2Fradix-router"),
      screen("branches-archive", "branches", "Branches · archive confirmation", "dialog=archive&branch=archive%2Fradix-router"),
      screen("branches-sandbox", "branches", "Branches · sandbox confirmation", "dialog=sandbox"),
      screen("branches-denied", "branches", "Branches · denied act", "role=reader&dialog=sandbox"),
      screen("branches-signin", "branches", "Branches · sign in for act", "as=out&dialog=new")
    ]
  },
  {
    pattern: "smithers.sh/:owner/:repo/tags",
    name: "Repository · Tags",
    render: () => <TagsPage />,
    screens: [
      screen("tags", "tags", "Tags"),
      screen("tags-empty", "tags", "Tags · empty", "data=empty"),
      screen("tags-loading", "tags", "Tags · loading", "net=slow"),
      screen("tags-error", "tags", "Tags · read failed", "net=error"),
      screen("tags-reader", "tags", "Tags · reader", "role=reader"),
      screen("tags-signed-out", "tags", "Tags · signed out", "as=out")
    ]
  }
]
