import type { Route, RouteContext, Screen } from "../../core/router"
import { repo, selectRepo } from "../../repo/fixtures"
import { Docs } from "../../repo/views/docs/Docs"
import { RepoNotFound } from "../../repo/frame/NotFound"
import { PackageDocs } from "./configuration"

const screen = (id: string, suffix: string, label: string, flags = ""): Screen => {
  const [path, raw] = suffix.split("?")
  const query = new URLSearchParams("as=in&role=member&landing=open&host=hosted&net=ok&data=full&model=connected")
  for (const [key, value] of new URLSearchParams(raw)) query.set(key, value)
  for (const [key, value] of new URLSearchParams(flags)) query.set(key, value)
  return { id: `effect-docs-${id}`, route: `smithers.sh/Effect-TS/effect/${path}?${query}`, label, site: "effect", ...(flags.includes("net=slow") ? { wait: 100 } : {}) }
}
const render = ({ params, query }: RouteContext) => {
  if (query.get("act") === "generate" || query.has("generation")) return <RepoNotFound />
  const found = selectRepo(`${params.owner}/${params.repo}`)
  const path = params["*"] ?? ""
  return found && repo.config.packages ? <PackageDocs path={path} /> : <Docs path={path} />
}

export const routes: Route[] = [
  { pattern: "smithers.sh/:owner/:repo/docs", name: "Package documentation", render, screens: [
    screen("packages-index", "docs", "Docs · all packages"),
    screen("index-scoped", "docs?package=sql-pg", "Docs · PostgreSQL package"),
    screen("loading", "docs", "Docs · loading", "net=slow"),
    screen("error", "docs", "Docs · error", "net=error"),
    screen("empty", "docs", "Docs · empty", "data=empty"),
    screen("signed-out", "docs", "Docs · public reading", "as=out"),
    screen("reader", "docs", "Docs · reader", "role=reader")
  ] },
  { pattern: "smithers.sh/:owner/:repo/docs/*", name: "Package document", render, screens: [
    screen("sql-pg", "docs/sql-pg?package=sql-pg", "Docs · PostgreSQL README"),
    screen("api", "docs/sql-pg/PgClient?package=sql-pg", "Docs · PgClient API"),
    screen("stale", "docs/sql-pg/PgConnection?package=sql-pg", "Docs · source changed since generation"),
    screen("missing", "docs/sql-pg/no-such-page?package=sql-pg", "Docs · missing page"),
    screen("no-package-docs", "docs/ai-codegen?package=ai-codegen", "Docs · package without docs"),
    screen("page-loading", "docs/sql-pg?package=sql-pg", "Docs · page loading", "net=slow"),
    screen("page-error", "docs/sql-pg?package=sql-pg", "Docs · page error", "net=error"),
    screen("page-empty", "docs/sql-pg?package=sql-pg", "Docs · package empty", "data=empty")
  ] }
]
