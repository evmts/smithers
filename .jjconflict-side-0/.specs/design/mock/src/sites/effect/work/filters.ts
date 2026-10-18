import { issues, pulls, repo, runs } from "../../repo/fixtures"
import { extras } from "../../repo/fixtures/data/Effect-TS__effect"
import type { Issue, PackageInfo, Pull, Run } from "../../repo/fixtures/types"

export type PackageScope = PackageInfo | string | null | undefined

/** Scope filters discovery only. Missing associations and shared inputs stay visible. */
const includes = (scope: PackageScope, kind: "issue" | "pull" | "run", ref: string) => {
  if (!scope || repo.slug !== "Effect-TS/effect") return true
  const pkg = typeof scope === "string"
    ? repo.config.packages?.find(value => value.slug === scope || value.name === scope)
    : scope
  if (!pkg) return true
  const relations = extras.relations.filter(value => value.kind === kind && value.ref === ref)
  return !relations.length || relations.some(value => value.basis === "shared-input"
    || !value.packages.length || value.packages.includes(pkg.name))
}

/** Pass local records as the optional second argument to retain in-mock edits and launches. */
export const issuesFor = (scope: PackageScope, records: Issue[] = issues): Issue[] =>
  records.filter(value => includes(scope, "issue", String(value.n)))
export const pullsFor = (scope: PackageScope, records: Pull[] = pulls): Pull[] =>
  records.filter(value => includes(scope, "pull", String(value.n)))
export const runsFor = (scope: PackageScope, records: Run[] = runs): Run[] =>
  records.filter(value => includes(scope, "run", value.id))
