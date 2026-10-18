import { createElement, useEffect, useRef, type ReactNode } from "react"
import { useMock } from "../../../core/mock"
import { Link, navigate, useLocation } from "../../../core/router"
import { doc, docs, file, repo, to } from "../../fixtures"
import type { DocPage } from "../../fixtures/types"
import { Empty, Failed, Loading, registerSlash, useRepoFrame, useView } from "../../frame"
import { ViewFrame as RepoFrame } from "../checklist/ViewFrame"
import { CopyButton, Markdown } from "../../ui"
import { docSource, documentBlocks, type DocBlock } from "./document"
import { DocsCode } from "../hovers"

const docsRoute = (slug: string, section?: string) => {
  const query = new URLSearchParams(window.location.hash.split("?")[1])
  query.delete("section")
  if (section) query.set("section", section)
  return `${to(`docs/${slug}`)}${query.size ? `?${query}` : ""}`
}

export type DocsConfiguration = {
  pages: DocPage[]
  index?: ReactNode
  navigationHeader?: ReactNode
  beforeBody?: (page: DocPage) => ReactNode
  source?: (page: DocPage) => string | undefined
  prepare?: (page: DocPage) => string
  empty?: boolean
  emptyTitle?: string
}

const DocsNav = ({ active, empty = false, configuration }: { active: string; empty?: boolean; configuration?: DocsConfiguration }) => {
  const pages = configuration?.pages ?? docs
  const sections = empty ? [] : [...new Set(pages.map(page => page.section))]
  return (
    <nav className="repo-docs-nav" aria-label="Documentation">
      <Link className="repo-docs-nav-title" to={to("docs")} aria-label={repo.config.docs?.title ?? "Docs"}>{repo.config.docs?.title ?? "Docs"}</Link>
      {configuration?.navigationHeader}
      {sections.map(section => (
        <section key={section}>
          <h2>{section}</h2>
          {pages.filter(page => page.section === section).map(page => (
            <Link key={page.slug} to={docsRoute(page.slug)} aria-label={page.title} aria-current={page.slug === active ? "page" : undefined}>
              {page.title}
            </Link>
          ))}
        </section>
      ))}
    </nav>
  )
}

type Heading = Extract<DocBlock, { kind: "heading" }>

const DocsHeading = ({ heading, slug }: { heading: Heading; slug: string }) => createElement(
  `h${heading.level}`,
  { id: `repo-docs-${heading.id}`, className: "repo-docs-heading", tabIndex: -1 },
  heading.text,
  <Link
    key="anchor"
    className="repo-docs-permalink"
    to={docsRoute(slug, heading.id)}
    aria-label={`Link to ${heading.text}`}
  >
    #
  </Link>
)

const DocsOutline = ({ headings, slug }: { headings: Heading[]; slug: string }) => {
  const subsections = headings.filter(heading => heading.level > 1)
  const outline = subsections.length ? subsections : headings
  if (!outline.length) return null
  return (
    <nav className="repo-docs-outline" aria-label="On this page">
      <h2>On this page</h2>
      {outline.map(heading => (
        <Link key={heading.id} to={docsRoute(slug, heading.id)} aria-label={heading.text} data-depth={heading.level}>
          {heading.text}
        </Link>
      ))}
    </nav>
  )
}

