/* Stable registry. Each view family owns its routes.tsx; add family routes there, without editing this file. */
import type { Route } from "../core/router"
import { RepoNotFound } from "./frame/NotFound"
import { RouteRedirect } from "./frame/RouteRedirect"
import { repo, releases as releaseRecords, to } from "./fixtures"
import { selectRepo } from "./fixtures"
import { routes as home } from "./views/code-home/routes"
import { routes as code } from "./views/code/routes"
import { routes as history } from "./views/history/routes"
import { routes as issues } from "./views/issues/routes"
import { routes as pulls } from "./views/pulls/routes"
import { routes as runs } from "./views/runs/routes"
import { routes as flows } from "./views/flows/routes"
import { routes as evals } from "./views/evals/routes"
import { routes as wiki } from "./views/wiki/routes"
import { routes as docs } from "./views/docs/routes"
import { routes as releases } from "./views/releases/routes"
import { routes as settings } from "./views/settings/routes"
import { routes as search } from "./views/search/routes"
import { routes as cards } from "../app/cards/routes"

/*
 * Every repo route renders against its own repo's dataset: the wrapper points the fixture exports at owner/name
 * before the page renders. A repo with no dataset shows Code home's "isn't on Smithers yet" state on every path.
 */
const forRepo = (route: Route): Route => ({
  ...route,
  render: context => {
    const slug = `${context.params.owner}/${context.params.repo}`
    const found = selectRepo(slug)
    const suffix = context.path.replace(`smithers.sh/${slug}`, "").replace(/^\//, "")
    if (found && ((suffix.startsWith("evals") && !repo.config.evals)
      || (suffix.startsWith("docs") && !repo.config.docs)
      || suffix === "settings/ownership")) return <RepoNotFound />
    if (found || route === home[0]) return route.render(context)
    return home[0]!.render(context)
  }
})

const redirects: Route[] = [
  ...[["actions", "runs"], ["labels", "issues"], ["milestones", "issues"], ["releases/latest", "releases/latest"]].map(([from, destination]) => ({
    pattern: `smithers.sh/:owner/:repo/${from}`, name: `Redirect · ${from}`,
    render: ({ query }: import("../core/router").RouteContext) => {
      const latest = releaseRecords.find(item => item.latest) ?? releaseRecords[0]
      const target = destination === "releases/latest" ? latest ? `releases/tag/${encodeURIComponent(latest.tag)}` : "releases" : destination
      return <RouteRedirect target={`${to(target)}${query.size ? `?${query}` : ""}`} />
    },
    screens: [{ id: `repo-redirect-${from.replaceAll("/", "-")}`, route: `smithers.sh/maya/tinyhttp/${from}?as=in&role=member&net=ok&data=full`, label: `Redirect · ${from}` }]
  }))
]
export const repoRoutes: Route[] = [...redirects, ...home, ...code, ...history, ...cards, ...issues, ...pulls, ...runs, ...flows, ...evals, ...wiki, ...docs, ...releases, ...settings, ...search].map(forRepo)
