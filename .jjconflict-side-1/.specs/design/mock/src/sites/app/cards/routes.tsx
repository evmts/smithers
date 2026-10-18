import { useEffect } from "react"
import type { Route, RouteContext, Screen } from "../../core/router"
import { navigate } from "../../core/router"
import { RepoFrame, registerSlash } from "../../repo/frame"
import { repo as fixtureRepo, selectRepo } from "../../repo/fixtures"
import { allIssues, createIssue } from "../../repo/views/issues/model"
import { BugCard, SAMPLE_BUG_DRAFT, bugContext } from "../cards"


registerSlash("bug", {
  purpose: "Report a bug", access: "public", confirm: false,
  fields: [{ name: "title", label: "Title", required: false }, { name: "body", label: "Body", type: "textarea", required: false }],
  run: (values, context) => {
    const base = context.location.split("?")[0].split("/").slice(0, 3).join("/")
    context.closeAsk()
    navigate(`${base}/bug?${new URLSearchParams({ title: values.title ?? "", body: values.body ?? "", from: context.location })}`)
  }
})

const BugView = ({ context, sent = false }: { context: RouteContext; sent?: boolean }) => {
  const slug = `${context.params.owner}/${context.params.repo}`
  const repo = selectRepo(slug) ? fixtureRepo : undefined
  useEffect(() => {
    if (!repo) return
    if (!sent) return
    let number = context.params.n
    // Product-site entries map bug/sent/:n to any number plus ?receipt=sample.
    if (context.query.get("receipt") === "sample") {
      const issue = allIssues().find(issue => issue.author === "maya" && issue.state === "open" && issue.title === SAMPLE_BUG_DRAFT.title)
        ?? createIssue(SAMPLE_BUG_DRAFT.title, `${SAMPLE_BUG_DRAFT.body}\n\n${bugContext(context.query.get("from")).map(chip => `- ${chip}`).join("\n")}`, ["bug"], [])
      number = String(issue.n)
    }
    navigate(`smithers.sh/${slug}/issues/${number}?${context.query}`, { replace: true })
  }, [sent, slug, context.params.n, context.query.toString()])
  if (sent && repo) return null
  return <RepoFrame tab="issues" title={sent ? `Report #${context.params.n}` : "Report a bug"} askView="issues" askContext={`Bug report in ${slug}`}>
    <div className="app-card-view">
      {repo ? <BugCard key={`${slug}:${context.query.get("from")}:${context.query.get("title")}:${context.query.get("body")}`} repo={repo} onPublish={(title, body) => createIssue(title, body, ["bug"], []).n} from={context.query.get("from")} onClose={() => navigate(`smithers.sh/${slug}/issues`)}/> : <p>This repo is unavailable.</p>}
    </div>
  </RepoFrame>
}
const repos = ["maya/tinyhttp", "smithers-canary/smithers", "effeck/effeck"]
const screens = (sent = false): Screen[] => repos.flatMap(slug => (sent ? [["sent", "as=in&receipt=sample&bugpublish=app"]] : [
  ["signed-out", "as=out&guest=off"], ["signed-in", "as=in"], ["restored", "as=in&draft=restored"], ...(slug === "effeck/effeck" ? [["conversion", "as=out&guest=off&from=conversion&converter=on"]] : [])
]).map(([state, query]) => ({ id: `app-card-bug-${slug.replaceAll("/", "-")}-${state}`, route: `smithers.sh/${slug}/bug${sent ? "/sent/sample" : ""}?${query}&net=ok&data=full&landing=install`, label: `${slug} · Bug · ${state}${sent ? " (in-app, flag)" : ""}` })))
export const routes: Route[] = [
  { pattern: "smithers.sh/:owner/:repo/bug", name: "S#9 Report a bug · PM #37–40", render: context => <BugView context={context}/>, screens: [...screens(), ...["signed-out", "signed-in"].map(state => ({ id: `app-card-bug-effect-ts-effect-${state}`, route: `smithers.sh/Effect-TS/effect/bug?as=${state === "signed-out" ? "out" : "in"}&guest=off&net=ok&data=full&landing=install`, label: `Effect-TS/effect · Bug · ${state}` }))] },
  { pattern: "smithers.sh/:owner/:repo/bug/sent/:n", name: "S#9 Published bug · PM #39", render: context => <BugView context={context} sent/>, screens: screens(true) }
]
