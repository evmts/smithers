/*
 * smithers.sh front pages: the signed-out landing (PM S#1), the signed-in launcher (S#3, S#4), the GitHub
 * sign-in step (S#2's door), and the docs (S#5).
 */
import { useEffect, useRef, useState, type FormEvent } from "react"
import { EXTERNAL, importedRepos, MAYA, signInRoute, SMITHERS_REPO } from "../core/catalog"
import { still, useMock, useRead } from "../core/mock"
import { Link, navigate, type RouteContext } from "../core/router"
import { WORDMARK } from "../core/wordmark"
import { Markdown, sectionsOf, type ResolveLink } from "./markdown"
import { SMITHERS_DOCS, type SmithersDocPage } from "./smithers-content"
import { CommandRow, IconChevron, IconCopy } from "./ui"

const CODING_GUIDE = "https://github.com/smithersai/smithers/blob/main/packages/smithers/docs/guides/change-code.md"

const SUBHEAD_OPEN = "Paste a GitHub repository you own. Ask for a change; Smithers runs Claude Code or Codex on your own subscription. You review the diff and land it yourself. Open source, MIT."
const SUBHEAD_FROM_EFFECK = "VibeLang's source lives on Smithers."
const INSTALL_COMMAND = "npm i -g smthrs@next"

/* The landing's copy, word for word from apps/site/src/data/landingCopy.ts (#4315, live on smithers.sh). */
const LANDING = {
  headline: "Smithers is a codebase maintainer agent.",
  tagline: "Automate any git repo as a coding factory.",
  runLabel: "Try it in any git repo",
  runnerLabel: "Package runner",
  commands: { npx: "npx smthrs@next generate flow coding", bunx: "bunx smthrs@next generate flow coding" },
  docs: "smithers.sh/docs",
  source: "https://github.com/smithersai/smithers"
}

/* ---------- shared chrome ---------- */

const Wordmark = ({ size }: { size: "hero" | "mini" }) => (
  <pre className={size === "hero" ? "front-word" : "front-word-mini"} aria-label="Smithers">{WORDMARK.join("\n")}</pre>
)

const Avatar = () => {
  const { set } = useMock()
  const [open, setOpen] = useState(false)
  return (
    <div className="front-avatar-wrap">
      <button type="button" className="front-avatar" aria-label="Account" aria-expanded={open} onClick={() => setOpen(!open)}>M</button>
      {open && (
        <div className="front-avatar-menu" role="menu">
          <p className="front-avatar-name">{MAYA.name}</p>
          <button type="button" className="front-avatar-item" onClick={() => { set({ as: "out" }); setOpen(false); navigate("smithers.sh/") }}>Sign out</button>
        </div>
      )}
    </div>
  )
}

/** The app header: mini wordmark, Docs, Source, and Sign in or maya's avatar. */
/** links={false}: the page carries Docs and Source itself (the #4315 landing), so the header keeps only Sign in. */
export const SmithersHeader = ({ bare = false, links = true }: { bare?: boolean; links?: boolean }) => {
  const { flags } = useMock()
  return (
    <header className="front-sh">
      {bare ? <span /> : <Link to="smithers.sh/" aria-label="Smithers home" className="front-sh-word"><Wordmark size="mini" /></Link>}
      <span className="front-spacer" />
      <nav className="front-sh-nav" aria-label="Site">
        {links && <Link to="smithers.sh/docs" className="front-sh-link">Docs</Link>}
        {links && <a href={EXTERNAL.smithersGithub} target="_blank" rel="noopener noreferrer" className="front-sh-link">Source</a>}
        {flags.as === "in"
          ? <Avatar />
          : <Link to={signInRoute("smithers.sh/")} className="front-btn front-btn-secondary front-btn-sm">Sign in</Link>}
      </nav>
    </header>
  )
}

/* ---------- the open box ---------- */

