import type { Route, Screen } from "../../core/router"
import { selectRepo } from "../../repo/fixtures"
import { RepoNotFound } from "../../repo/frame/NotFound"
import { PackageHome, Packages } from "./Packages"

const base = "smithers.sh/Effect-TS/effect"
const screen = (id: string, path: string, label: string, query = "", wait?: number): Screen => {
  const flags = new URLSearchParams("as=in&role=member&net=ok&data=full&landing=open&hosted=up&host=hosted&model=connected")
  for (const [key, value] of new URLSearchParams(query)) flags.set(key, value)
  return { id, route: `${base}/${path}?${flags}`, label, site: "effect", ...(wait ? { wait } : {}) }
}
const select = (owner: string, name: string) => selectRepo(`${owner}/${name}`)
export const routes: Route[] = [
  {
    pattern: "smithers.sh/:owner/:repo/packages", name: "Effect · Packages",
    render: ({ params }) => { select(params.owner, params.repo); return <Packages /> },
    screens: [
      screen("effect-packages-ready", "packages", "All 38 packages"),
      screen("effect-packages-loading", "packages", "Loading packages", "net=slow", 120),
      screen("effect-packages-error", "packages", "Manifest read failed", "net=error"),
      screen("effect-packages-empty", "packages", "No packages", "data=empty"),
      screen("effect-packages-signed-out", "packages", "Browse packages signed out", "as=out"),
      screen("effect-packages-filtered", "packages", "SQL packages", "q=postgresql"),
      screen("effect-packages-no-matches", "packages", "No matching packages", "q=missing-package"),
      screen("effect-packages-open-form", "packages", "Choose a package in Ask", "ask=%2Fpackage.open")
    ]
  },
  {
    pattern: "smithers.sh/:owner/:repo/packages/:slug", name: "Effect · Package home",
    render: ({ params, query }) => { select(params.owner, params.repo); return query.has("check") ? <RepoNotFound /> : <PackageHome slug={params.slug} /> },
    screens: [
      screen("effect-package-home-ready", "packages/sql-pg", "PostgreSQL package"),
      screen("effect-package-home-loading", "packages/sql-pg", "Loading package", "net=slow", 120),
      screen("effect-package-home-error", "packages/sql-pg", "Package read failed", "net=error"),
      screen("effect-package-home-empty", "packages/sql-pg", "Empty package", "data=empty"),
      screen("effect-package-home-signed-out", "packages/sql-pg", "Read package signed out", "as=out"),
      screen("effect-package-home-private", "packages/bundle", "Private workspace tool"),
      screen("effect-package-home-core", "packages/effect", "Core package and dependents"),
      screen("effect-package-home-missing", "packages/missing-package", "Package not found")
    ]
  }
]
