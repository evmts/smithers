import type { Route, Screen } from "../../core/router"
import { repo, selectRepo } from "../../repo/fixtures"
import { Releases as DefaultReleases } from "../../repo/views/releases/Releases"
import { ReleasePlan } from "./ReleasePlan"
import { PackageReleases } from "./configuration"
import { VersionPull } from "./VersionPull"
import "./commands"

const screen = (id: string, suffix: string, label: string, flags = ""): Screen => {
  const [path, raw] = suffix.split("?")
  const query = new URLSearchParams("as=in&role=member&net=ok&data=full&landing=open&host=hosted&hosted=up&model=connected")
  new URLSearchParams(raw).forEach((value, key) => query.set(key, value))
  new URLSearchParams(flags).forEach((value, key) => query.set(key, value))
  query.set("screen", id)
  return { id: `effect-releases-${id}`, route: `smithers.sh/Effect-TS/effect/${path}?${query}`, label, site: "effect", ...(flags.includes("net=slow") ? { wait: 100 } : {}) }
}
const select = (params: Record<string, string>) => selectRepo(`${params.owner ?? "Effect-TS"}/${params.repo ?? "effect"}`)

export const routes: Route[] = [
  {
    pattern: "smithers.sh/:owner/:repo/releases/plan", name: "Version packages",
    render: ({ params, path, query }) => { select(params); return repo.config.packages ? <ReleasePlan key={`${path}?${query}`} /> : <DefaultReleases /> },
    screens: [
      screen("plan-ready", "releases/plan", "Version packages · pending changesets"),
      screen("plan-preview", "releases/plan?preview=1", "Version packages · computed preview"),
      screen("plan-confirm", "releases/plan?preview=1&act=prepare", "Version packages · confirmation"),
      screen("plan-existing-pr", "releases/plan?existing=1", "Version packages · existing PR"),
      screen("plan-stale", "releases/plan?stale=1", "Version packages · main moved"),
      screen("plan-running", "releases/plan?preparing=1", "Version packages · preparation running"),
      screen("plan-failed", "releases/plan?failed=1", "Version packages · preparation failed"),
      screen("plan-empty", "releases/plan", "Version packages · no changesets", "data=empty"),
      screen("plan-held", "releases/plan?preview=1", "Version packages · local command", "landing=install"),
      screen("plan-signed-out", "releases/plan?preview=1&act=prepare", "Version packages · sign in to prepare", "as=out"),
      screen("plan-denied", "releases/plan?preview=1&act=prepare", "Version packages · membership required", "role=reader"),
      screen("plan-scoped", "releases/plan?preview=1&package=sql-pg", "Version packages · scope keeps the complete impact"),
      screen("plan-loading", "releases/plan", "Version packages · loading", "net=slow"),
      screen("plan-error", "releases/plan", "Version packages · read failed", "net=error")
    ]
  },
  {
    pattern: "smithers.sh/:owner/:repo/releases", name: "Releases · package notes",
    render: ({ params }) => { select(params); return repo.config.packages ? <PackageReleases /> : <DefaultReleases /> },
    screens: [
      screen("sql-pg", "releases?package=sql-pg", "Releases · PostgreSQL changelog"),
      screen("unscoped", "releases", "Releases · shared notes"),
      screen("private", "releases?package=ai-codegen", "Releases · private tools excluded"),
      screen("empty", "releases?package=sql-pg", "Releases · empty", "data=empty"),
      screen("signed-out", "releases?package=sql-pg", "Releases · public notes", "as=out"),
      screen("reader", "releases?package=sql-pg", "Releases · reader", "role=reader"),
      screen("loading", "releases?package=sql-pg", "Releases · loading", "net=slow"),
      screen("error", "releases?package=sql-pg", "Releases · read failed", "net=error")
    ]
  },
  {
    pattern: "smithers.sh/:owner/:repo/releases/tag/:tag", name: "Release · package notes",
    render: ({ params }) => { select(params); return repo.config.packages ? <PackageReleases tag={params.tag} /> : <DefaultReleases tag={params.tag} /> },
    screens: [screen("sql-pg-tag", "releases/tag/4.0.0-rc.118?package=sql-pg", "Release · PostgreSQL notes")]
  },
  ...(["conversation", "commits", "checks", "files"] as const).map(tab => ({
    pattern: `smithers.sh/Effect-TS/effect/pull/111${tab === "conversation" ? "" : `/${tab}`}`,
    name: `Version PR · ${tab}`,
    render: () => { selectRepo("Effect-TS/effect"); return <VersionPull tab={tab} /> },
    screens: [screen(`version-pr-${tab}`, `pull/111${tab === "conversation" ? "" : `/${tab}`}`, `Version PR · ${tab}`)]
  }))
]