/** Strips https://, github.com/, .git and trailing slashes, then requires owner/name. */
const parseRepo = (raw: string): string | null => {
  const slug = raw.trim()
    .replace(/^https?:\/\//, "")
    .replace(/^(www\.)?github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "")
  return /^[\w.-]+\/[\w.-]+$/.test(slug) ? slug : null
}

export const OpenBox = ({ prefill = "", invalid = false, opening = false }: { prefill?: string; invalid?: boolean; opening?: boolean }) => {
  const [value, setValue] = useState(invalid ? "smithers" : prefill || (opening ? "maya/tinyhttp" : ""))
  const [error, setError] = useState(invalid)
  const [busy, setBusy] = useState(opening)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const slug = parseRepo(value)
    if (slug === null) { setError(true); return }
    setError(false)
    if (still) { navigate(`smithers.sh/${slug}`); return }
    setBusy(true)
    setTimeout(() => navigate(`smithers.sh/${slug}`), 400)
  }
  return (
    <form className="front-openbox" onSubmit={submit}>
      <div className="front-openbox-row">
        <input
          className="front-input"
          value={value}
          readOnly={busy}
          onChange={event => { setValue(event.target.value); setError(false) }}
          placeholder="github.com/owner/name or owner/name"
          aria-label="GitHub repository"
          aria-invalid={error}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button type="submit" className="front-btn front-btn-primary" disabled={busy}>{busy ? "Opening…" : "Open"}</button>
      </div>
      {error && <p className="front-openbox-error" role="alert">Use owner/name, like smithersai/smithers.</p>}
    </form>
  )
}

/* ---------- S#1: the landing (signed out) ---------- */

type CopyStatus = "idle" | "copied" | "failed"
type Runner = keyof typeof LANDING.commands

/** The npx/bunx switch over one command row. Start app is the page's one fill; the switch and Copy stay quiet. */
const RunCommand = ({ initialRunner, initialStatus }: { initialRunner: Runner; initialStatus: CopyStatus }) => {
  const [runner, setRunner] = useState<Runner>(initialRunner)
  const [status, setStatus] = useState<CopyStatus>(initialStatus)
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(settle.current), [])
  const command = LANDING.commands[runner]
  const copy = async () => {
    clearTimeout(settle.current)
    try {
      await navigator.clipboard.writeText(command)
      setStatus("copied")
    } catch {
      setStatus("failed")
    }
    if (!still) settle.current = setTimeout(() => setStatus("idle"), 2000)
  }
  return (
    <section className="front-run" aria-labelledby="front-run-label">
      <div className="front-run-head">
        <h2 id="front-run-label">{LANDING.runLabel}</h2>
        <div className="front-runner" role="radiogroup" aria-label={LANDING.runnerLabel}>
          {(Object.keys(LANDING.commands) as Runner[]).map(name => (
            <label key={name}><input type="radio" name="runner" value={name} checked={runner === name} onChange={() => { setRunner(name); setStatus("idle") }} />{name}</label>
          ))}
        </div>
      </div>
      <div className="front-run-command">
        <code><span aria-hidden="true">$ </span>{command}</code>
        <button type="button" onClick={copy} data-status={status}><IconCopy /><span>{status === "copied" ? "Copied" : status === "failed" ? "Try again" : "Copy"}</span></button>
      </div>
      <p className="front-run-note">Needs Node.js 26.4 or later. Adds a coding flow to <code>.smithers/flows/</code>.</p>
    </section>
  )
}

export const LandingPage = ({ context }: { context: RouteContext }) => {
  const { flags } = useMock()
  const state = context.query.get("state")
  if (flags.landing === "open") {
    const fromEffeck = context.query.get("utm_source") === "effeck.dev"
    return (
      <div className="front-page">
        <SmithersHeader bare />
        <main className="front-hero">
          <Wordmark size="hero" />
          <h1 className="front-h1">Coding agents for your GitHub repo.</h1>
          <p className="front-sub">{fromEffeck ? SUBHEAD_FROM_EFFECK : SUBHEAD_OPEN}</p>
          <OpenBox
            prefill={fromEffeck ? "effeck/effeck" : ""}
            invalid={state === "invalid"}
            opening={state === "opening"}
          />
        </main>

      </div>
    )
  }
  return (
    <div className="front-page">
      <SmithersHeader bare links={false} />
      <main className="front-hero">
        <Wordmark size="hero" />
        <h1 className="front-h1">{LANDING.headline}</h1>
        <p className="front-sub">{LANDING.tagline}</p>
        <RunCommand
          initialRunner={context.query.get("runner") === "bunx" ? "bunx" : "npx"}
          initialStatus={state === "copied" ? "copied" : state === "failed" ? "failed" : "idle"}
        />
        <nav className="front-run-actions" aria-label="Start">
          <Link className="front-run-button front-run-primary" to={signInRoute("smithers.sh/")}>Start app</Link>
          <Link className="front-run-button" to={LANDING.docs}>Docs</Link>
          <a className="front-run-button" href={LANDING.source} target="_blank" rel="noopener noreferrer">Source</a>
        </nav>
      </main>

    </div>
  )
}

