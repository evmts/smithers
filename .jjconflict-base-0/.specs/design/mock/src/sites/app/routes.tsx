/* The smithers.sh repo app routes (Kimi A): repo home, code, issues, changes, runs, and every card. */
import type { Route } from "../core/router"
import { CommitPage, BlobPage, IssuePage, IssuesPage, PullPage, PullsPage, RunPage, TreePage } from "./pages"
import { RepoPage } from "./repo"

const S = "smithers.sh"
const SMITHERS = `${S}/smithers-canary/smithers`
const EFFECK = `${S}/effeck/effeck`

export const appRoutes: Array<Route> = [
  { pattern: `${S}/:owner/:repo/bug`, name: "S#9 Report a bug", render: context => { const query = new URLSearchParams(context.query); query.set("card", "bug"); return <RepoPage context={{ ...context, query }} /> }, screens: [{ id: "bug-direct", route: `${SMITHERS}/bug?as=in`, label: "Report a bug: direct route", site: "smithers" }] },
  { pattern: `${S}/:owner/:repo/commit/:sha`, name: "E#8 Landed commit evidence", render: context => <CommitPage context={context} />, screens: [{ id: "effeck-landed-commit", route: `${EFFECK}/commit/7e2c4a1`, label: "VibeLang: landed commit", site: "effeck" }] },
  {
    pattern: `${S}/:owner/:repo/tree/:ref/*`,
    name: "S#7 / E#5 View source (tree)",
    render: context => <TreePage context={context} />,
    screens: [
      { id: "tree-root", route: `${SMITHERS}/tree/main`, label: "Tree: repo root", site: "smithers" },
      { id: "tree-subfolder", route: `${SMITHERS}/tree/main/packages/rpc/src`, label: "Tree: a subfolder", site: "smithers" },
      { id: "tree-loading", route: `${SMITHERS}/tree/main?net=slow`, label: "Tree: loading", site: "smithers" },
      { id: "tree-error", route: `${SMITHERS}/tree/main?net=error`, label: "Tree: error", site: "smithers" },
      { id: "effeck-tree", route: `${EFFECK}/tree/main/examples/users`, label: "Tree: directory with README", site: "effeck" }
    ]
  },
  {
    pattern: `${S}/:owner/:repo/blob/:ref/*`,
    name: "S#7 / E#5 View source (file)",
    render: context => <BlobPage context={context} />,
    screens: [
      { id: "blob-ts-range", route: `${SMITHERS}/blob/main/packages/smithers/flows/src/Runtime.ts?L=60-86`, label: "File: TypeScript with a line range", site: "smithers" },
      { id: "blob-markdown", route: `${SMITHERS}/blob/main/README.md`, label: "File: Markdown rendered", site: "smithers" },
      { id: "blob-effeck", route: `${EFFECK}/blob/main/examples/users/src/main.effeck?L=37-44`, label: "File: a .vibe source", site: "effeck" },
      { id: "blob-json", route: `${EFFECK}/blob/main/.smithers/home.json`, label: "File: home.json", site: "effeck" }
    ]
  },
  {
    pattern: `${S}/:owner/:repo/issues/:n`,
    name: "S#8 / E#6 Issue",
    render: context => <IssuePage context={context} />,
    screens: [
      { id: "issue-accepted-working", route: `${SMITHERS}/issues/4232`, label: "Issue: accepted, working", site: "smithers" },
      { id: "issue-merged", route: `${SMITHERS}/issues/4235`, label: "Issue: fixed and merged", site: "smithers" },
      { id: "issue-new", route: `${SMITHERS}/issues/4252`, label: "Issue: new report", site: "smithers" },
      { id: "issue-effeck-merged", route: `${EFFECK}/issues/98`, label: "Issue: VibeLang, fixed and landed", site: "effeck" }
    ]
  },
  {
    pattern: `${S}/:owner/:repo/issues`,
    name: "S#8 / E#6 Issues",
    render: context => <IssuesPage context={context} />,
    screens: [
      { id: "issues-list", route: `${SMITHERS}/issues`, label: "Issues: open", site: "smithers" },
      { id: "issues-empty", route: `${SMITHERS}/issues?data=empty`, label: "Issues: empty", site: "smithers" },
      { id: "issues-error", route: `${SMITHERS}/issues?net=error`, label: "Issues: error", site: "smithers" },
      { id: "issues-factory", route: `${SMITHERS}/issues?view=factory`, label: "Issues: Fixed by agents", site: "smithers" },
      { id: "issues-effeck", route: `${EFFECK}/issues`, label: "Issues: VibeLang", site: "effeck" },
      { id: "issues-effeck-factory", route: `${EFFECK}/issues?view=factory`, label: "Issues: VibeLang Fixed by agents", site: "effeck" }
    ]
  },
  {
    pattern: `${S}/:owner/:repo/pulls`,
    name: "S#13 Changes",
    render: context => <PullsPage context={context} />,
    screens: [
      { id: "changes-list", route: `${SMITHERS}/pulls`, label: "Changes", site: "smithers" },
      { id: "changes-empty", route: `${EFFECK}/pulls`, label: "Changes: none yet", site: "effeck" }
    ]
  },
  {
    pattern: `${S}/:owner/:repo/pull/:n`,
    name: "S#13 / S#14 Change and land receipt",
    render: context => <PullPage context={context} />,
    screens: [
      { id: "pr-visitor", route: `${SMITHERS}/pull/44?as=out`, label: "Change: visitor", site: "smithers" },
      { id: "pr-signed-in", route: `${SMITHERS}/pull/44?as=in&role=reader`, label: "Change: signed in, not a maintainer", site: "smithers" },
      { id: "pr-merged", route: `${SMITHERS}/pull/44?state=merged&as=in`, label: "Change: merged receipt", site: "smithers" },
      { id: "pr-checks-failed", route: `${SMITHERS}/pull/44?state=checks-failed&as=in`, label: "Change: checks failed", site: "smithers" },
      { id: "pr-maya", route: `${S}/maya/tinyhttp/pull/12?as=in`, label: "Change: maya on her own repo", site: "smithers" },
      { id: "pr-install", route: `${S}/maya/tinyhttp/pull/12?as=in&host=install`, label: "Change: own install, Review & merge", site: "smithers" },
      { id: "pr-none-effeck", route: `${EFFECK}/pull/1`, label: "Change: none on VibeLang's repo", site: "effeck" }
    ]
  },
  {
    pattern: `${S}/:owner/:repo/runs/:id`,
    name: "S#12 Run",
    render: context => <RunPage context={context} />,
    screens: [
      { id: "run-done", route: `${SMITHERS}/runs/run-4719`, label: "Run: done", site: "smithers" },
      { id: "run-model", route: `${S}/maya/tinyhttp/runs/run-512?as=in&landing=open&run=model`, label: "Run: model working", site: "smithers" },
      { id: "run-admitted", route: `${S}/maya/tinyhttp/runs/run-512?as=in&landing=open&run=admitted`, label: "Run: admitted", site: "smithers" },
      { id: "run-allocating", route: `${S}/maya/tinyhttp/runs/run-512?as=in&landing=open&run=allocating`, label: "Run: allocating a machine", site: "smithers" },
      { id: "run-cloning", route: `${S}/maya/tinyhttp/runs/run-512?as=in&landing=open&run=cloning`, label: "Run: cloning", site: "smithers" },
      { id: "run-verifying", route: `${S}/maya/tinyhttp/runs/run-512?as=in&landing=open&run=verifying`, label: "Run: verifying", site: "smithers" },
      { id: "run-needs-you", route: `${S}/maya/tinyhttp/runs/run-512?as=in&landing=open&run=needs-you`, label: "Run: needs you", site: "smithers" },
      { id: "run-failed", route: `${S}/maya/tinyhttp/runs/run-512?as=in&landing=open&run=failed`, label: "Run: failed", site: "smithers" },
      { id: "run-install", route: `${S}/maya/tinyhttp/runs/run-512?as=in&landing=open&host=install&run=model`, label: "Run: own install phases", site: "smithers" },
      { id: "run-effeck", route: `${EFFECK}/runs/run-310`, label: "Run: VibeLang factory run, done", site: "effeck" }
    ]
  },
  {
    pattern: `${S}/:owner/:repo`,
    name: "S#2 / S#6 / S#11 / E#4 Repo home",
    render: context => <RepoPage context={context} />,
    screens: [
      { id: "guest-off-question-draft", route: `${SMITHERS}?as=out&guest=off&card=ask-signin&draft=How%20does%20a%20stopped%20run%20resume%3F`, label: "Sign in to ask: question kept", site: "smithers" },
      { id: "bug-restored-draft", route: `${SMITHERS}?as=in&card=bug&draft=restored`, label: "Bug: restored draft", site: "smithers" },
      { id: "maya-install-model-held", route: `${S}/maya/tinyhttp?as=in&landing=install&run=model-none`, label: "Monday: model connection held", site: "smithers" },
      { id: "pr-install-visitor", route: `${SMITHERS}/pull/44?as=out&host=install`, label: "Own install: visitor cannot merge", site: "smithers" },
      { id: "repo-home-signed-out", route: `${SMITHERS}?as=out`, label: "Repo home: Smithers, signed out", site: "smithers" },
      { id: "repo-home-signed-in", route: `${SMITHERS}?as=in&role=reader`, label: "Repo home: Smithers, signed in", site: "smithers" },
      { id: "repo-home-guest-off", route: `${SMITHERS}?as=out&guest=off`, label: "Repo home: guest chat off", site: "smithers" },
      { id: "repo-home-data-empty", route: `${SMITHERS}?as=out&data=empty`, label: "Repo home: no fixed pairs yet", site: "smithers" },
      { id: "repo-home-slow", route: `${SMITHERS}?as=out&net=slow`, label: "Repo home: loading", site: "smithers" },
      { id: "repo-home-error", route: `${SMITHERS}?as=out&net=error`, label: "Repo home: error", site: "smithers" },
      { id: "effeck-home-signed-out", route: `${EFFECK}?as=out`, label: "Repo home: VibeLang, signed out", site: "effeck" },
      { id: "effeck-home-converter", route: `${EFFECK}?as=out&converter=on`, label: "Repo home: VibeLang, converter on", site: "effeck" },
      { id: "effeck-example-signed-out", route: `${S}/effeck/effeck-example?as=out`, label: "Repo home: effeck-example, signed out", site: "effeck" },
      { id: "effeck-example-signed-in", route: `${S}/effeck/effeck-example?as=in`, label: "Repo home: effeck-example, signed in", site: "effeck" },
      { id: "hello-home", route: `${S}/smithersai/hello-smithers?as=out`, label: "Repo home: hello-smithers", site: "smithers" },
      { id: "repo-held-name", route: `${S}/smithersai/smithers?as=out`, label: "smithersai/smithers: the ordinary signed-out card", site: "smithers" },
      { id: "repo-signin-card", route: `${S}/maya/tinyhttp?as=out`, label: "Repo not readable: sign-in card", site: "smithers" },
      { id: "repo-import", route: `${S}/maya/tinyhttp?as=in&repos=none`, label: "Import card", site: "smithers" },
      { id: "repo-unknown", route: `${S}/acme/unknown?as=in`, label: "Repo Smithers can't read", site: "smithers" },
      { id: "guest-qa", route: `${SMITHERS}?as=out&guest=ok&ask=1`, label: "Guest chat: an answer", site: "smithers" },
      { id: "guest-ceiling", route: `${SMITHERS}?as=out&guest=ceiling&ask=1`, label: "Guest chat: ceiling reached", site: "smithers" },
      { id: "guest-change-request", route: `${SMITHERS}?as=out&guest=ok&ask=fix`, label: "Guest chat: change request refused", site: "smithers" },
      { id: "bug-form-signed-out", route: `${SMITHERS}?as=out&card=bug`, label: "Bug form: signed out", site: "smithers" },
      { id: "bug-form-signed-in", route: `${SMITHERS}?as=in&card=bug`, label: "Bug form: signed in", site: "smithers" },
      { id: "bug-from-conversion", route: `${EFFECK}?card=bug&from=conversion&as=out`, label: "Bug form: from the converter" },
      { id: "bug-sent-smithers", route: `${SMITHERS}?card=bug-sent&as=in`, label: "Bug published: Smithers", site: "smithers" },
      { id: "bug-sent-effeck", route: `${EFFECK}?card=bug-sent&as=in`, label: "Bug published: VibeLang", site: "effeck" },
      { id: "example-signed-out", route: `${S}/smithersai/hello-smithers?card=example&as=out`, label: "Example: signed out", site: "smithers" },
      { id: "example-signed-in", route: `${S}/smithersai/hello-smithers?card=example&as=in&landing=open`, label: "Example: signed in", site: "smithers" },
      { id: "example-paused", route: `${S}/smithersai/hello-smithers?card=example&as=in&hosted=paused`, label: "Example: hosted paused", site: "smithers" },
      { id: "example-copy-made", route: `${S}/maya/hello-smithers?as=in&landing=open&compose=Add%20Spanish%20greetings%20and%20test%20both`, label: "Example: copy made, composer ready", site: "smithers" },
      { id: "maya-home", route: `${S}/maya/tinyhttp?as=in`, label: "maya's repo: home", site: "smithers" },
      { id: "maya-ask-install", route: `${S}/maya/tinyhttp?as=in&landing=install&ask=change`, label: "maya's ask: the install reply (Monday)", site: "smithers" },
      { id: "maya-model-none", route: `${S}/maya/tinyhttp?as=in&landing=open&model=none&run=model-none`, label: "maya's change: connect a model", site: "smithers" },
      { id: "maya-run-admitted", route: `${S}/maya/tinyhttp?as=in&landing=open&run=admitted`, label: "maya's change: admitted", site: "smithers" },
      { id: "maya-run-allocating", route: `${S}/maya/tinyhttp?as=in&landing=open&run=allocating`, label: "maya's change: allocating", site: "smithers" },
      { id: "maya-run-cloning", route: `${S}/maya/tinyhttp?as=in&landing=open&run=cloning`, label: "maya's change: cloning", site: "smithers" },
      { id: "maya-run-model", route: `${S}/maya/tinyhttp?as=in&landing=open&run=model`, label: "maya's change: model working", site: "smithers" },
      { id: "maya-run-verifying", route: `${S}/maya/tinyhttp?as=in&landing=open&run=verifying`, label: "maya's change: verifying", site: "smithers" },
      { id: "maya-run-pr", route: `${S}/maya/tinyhttp?as=in&landing=open&run=pr`, label: "maya's change: pull request opened", site: "smithers" },
      { id: "maya-run-merged", route: `${S}/maya/tinyhttp?as=in&landing=open&run=merged`, label: "maya's change: merged on GitHub", site: "smithers" },
      { id: "maya-run-refused", route: `${S}/maya/tinyhttp?as=in&landing=open&hosted=paused&run=refused`, label: "maya's change: refused, no machine", site: "smithers" },
      { id: "maya-run-needs-you", route: `${S}/maya/tinyhttp?as=in&landing=open&run=needs-you`, label: "maya's change: the agent asks", site: "smithers" },
      { id: "maya-run-failed", route: `${S}/maya/tinyhttp?as=in&landing=open&run=failed`, label: "maya's change: verifying failed", site: "smithers" },
      { id: "maya-run-reopened", route: `${S}/maya/tinyhttp?as=in&landing=open&run=reopened`, label: "maya's change: reopened tab", site: "smithers" }
    ]
  }
]
