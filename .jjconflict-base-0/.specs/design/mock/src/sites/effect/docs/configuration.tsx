/* Package documentation is scope and content configuration of the shared Docs view. */
import { useEffect, useState } from "react"
import { Link, navigate, useLocation } from "../../core/router"
import { docs, repo, to } from "../../repo/fixtures"
import type { PackageInfo } from "../../repo/fixtures/types"
import { Empty, registerSlash } from "../../repo/frame"
import { Icon } from "../../repo/ui"
import { Docs } from "../../repo/views/docs/Docs"
import { packageForPage, pagesFor, slugFor, sourceFor } from "./model"
import scenario from "./scenarios.json"
const docURL = (path: string, location: string, scope?: PackageInfo | null, extra: Record<string, string | null> = {}) => {
  const query = new URLSearchParams(location.split("?")[1])
  for (const key of ["generation", "act", "section", "stale"]) query.delete(key)
  if (scope) query.set("package", slugFor(scope))
  else query.delete("package")
  for (const [key, value] of Object.entries(extra)) { if (value === null) query.delete(key); else query.set(key, value) }
  return `${to(`docs${path ? `/${path}` : ""}`)}${query.size ? `?${query}` : ""}`
}
const refFor = (location: string) => new URLSearchParams(location.split("?")[1]).get("ref") ?? repo.defaultBranch

export const DocsStale = ({ source }: { source?: string }) => <div className="effect-docs-stale" role="status"><Icon name="clock" size={14} /><span>Generated from JSDoc in run <Link to={to(`runs/${scenario.generated.run}`)}>{scenario.generated.label}</Link> · source changed since</span>{source && <Link to={to(`blob/${repo.defaultBranch}/${source}`)}>View source →</Link>}</div>

export const DocsIndexReady = ({ pkg, search }: { pkg?: PackageInfo | null; search: string }) => {
  const location = useLocation()
  const packages = (pkg ? [pkg] : repo.config.packages ?? []).filter(value => `${value.name} ${value.description}`.toLowerCase().includes(search.toLowerCase()))
  const groups = [["", "Core"], ["ai", "AI"], ["atom", "Atom"], ["platform", "Platform"], ["sql", "SQL"], ["tools", "Tools"]]
  return <div className="effect-docs-index">{!packages.length && <Empty title="No matching package docs" />}{groups.map(([family, label]) => {
    const members = packages.filter(value => (value.family ?? "") === family)
    return members.length ? <section className="effect-docs-package-group" key={family}><h2>{label}</h2><div className="effect-docs-package-list">{members.map(value => {
      const pages = pagesFor(value)
      return <div className="effect-docs-package-row" key={value.path}><div><Link className="effect-docs-package-name" to={docURL(slugFor(value), location, value)}>{value.name}<Icon name="chevron" size={13} /></Link><p>{value.description}</p></div><div className="effect-docs-page-links">{pages.length ? pages.map(page => <Link key={page.slug} to={docURL(page.slug, location, value)}>{page.section === "Packages" ? "README" : page.title}</Link>) : <span>No docs</span>}</div></div>
    })}</div></section> : null
  })}{!pkg && !search && <section className="effect-docs-package-group"><h2>Guides</h2><div className="effect-docs-guide-list">{docs.filter(page => page.section === "Guides").map(page => <Link key={page.slug} to={docURL(page.slug, location, null)}>{page.title}<Icon name="chevron" size={13} /></Link>)}</div></section>}</div>
}


export const PackageDocs = ({ path = "" }: { path?: string }) => {
  const location = useLocation()
  const query = new URLSearchParams(location.split("?")[1])
  const pkg = packageForPage(path) ?? repo.config.packages?.find(value => slugFor(value) === query.get("package"))
  const pages = pkg ? pagesFor(pkg) : docs
  const [search, setSearch] = useState("")
  useEffect(() => registerSlash("docs.package", { purpose: "Choose documentation package", confirm: false, access: "public", fields: [{ name: "package", label: "Package", options: ["all", ...(repo.config.packages?.flatMap(value => [value.name, slugFor(value)]) ?? [])] }], run: ({ package: name }, context) => { const selected = repo.config.packages?.find(value => value.name === name || slugFor(value) === name); context.closeAsk(); navigate(docURL(selected ? slugFor(selected) : "", context.location, selected)) } }), [repo.slug])
  return <Docs path={path} configuration={{
    pages,
    empty: Boolean(pkg && !pages.length), emptyTitle: pkg ? `No docs for ${pkg.name}` : "No package docs",
    index: <><label className="effect-docs-search"><Icon name="search" size={15} /><span className="repo-ui-sr">Find package documentation</span><input className="repo-ui-input" placeholder="Find package documentation…" value={search} onChange={event => setSearch(event.target.value)} /></label><DocsIndexReady pkg={pkg} search={search} /></>,
    source: page => sourceFor(page, pkg),
    prepare: page => page.body.replace(/\]\((?!https?:|mailto:|#|smithers\.sh)([^)]+)\)/g, (_, href: string) => {
      const source = sourceFor(page, pkg)
      const parent = source?.slice(0, source.lastIndexOf("/")) ?? ""
      const parts: string[] = []
      for (const part of `${parent}/${href}`.split("/")) { if (part === "..") parts.pop(); else if (part && part !== ".") parts.push(part) }
      return `](${to(`blob/${encodeURIComponent(refFor(location))}/${parts.join("/")}`)})`
    }),
    beforeBody: page => {
      const source = sourceFor(page, pkg)
      const generated = page.section === "API" && pkg?.slug === "sql-pg"
      const stale = page.slug === scenario.generated.stalePage || query.get("stale") === "1"
      return <>{stale && <DocsStale source={source} />}{source && <div className="effect-docs-source"><Link to={to(`blob/${encodeURIComponent(generated ? scenario.generated.sourceRef : refFor(location))}/${source}`)}>{source} →</Link>{generated && !stale && <span>Generated from JSDoc · <Link to={to(`runs/${scenario.generated.run}`)}>{scenario.generated.label}</Link></span>}</div>}</>
    }
  }} />
}