/* ---------- S#3 / S#4: the launcher (signed in) ---------- */

const RepoSkeletons = () => (
  <>
  <p className="front-repos-loading" role="status">Loading repositories…</p>
  <ul className="front-repo-list" aria-label="Loading your repositories">
    {[0, 1, 2].map(i => (
      <li className="front-repo-row" key={i}>
        <span className="front-skel front-skel-slug" />
        <span className="front-skel front-skel-desc" />
      </li>
    ))}
  </ul>
  </>
)

const YourRepos = () => (
  <section aria-label="Your repositories">
    <h2 className="front-launcher-h2">Your repositories</h2>
    <ul className="front-repo-list">
      {importedRepos("some").map((repo, i) => (
        <li className="front-repo-row" key={repo.slug}>
          <div className="front-repo-main">
            <Link to={`smithers.sh/${repo.slug}`} className="front-repo-slug">{repo.slug}</Link>
            {repo.description !== "" && <span className="front-repo-desc">{repo.description}</span>}
          </div>
          <span className="front-repo-meta">Active {repo.lastActive}</span>
          {i === 0 && <Link to={`smithers.sh/${repo.slug}`} className="front-btn front-btn-secondary">Continue</Link>}
        </li>
      ))}
    </ul>
  </section>
)

const ImportFirst = () => {
  const { flags } = useMock()
  return (
    <section aria-label="Import your first repository">
      <h2 className="front-launcher-h2">Import your first repository</h2>
      <ul className="front-repo-list">
        {MAYA.github.map(repo => (
          <li className="front-repo-row" key={repo.slug}>
            <div className="front-repo-main">
              <span className="front-repo-slug">{repo.slug}</span>
              {repo.description !== "" && <span className="front-repo-desc">{repo.description}</span>}
            </div>
            <span className="front-repo-meta">{repo.language}</span>
            <Link to={`smithers.sh/${repo.slug}?card=import`} className="front-btn front-btn-secondary">Import</Link>
          </li>
        ))}
      </ul>
      <p className="front-launcher-note">
        Don't see a repo? <a href={EXTERNAL.githubApp} target="_blank" rel="noopener noreferrer">Add it to the Smithers GitHub App ↗</a>
      </p>
      {flags.hosted !== "paused" && (
        <p className="front-launcher-note">
          No repo handy? <Link to="smithers.sh/smithersai/hello-smithers?card=example">Start from our example</Link>
        </p>
      )}
    </section>
  )
}

export const LauncherPage = () => {
  const { flags } = useMock()
  const read = useRead(`launcher:${flags.repos}`)
  return (
    <div className="front-page">
      <SmithersHeader />
      <main className="front-launcher">
        <h1 className="front-launcher-h1">Open a repository</h1>
        <OpenBox />
        {read.state === "loading" && <RepoSkeletons />}
        {read.state === "error" && (
          <div className="front-read-error" role="alert">
            <p>Couldn't read your repositories from GitHub.</p>
            <button type="button" className="front-btn front-btn-secondary" onClick={read.retry}>Retry</button>
          </div>
        )}
        {read.state === "ready" && (flags.repos === "some" ? <YourRepos /> : <ImportFirst />)}
      </main>

    </div>
  )
}

/* ---------- the sign-in step (mock of GitHub's OAuth page) ---------- */

const GitHubMark = () => (
  <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" aria-label="GitHub">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
  </svg>
)

export const SigninPage = ({ context }: { context: RouteContext }) => {
  const { set } = useMock()
  const back = context.query.get("return") ?? "smithers.sh/"
  return (
    <main className="front-signin">
      <div className="front-signin-panel">
        <p className="front-signin-strip">github.com/login/oauth/authorize</p>
        <div className="front-signin-body">
          <div className="front-signin-marks">
            <span className="front-signin-mark"><Wordmark size="mini" /></span>
            <span className="front-signin-dots" aria-hidden="true" />
            <span className="front-signin-mark front-signin-gh"><GitHubMark /></span>
          </div>
          <h1 className="front-signin-h">Authorize Smithers</h1>
          <p className="front-signin-sub"><strong>Smithers</strong> by smithersai wants to access your GitHub account <strong>maya</strong>.</p>
          <ul className="front-signin-scopes">
            <li>Read your profile and email address</li>
            <li>Read and write the repositories you choose in the next step</li>
          </ul>
          <div className="front-signin-actions">
            <button type="button" className="front-btn front-btn-primary" onClick={() => { set({ as: "in" }); navigate(back) }}>Authorize smithersai</button>
            <button type="button" className="front-btn front-btn-secondary" onClick={() => navigate(back)}>Cancel</button>
          </div>
          <p className="front-signin-foot">Authorizing redirects to smithers.sh</p>
        </div>
      </div>
    </main>
  )
}

