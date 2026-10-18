/* Package scope is URL state. Direct source paths take precedence over a stale query. */
import { useEffect, useRef, useState } from "react"
import { Link, navigate, useLocation } from "../../core/router"
import { repo, to } from "../fixtures"
import type { PackageInfo } from "../fixtures/types"
import { BranchPicker, Icon } from "../ui"
import { registerSlash } from "./slash"

export const packageSlug = (pkg: PackageInfo) => pkg.slug ?? pkg.name.replace(/^@/, "").replace(/\//g, "-")
export const packageFamilies = [["", "Core"], ["ai", "AI"], ["atom", "Atom"], ["platform", "Platform"], ["sql", "SQL"], ["tools", "Tools"]] as const

export const scopeFromLocation = (location: string, packages: PackageInfo[]): PackageInfo | null => {
  const [path, raw] = location.split("?")
  const source = path.match(/\/(?:tree|blob|blame|commits)\/[^/]+\/(.+)$/)?.[1]
  if (source) {
    const decoded = source.split("/").map(value => decodeURIComponent(value)).join("/")
    const inferred = packages.filter(pkg => decoded === pkg.path || decoded.startsWith(`${pkg.path}/`))
      .sort((a, b) => b.path.length - a.path.length)[0]
    if (inferred) return inferred
  }
  const home = path.match(/\/packages\/([^/]+)$/)?.[1]
  const slug = home ? decodeURIComponent(home) : new URLSearchParams(raw).get("package")
  return packages.find(pkg => packageSlug(pkg) === slug) ?? null
}

export const scopedRoute = (route: string, scope: PackageInfo | null): string => {
  const [path, raw] = route.split("?")
  const query = new URLSearchParams(raw)
  if (scope) query.set("package", packageSlug(scope))
  else query.delete("package")
  return `${path}${query.size ? `?${query}` : ""}`
}

export const scopeDestination = (location: string, slug: string | null, packages: PackageInfo[]): string => {
  const [path, raw] = location.split("?")
  const parts = path.split("/")
  const base = parts.slice(0, 3).join("/")
  const section = parts[3] ?? ""
  const query = new URLSearchParams(raw)
  const scope = packages.find(pkg => packageSlug(pkg) === slug) ?? null
  for (const field of ["L", "act", "check", "ask", "raw", "view"]) query.delete(field)
  let next = path
  if (["", "tree", "blob", "blame", "packages"].includes(section)) {
    const ref = ["tree", "blob", "blame"].includes(section) ? parts[4] : query.get("ref")
    if (ref) query.set("ref", decodeURIComponent(ref))
    next = scope ? `${base}/packages/${packageSlug(scope)}` : (ref ? `${base}/tree/${encodeURIComponent(decodeURIComponent(ref))}` : base)
  } else if (["issues", "pull", "pulls", "runs", "flows", "commit", "commits", "releases"].includes(section)) {
    next = `${base}/${section === "pull" ? "pulls" : section === "commit" ? "commits/main" : section === "commits" ? `commits/${parts[4] ?? "main"}` : section}`
  } else if (section === "docs") next = scope ? `${base}/docs/${packageSlug(scope)}` : `${base}/docs`
  return scopedRoute(`${next}${query.size ? `?${query}` : ""}`, scope)
}

export const usePackageScope = () => {
  const location = useLocation()
  const packages = repo.config.packages ?? []
  const scope = scopeFromLocation(location, packages)
  return {
    scope,
    setScope: (slug: string | null) => navigate(scopeDestination(location, slug, packages)),
    withScope: (route: string) => scopedRoute(route, scope)
  }
}

export const PackageScopePicker = () => {
  const location = useLocation()
  const { scope, setScope, withScope } = usePackageScope()
  const [filter, setFilter] = useState("")
  const picker = useRef<HTMLDetailsElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const packages = repo.config.packages ?? []
  useEffect(() => {
    setFilter("")
    picker.current?.removeAttribute("open")
  }, [location])
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!picker.current?.contains(event.target as Node)) picker.current?.removeAttribute("open")
    }
    window.addEventListener("pointerdown", close)
    return () => window.removeEventListener("pointerdown", close)
  }, [])
  useEffect(() => {
    const cleanup = registerSlash("package.scope", {
      purpose: "Choose a package", access: "public", confirm: false,
      fields: [{ name: "package", label: "Package", options: ["all", ...packages.map(pkg => pkg.name)] }],
      run: (values, context) => {
        const pkg = packages.find(value => value.name === values.package || packageSlug(value) === values.package)
        context.closeAsk()
        navigate(scopeDestination(context.location, pkg ? packageSlug(pkg) : null, packages))
      }
    })
    const open = registerSlash("package.open", {
      purpose: "Open package", access: "public", confirm: false,
      fields: [{ name: "package", label: "Package", options: packages.map(pkg => pkg.name) }],
      run: (values, context) => {
        const pkg = packages.find(value => value.name === values.package || packageSlug(value) === values.package)
        if (!pkg) return
        context.closeAsk()
        navigate(scopedRoute(to(`packages/${packageSlug(pkg)}`), pkg))
      }
    })
    return () => { cleanup(); open() }
  }, [repo.slug])
  const choose = (slug: string | null) => {
    picker.current?.removeAttribute("open")
    picker.current?.querySelector("summary")?.focus()
    if (slug !== (scope ? packageSlug(scope) : null)) setScope(slug)
  }
  const matches = packages.filter(pkg => `${pkg.name} ${pkg.path} ${pkg.description}`.toLowerCase().includes(filter.toLowerCase()))
  return <details className="effect-scope-picker" ref={picker}
    onToggle={event => { if (event.currentTarget.open) input.current?.focus() }}
    onKeyDown={event => { if (event.key === "Escape") { picker.current?.removeAttribute("open"); picker.current?.querySelector("summary")?.focus() } }}>
    <summary className="repo-ui-btn" title="/package.scope"><Icon name="folder" /><span>{scope?.name ?? "All packages"}</span><Icon name="chevron-down" size={13} /></summary>
    <div className="effect-scope-menu">
      <label className="repo-ui-sr" htmlFor="effect-package-filter">Find a package</label>
      <input ref={input} id="effect-package-filter" className="repo-ui-input" placeholder="Find a package…" value={filter} onChange={event => setFilter(event.target.value)} />
      <div className="effect-scope-options">
        <button title="/package.scope all" aria-pressed={!scope} onClick={() => choose(null)}><span>All packages</span>{!scope && <Icon name="check" size={14} />}</button>
        {packageFamilies.map(([family, label]) => {
          const members = matches.filter(pkg => (pkg.family ?? "") === family)
          return members.length ? <section key={family} aria-label={label}><h3>{label}</h3>{members.map(pkg => <button key={pkg.path} title={`/package.scope ${pkg.name}`} aria-pressed={pkg.name === scope?.name} onClick={() => choose(packageSlug(pkg))}><span>{pkg.name}</span>{pkg.name === scope?.name && <Icon name="check" size={14} />}</button>)}</section> : null
        })}
        {!matches.length && <p>No matching packages.</p>}
      </div>
      <Link to={withScope(to("packages"))}>Browse packages <Icon name="chevron" size={12} /></Link>
    </div>
  </details>
}

/** Monorepo-only branch/package controls; ordinary repositories keep their view-owned branch picker. */
export const PackageScopeControls = () => {
  const location = useLocation()
  const { withScope } = usePackageScope()
  const [path, raw] = location.split("?")
  const match = path.match(/\/(?:tree|blob|blame|commits)\/([^/]+)/)
  const currentRef = match ? decodeURIComponent(match[1]) : new URLSearchParams(raw).get("ref") ?? repo.defaultBranch
  const changeBranch = (ref: string) => {
    const query = new URLSearchParams(raw)
    query.set("ref", ref)
    const base = to()
    const next = match ? path.replace(/\/(tree|blob|blame|commits)\/[^/]+/, `/$1/${encodeURIComponent(ref)}`)
      : path === base ? `${base}/tree/${encodeURIComponent(ref)}` : path
    navigate(withScope(`${next}?${query}`))
  }
  return <div className="effect-scope-controls"><BranchPicker currentRef={currentRef} onChange={changeBranch} /><PackageScopePicker /></div>
}
