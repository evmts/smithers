import type { Route, Screen } from "../../../core/router"
import { PullPage } from "./PullPage"
import { Pulls } from "./PullsList"
import { Stack } from "./Stack"

const screen = (id: string, path: string, label: string, flags = ""): Screen => {
  const [pathname, query] = path.split("?")
  const params = new URLSearchParams("as=in&role=member&net=ok&data=full&host=hosted&landing=open")
  new URLSearchParams(query).forEach((value, key) => params.set(key, value))
  new URLSearchParams(flags).forEach((value, key) => params.set(key, value))
  return { id: `pulls-${id}`, route: `smithers.sh/maya/tinyhttp/${pathname}?${params}`, label }
}

export const routes: Route[] = [
  {
    pattern: "smithers.sh/:owner/:repo/pull/:n/commits",
    name: "Pull request · Commits",
    render: (context) => <PullPage n={Number(context.params.n)} tab="commits" />,
    screens: [
      screen("commits", "pull/34/commits", "Pull · commits grouped by day"),
      screen("commits-loading", "pull/34/commits", "Pull commits · loading", "net=slow"),
      screen("commits-error", "pull/34/commits", "Pull commits · error", "net=error"),
      screen("commits-empty", "pull/34/commits", "Pull commits · empty", "data=empty")
    ]
  },
  {
    pattern: "smithers.sh/:owner/:repo/pull/:n/checks",
    name: "Pull request · Checks",
    render: (context) => <PullPage n={Number(context.params.n)} tab="checks" />,
    screens: [
      screen("checks-failing", "pull/34/checks", "Pull · failed check and log"),
      screen("checks-loading", "pull/34/checks", "Pull checks · loading", "net=slow"),
      screen("checks-error", "pull/34/checks", "Pull checks · error", "net=error"),
      screen("checks-empty", "pull/34/checks", "Pull checks · empty", "data=empty")
    ]
  },
  {
    pattern: "smithers.sh/:owner/:repo/pull/:n/files",
    name: "Pull request · Files changed",
    render: (context) => <PullPage n={Number(context.params.n)} tab="files" />,
    screens: [
      screen("files-comments", "pull/34/files", "Pull · diff with review comments"),
      screen("files-review", "pull/34/files?review=1", "Pull · submit a review"),
      screen("files-reader", "pull/34/files?review=1", "Pull · reader can comment", "role=reader"),
      screen("files-signed-out", "pull/34/files?review=1", "Pull · sign in to review", "as=out"),
      screen("files-loading", "pull/34/files", "Pull files · loading", "net=slow"),
      screen("files-error", "pull/34/files", "Pull files · error", "net=error"),
      screen("files-empty", "pull/34/files", "Pull files · empty", "data=empty")
    ]
  },
  {
    pattern: "smithers.sh/:owner/:repo/pull/:n",
    name: "Pull request · Conversation",
    render: (context) => <PullPage n={Number(context.params.n)} tab="conversation" />,
    screens: [
      screen("conversation-changes-requested", "pull/34", "Agent pull · changes requested"),
      screen("conversation-failing", "pull/34", "Pull · merge blocked by Unit tests"),
      screen("conversation-merged", "pull/30", "Pull · merged by a person"),
      screen("conversation-draft", "pull/36", "Pull · draft"),
      screen("conversation-landing", "pull/35", "Landing · review and merge", "host=install"),
      screen(
        "conversation-merge-confirm",
        "pull/35?merge=1",
        "Landing · merge confirmation",
        "host=install"
      ),
      screen("conversation-held", "pull/35", "Pull · hosted merge held", "landing=install"),
      screen(
        "conversation-conflicts",
        "pull/35?conflicts=1",
        "Pull · conflicts with main",
        "host=install"
      ),
      screen("conversation-signed-out", "pull/34", "Pull · signed out", "as=out"),
      screen("conversation-reader", "pull/34", "Pull · reader", "role=reader"),
      screen("conversation-loading", "pull/34", "Pull · loading", "net=slow"),
      screen("conversation-error", "pull/34", "Pull · error", "net=error"),
      screen("conversation-empty", "pull/34", "Pull · not found", "data=empty")
    ]
  },
  {
    pattern: "smithers.sh/:owner/:repo/pulls",
    name: "Pull requests",
    render: (context) => <Pulls query={context.query.get("q") ?? "is:open"} />,
    screens: [
      screen("list-open", "pulls", "Pull requests · open"),
      screen("list-closed", "pulls?q=is%3Aclosed", "Pull requests · closed"),
      screen(
        "list-agent-made",
        "pulls?q=is%3Aopen%20is%3Aagent-made",
        "Pull requests · agent-made"
      ),
      screen("list-empty", "pulls", "Pull requests · empty", "data=empty"),
      screen("list-loading", "pulls", "Pull requests · loading", "net=slow"),
      screen("list-error", "pulls", "Pull requests · error", "net=error"),
      screen("list-signed-out", "pulls", "Pull requests · signed out", "as=out"),
      screen("list-reader", "pulls", "Pull requests · reader", "role=reader")
    ]
  },
  {
    pattern: "smithers.sh/:owner/:repo/stack",
    name: "Stack",
    render: (context) => <Stack filter={context.query.get("filter") ?? "all"} />,
    screens: [
      screen("stack", "stack", "Stack · ordered work"),
      screen("stack-needs-you", "stack?filter=needs-you", "Stack · needs you"),
      screen("stack-working", "stack?filter=working", "Stack · working"),
      screen("stack-failed", "stack?filter=failed", "Stack · failed"),
      screen("stack-empty", "stack", "Stack · empty", "data=empty"),
      screen("stack-loading", "stack", "Stack · loading", "net=slow"),
      screen("stack-error", "stack", "Stack · error", "net=error"),
      screen("stack-reader", "stack", "Stack · read-only", "role=reader"),
      screen("stack-signed-out", "stack", "Stack · public read", "as=out"),
      screen("stack-install", "stack", "Stack · own install", "host=install"),
      screen("stack-held", "stack", "Stack · hosted merge held", "landing=install")
    ]
  }
]
