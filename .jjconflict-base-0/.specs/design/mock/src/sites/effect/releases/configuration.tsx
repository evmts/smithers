/* Package scope and content configure the shared repository release view. */
import { useMock } from "../../core/mock"
import { Link, useLocation } from "../../core/router"
import { releases, repo, to } from "../../repo/fixtures"
import { extras } from "../../repo/fixtures/data/Effect-TS__effect"
import { usePackageScope } from "../../repo/frame"
import { Releases } from "../../repo/views/releases/Releases"
import { planRoute } from "./commands"

export const PackageReleases = ({ tag }: { tag?: string }) => {
  const { scope, withScope } = usePackageScope()
  const { flags } = useMock()
  const location = useLocation()
  const items = scope ? extras.packageReleases.filter(item => item.slug === scope.slug).map(item => ({
    tag: item.tag, name: item.version, date: item.date, body: item.body,
    author: releases.find(release => release.tag === item.tag)?.author ?? repo.owner,
    prerelease: true, pulls: []
  })) : releases
  return <Releases tag={tag} configuration={{
    items, title: scope?.name ? `Releases · ${scope.name}` : "Releases",
    emptyTitle: scope?.private ? "Private package" : scope ? `No releases for ${scope.name}` : "No releases yet",
    action: flags.as === "in" && flags.role === "member" && flags.data !== "empty" && extras.releasePlan.changesets.length > 0 ? <Link className="repo-ui-btn" title="/release.preview" to={planRoute(location)}>Version packages ({extras.releasePlan.changesets.length} pending)</Link> : undefined,
    footer: scope?.changelog ? <nav className="repo-releases-subnav" aria-label="Package release sources"><Link to={withScope(to(`blob/${repo.defaultBranch}/${scope.changelog}`))}>Changelog</Link><Link to={to("releases")}>All package releases</Link></nav> : undefined
  }} />
}