const DocsMarkdown = ({ source, page }: { source: string; page: DocPage }) => {
  const parent = page.slug.includes("/") ? page.slug.slice(0, page.slug.lastIndexOf("/")) : ""
  // Route hashes belong to the router; section links therefore carry a query anchor.
  const linked = source.replace(/\]\(#\/?(?=smithers\.sh\/)/g, "](")
    .replace(/\[([^\]]+)\]\(#([^)]+)\)/g,
    (_, label: string, anchor: string) => `[${label}](${docsRoute(page.slug, anchor)})`)
  return <Markdown source={linked} base={`docs${parent ? `/${parent}` : ""}`} />
}

export const DocsLoading = () => <Loading variant="detail" rows={8} />
export const DocsError = () => <Failed what="documentation" reason="The repository host didn't return the docs page." />
export const DocsEmpty = () => <Empty title="No docs yet" />
export const DocsNotFound = ({ path }: { path: string }) => <Empty title={`No docs page at ${path}`} />

export const DocsReady = ({ page, configuration }: { page: DocPage; configuration?: DocsConfiguration }) => {
  const { openAsk } = useRepoFrame()
  const article = useRef<HTMLElement>(null)
  const location = useLocation()
  const query = new URLSearchParams(location.split("?")[1])
  const anchor = query.get("section")
  const blocks = documentBlocks(configuration?.prepare?.(page) ?? page.body)
  const headings = blocks.filter((block): block is Heading => block.kind === "heading")
  const source = configuration?.source?.(page) ?? docSource(page)
  const pages = configuration?.pages ?? docs
  const position = pages.findIndex(item => item.slug === page.slug)
  const previous = pages[position - 1]
  const next = pages[position + 1]
  useEffect(() => {
    if (!anchor) return
    const target = article.current?.querySelector<HTMLElement>(`[id="repo-docs-${CSS.escape(anchor)}"]`)
    const frame = requestAnimationFrame(() => {
      target?.scrollIntoView({ block: "start", behavior: "instant" })
      target?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [anchor, page.slug])
  return (
    <>
      <article className="repo-docs-article" ref={article}>
        <header className="repo-docs-page-header">
          <span className="repo-docs-section">{page.section}</span>
          <button
            className="repo-ui-btn repo-ui-btn-primary"
            title={`/ask Explain ${page.title} in ${repo.slug}`}
            onClick={() => openAsk(`Explain ${page.title} in ${repo.slug}`)}
          >
            Ask about this page
          </button>
        </header>
        {repo.slug === "smithers-canary/smithers" && page.slug === "index" && <p className="repo-docs-scope">For CLI-generated coding flows: if the run is killed mid-way, smthrs runs resume continues it where it stopped.</p>}
        {repo.slug === "effeck/effeck" && <aside className="repo-docs-warning">VibeLang is v0. The language will change in major, breaking ways. It is not suitable for production.</aside>}
        {configuration?.beforeBody?.(page)}
        {!headings.some(heading => heading.level === 1) && <h1>{page.title}</h1>}
        {blocks.map((block, i) => block.kind === "heading" ? (
          <DocsHeading key={block.id} heading={block} slug={page.slug} />
        ) : block.kind === "code" ? (
          <div className="repo-docs-code" key={i}>
            <div className="repo-docs-code-toolbar">
              <span>{block.lang === "vibe" ? "VibeLang" : block.lang}</span>
              <CopyButton text={block.text} label="Copy code" small />
            </div>
            <DocsCode code={block.text} />
          </div>
        ) : (
          <DocsMarkdown key={i} source={block.text} page={page} />
        ))}
        {source && (
          <Link className="repo-docs-edit" to={to(`blob/${encodeURIComponent(repo.defaultBranch)}/${source}`)}>
            Edit this page
          </Link>
        )}
        <nav className="repo-docs-pagination" aria-label="Documentation pages">
          {previous ? (
            <Link to={docsRoute(previous.slug)}>
              <span>Previous</span>
              <strong>← {previous.title}</strong>
            </Link>
          ) : <span />}
          {next ? (
            <Link to={docsRoute(next.slug)}>
              <span>Next</span>
              <strong>{next.title} →</strong>
            </Link>
          ) : <span />}
        </nav>
      </article>
      <DocsOutline headings={headings} slug={page.slug} />
    </>
  )
}

export const DocsSignedOut = DocsReady
export const DocsReader = DocsReady

const DocsContent = ({ path, configuration }: { path: string; configuration?: DocsConfiguration }) => {
  const { flags } = useMock()
  const state = useView(`docs:${repo.slug}:${path}`)
  const pages = configuration?.pages ?? docs
  const first = pages[0]
  const slug = path || (configuration?.index ? "" : first?.slug) || ""
  const page = configuration?.pages ? pages.find(page => page.slug === slug) : doc(slug)
  const empty = state === "empty" || configuration?.empty || (!first && !configuration?.index) || !repo.config.docs
  const Ready = flags.as === "out" ? DocsSignedOut : flags.role === "reader" ? DocsReader : DocsReady
  useEffect(() => registerSlash("docs.open", {
    purpose: "Open a docs page",
    fields: [{ name: "path", label: "Docs page", required: false }],
    access: "public",
    confirm: false,
    run: ({ path: value }, { closeAsk }) => {
      navigate(value ? docsRoute(value) : to("docs"))
      closeAsk()
    }
  }), [repo.slug])
  return (
    <div className="repo-docs-layout">
      <div className="repo-docs-desktop-nav"><DocsNav active={slug} empty={empty} configuration={configuration} /></div>
      <details className="repo-docs-pages"><summary>Pages</summary><DocsNav active={slug} empty={empty} configuration={configuration} /></details>
      {state === "loading" ? <div className="repo-docs-main-state"><DocsLoading /></div>
        : state === "error" ? <div className="repo-docs-main-state"><DocsError /></div>
        : empty ? <div className="repo-docs-main-state"><Empty title={configuration?.emptyTitle ?? "No docs yet"} /></div>
        : !path && configuration?.index ? <div className="repo-docs-main-state">{configuration.index}</div>
        : !page ? <div className="repo-docs-main-state"><DocsNotFound path={path} /></div>
        : <Ready key={slug} page={page} configuration={configuration} />}
    </div>
  )
}

export const Docs = ({ path = "", configuration }: { path?: string; configuration?: DocsConfiguration }) => {
  const page = doc(path || docs[0]?.slug || "")
  const title = page?.title ?? "Docs"
  const source = page ? configuration?.source?.(page) ?? docSource(page) : undefined
  const contextPath = source ? file(source)?.path ?? source : `docs/${path || docs[0]?.slug || ""}`
  return (
    <RepoFrame tab="docs" title={`${title} · ${repo.slug}`} askView="docs" askContext={`${repo.slug} · ${contextPath}`}>
      <DocsContent path={path} configuration={configuration} />
    </RepoFrame>
  )
}
