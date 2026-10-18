/* Repository-declared Effect views share one registration and fall back to the default UI for other repos. */
import { matchPattern, type Route } from "../core/router"
import { selectRepo } from "../repo/fixtures"
import { RepoNotFound } from "../repo/frame/NotFound"
import { repoRoutes } from "../repo/routes"
import { routes as scope } from "./scope/routes"
import { routes as ci } from "./ci/routes"
import { routes as releases } from "./releases/routes"
import { routes as docs } from "./docs/routes"


export const effectRoutes: Route[] = [...scope, ...ci, ...releases, ...docs].map(route => ({
  ...route,
  render: context => {
    const slug = `${context.params.owner ?? "Effect-TS"}/${context.params.repo ?? "effect"}`
    selectRepo(slug)
    if (slug === "Effect-TS/effect") return route.render(context)
    const fallback = repoRoutes.find(candidate => matchPattern(candidate.pattern, context.path) !== null)
    if (!fallback) return <RepoNotFound />
    return fallback.render({ ...context, params: matchPattern(fallback.pattern, context.path) ?? context.params })
  }
}))