/* ---------- S#5: the docs ---------- */

/* Markdown links in the docs resolve to a docs route by slug, a repo route for Smithers-on-Smithers, else external. */
const smithersLink: ResolveLink = (href) => {
  if (href === SMITHERS_REPO) return { kind: "route", to: `smithers.sh/${SMITHERS_REPO}` }
  if (/^https?:/.test(href)) return { kind: "external", href }
  const cleaned = href.replace(/^\.?\//, "").replace(/#.*$/, "").replace(/\.mdx?$/, "").replace(/\/$/, "")
  const bySlug = SMITHERS_DOCS.find(page => page.slug === cleaned || page.slug.split("/").pop() === cleaned.split("/").pop())
  if (bySlug !== undefined) return { kind: "route", to: bySlug.slug === "" ? "smithers.sh/docs" : `smithers.sh/docs/${bySlug.slug}` }
  return { kind: "external", href: `https://github.com/smithersai/smithers/blob/main/${href}` }
}

export const SmithersDocsPage = ({ context }: { context: RouteContext }) => {
  const slug = context.params["*"] ?? ""
  const page = SMITHERS_DOCS.find(each => each.slug === slug) ?? SMITHERS_DOCS[0]
  const [menuOpen, setMenuOpen] = useState(false)
  const index = SMITHERS_DOCS.indexOf(page)
  const prev = index > 0 ? SMITHERS_DOCS[index - 1] : undefined
  const next = index < SMITHERS_DOCS.length - 1 ? SMITHERS_DOCS[index + 1] : undefined
  const sections = sectionsOf(page.body)
  const docsRoute = (each: SmithersDocPage) => each.slug === "" ? "smithers.sh/docs" : `smithers.sh/docs/${each.slug}`
  return (
    <div className="front-page">
      <SmithersHeader />
      <div className="front-docs-body">
        <aside className="front-docs-side">
          <button type="button" className="front-docs-menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            Menu <IconChevron />
          </button>
          <nav className="front-docs-nav" data-open={menuOpen} aria-label="Docs">
            <div className="front-docs-group">
              {SMITHERS_DOCS.map(each => (
                <Link key={each.slug} to={docsRoute(each)} className="front-docs-item" data-current={each.slug === page.slug}>{each.title}</Link>
              ))}
              <a href={CODING_GUIDE} target="_blank" rel="noopener noreferrer" className="front-docs-item">Coding guide on GitHub ↗</a>
            </div>
          </nav>
        </aside>
        <main className={`front-docs-main${page.slug === "" ? " front-docs-index" : ""}`}>
          <h1 className="front-doc-title">{page.title}</h1>
          {page.slug === "installation" && (
            <CommandRow command={INSTALL_COMMAND} primary className="front-cmd-docs" />
          )}
          <Markdown md={page.body} link={smithersLink} />
          <nav className="front-docs-pagenav" aria-label="Previous and next pages">
            {prev !== undefined ? <Link to={docsRoute(prev)} className="front-docs-prev">← {prev.title}</Link> : <span />}
            {next !== undefined ? <Link to={docsRoute(next)} className="front-docs-next">{next.title} →</Link> : <span />}
          </nav>
          <p className="front-docs-meta">
            <a href={page.file !== null ? `${EXTERNAL.smithersGithub}/blob/main/${page.file}` : `${EXTERNAL.smithersGithub}/tree/main/apps/site/docs`} target="_blank" rel="noopener noreferrer">Edit this page</a>
          </p>
        </main>
        {sections.length >= 3 && <aside className="front-docs-toc">
              <p className="front-docs-toc-h">On this page</p>
              {sections.map(section => (
                <button
                  key={section.id}
                  type="button"
                  className="front-docs-toc-item"
                  onClick={() => document.getElementById(section.id)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
                >{section.title}</button>
              ))}
        </aside>}
      </div>

    </div>
  )
}
