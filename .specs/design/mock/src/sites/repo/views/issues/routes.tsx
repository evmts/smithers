import type { Route, Screen } from "../../../core/router"
import { Issue } from "./Issue"
import { Issues } from "./Issues"
import { NewIssue } from "./NewIssue"

/* These concrete review routes deliberately name the small example fixture. Views derive every link from repo. */
const screen = (id: string, path: string, query: string, label: string): Screen => {
  const flags = new URLSearchParams("as=in&role=member&net=ok&data=full&landing=open")
  new URLSearchParams(query).forEach((value, key) => flags.set(key, value))
  return { id: `issues-${id}`, route: `smithers.sh/maya/tinyhttp/${path}?${flags}`, label }
}
export const routes: Route[] = [
  {
    pattern: "smithers.sh/:owner/:repo/issues",
    name: "Repository · Issues",
    render: () => <Issues/>,
    screens: [
      screen("list-open", "issues", "q=is:open", "Issues · open"),
      screen("list-closed", "issues", "q=is:closed", "Issues · closed"),
      screen("list-label-bug", "issues", "q=is:open%20label:bug", "Issues · bug label"),
      screen("list-fixed-by-agents", "issues", "q=is:fixed-by-agents", "Issues · fixed by agents"),
      screen("list-fixed-ignores-state", "issues", "q=is:fixed-by-agents%20is:closed", "Issues · completed fixes"),
      screen("list-todo", "issues", "q=is:todo", "Issues · has TODO"),
      screen("list-empty", "issues", "data=empty", "Issues · empty repository"),
      screen("list-no-results", "issues", "q=is:open%20no-such-router-bug", "Issues · no results"),
      screen("list-loading", "issues", "net=slow", "Issues · loading"),
      screen("list-error", "issues", "net=error", "Issues · GitHub sync failed"),
      screen("list-signed-out", "issues", "as=out", "Issues · signed out"),
      screen("list-reader", "issues", "role=reader", "Issues · reader")
    ]
  },
  {
    pattern: "smithers.sh/:owner/:repo/issues/new",
    name: "Repository · New issue",
    render: () => <NewIssue/>,
    screens: [
      screen("new", "issues/new", "", "New issue"),
      screen("new-preview", "issues/new", "template=feature&mode=preview", "New issue · markdown preview"),
      screen("new-bug-template", "issues/new", "template=bug&build=mock-preview&correlationId=mock-sync-2102", "New issue · bug report"),
      screen("new-signed-out", "issues/new", "as=out", "New issue · signed-out draft"),
      screen("new-reader", "issues/new", "role=reader", "New issue · contributor"),
      screen("new-loading", "issues/new", "net=slow", "New issue · loading"),
      screen("new-error", "issues/new", "net=error", "New issue · sync failed")
    ]
  },
  {
    pattern: "smithers.sh/:owner/:repo/issues/:n",
    name: "Repository · Issue",
    render: context => <Issue n={Number(context.params.n)}/>,
    screens: [
      screen("detail-landed", "issues/31", "", "Issue #31 · landed evidence"),
      screen("detail-accepted-evidence", "issues/31", "evidence=accepted", "Issue #31 · acceptance event"),
      screen("detail-ask", "issues/31", "ask=open", "Issue #31 · Ask suggestions"),
      screen("detail-working", "issues/11", "", "Issue #11 · agent working"),
      screen("detail-todo", "issues/38", "", "Issue #38 · queued TODO"),
      screen("detail-no-receipt", "issues/29", "", "Issue #29 · no receipt"),
      screen("detail-in-review", "issues/33", "", "Issue #33 · in review"),
      screen("detail-not-planned", "issues/18", "", "Issue #18 · not planned"),
      screen("detail-reader", "issues/31", "role=reader", "Issue · member acts unavailable"),
      screen("detail-signed-out", "issues/31", "as=out", "Issue · signed out"),
      screen("detail-held-implement", "issues/29", "landing=install&act=implement", "Issue · implement held"),
      screen("detail-implement-confirm", "issues/29", "act=implement", "Issue · implement confirmation"),
      screen("detail-repro-confirm", "issues/29", "act=repro", "Issue · reproduce confirmation"),
      screen("detail-loading", "issues/31", "net=slow", "Issue · loading"),
      screen("detail-error", "issues/31", "net=error", "Issue · sync failed"),
      screen("detail-not-found", "issues/999", "", "Issue · not found")
    ]
  }
]
