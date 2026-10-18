/*
 * effeck.dev: the converter landing (PM E#1, E#2) and the docs pages (PM E#3).
 * Layout and copy follow Launch/2026-10-19/effeck/above-the-fold.md; the precomputed pair is verbatim.
 */
import { useEffect, useRef, useState } from "react"
import { EXTERNAL } from "../core/catalog"
import { useMock, still } from "../core/mock"
import { Link, type RouteContext } from "../core/router"
import {
  BROKEN_EFFECT, CONVERTED_EFFECK, DIAGNOSTICS, EDITED_EFFECT, EFFECK_DOCS, FAILED_EFFECK,
  HERO_EFFECT, HERO_EFFECK, INSTALL_LINE, REACT_SNIPPET, SMITHERS_HANDOFF,
  type EffeckDocPage
} from "./effeck-content"
import { renderLine, tokenize, type Tok } from "./highlight"
import { stripLeadingTitle, Markdown, sectionsOf, type ResolveLink } from "./markdown"
import { CodeScroll, CommandRow, CopyButton, IconCheck, IconChevron, IconClock, IconX } from "./ui"

import { LEGACY_DOCS } from "./legacy-docs"
const ALL_DOCS = [...EFFECK_DOCS, ...LEGACY_DOCS.filter(page => !EFFECK_DOCS.some(existing => existing.slug === page.slug))]

/* ---------- shared chrome ---------- */

const DOCS_HOME = "smithers.sh/effeck/effeck/blob/main/docs/user/src/001-onboarding.md"
const SOURCE_REPO = "smithers.sh/effeck/effeck?utm_source=effeck.dev&utm_medium=source&utm_campaign=effeck-launch"

export const EffeckHeader = () => (
  <header className="front-eh">
    <Link to="effeck.dev/" className="front-eh-word">VibeLang</Link>
    <nav className="front-eh-nav" aria-label="Site">
      <Link to={DOCS_HOME} className="front-eh-link">Docs</Link>
      <Link to={SOURCE_REPO} className="front-eh-link">Source on Smithers</Link>
    </nav>
  </header>
)

const EffeckFooter = () => (
  <footer className="front-efoot">
    <Link to={DOCS_HOME}>Docs</Link>
    <span aria-hidden="true">·</span>
    <Link to={SOURCE_REPO}>Source on Smithers</Link>
  </footer>
)

/* ---------- the converter (E#1, E#2) ---------- */

type CState = "initial" | "edited" | "converting" | "compiled" | "failed" | "not-effect" | "limit" | "shared" | "shared-altered"

const STATES: Array<CState> = ["initial", "edited", "converting", "compiled", "failed", "not-effect", "limit", "shared", "shared-altered"]

const checksum = (value: string) => { let n = 2166136261; for (const ch of value) n = Math.imul(n ^ ch.charCodeAt(0), 16777619); return (n >>> 0).toString(16) }
const shareURL = (left: string, right: string) => {
  const pair = JSON.stringify({ left, right })
  return `https://effeck.dev/?utm_source=share&utm_medium=convert&utm_campaign=effeck-launch#c=${encodeURIComponent(JSON.stringify({ left, right, receipt: checksum(pair) }))}`
}
const readShared = (context: RouteContext): { left: string; right: string; valid: boolean } | null => {
  const raw = context.query.get("c") ?? (/^#\/?c=/.test(window.location.hash) ? window.location.hash.replace(/^#\/?c=/, "") : null)
  if (!raw) return null
  try {
    const pair = JSON.parse(decodeURIComponent(raw))
    if (typeof pair.left !== "string" || typeof pair.right !== "string") throw Error("Invalid pair")
    return { ...pair, valid: pair.receipt === checksum(JSON.stringify({ left: pair.left, right: pair.right })) }
  } catch { return { left: HERO_EFFECT, right: HERO_EFFECK, valid: false } }
}

const parseState = (raw: string | null): CState => STATES.find(state => state === raw) ?? "initial"

const initialLeft = (state: CState): string => {
  switch (state) {
    case "edited": case "converting": case "compiled": return EDITED_EFFECT
    case "failed": return BROKEN_EFFECT
    case "not-effect": return REACT_SNIPPET
    default: return HERO_EFFECT
  }
}

const unbalanced = (code: string): boolean => {
  let curly = 0, round = 0, square = 0
  for (const ch of code) {
    if (ch === "{") curly += 1; if (ch === "}") curly -= 1
    if (ch === "(") round += 1; if (ch === ")") round -= 1
    if (ch === "[") square += 1; if (ch === "]") square -= 1
    if (curly < 0 || round < 0 || square < 0) return true
  }
  return curly !== 0 || round !== 0 || square !== 0
}

/* The left pane: a real editable textarea layered over the highlighted pre, scrolls synced. */
const EffectEditor = ({ value, onChange, locked }: { value: string; onChange: (next: string) => void; locked: boolean }) => {
  const preRef = useRef<HTMLPreElement>(null)
  const sync = (ta: HTMLTextAreaElement) => {
    const pre = preRef.current
    if (pre !== null) { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft }
  }
  return (
    <CodeScroll><div className="front-editor">
      <pre ref={preRef} className="front-editor-pre" aria-hidden="true"><code>
        {tokenize(value).map((line, i) => (
          <span className="front-code-line" key={i}>
            <span className="front-code-num">{i + 1}</span>
            <span className="front-code-src">{renderLine(line)}{"\n"}</span>
          </span>
        ))}
      </code></pre>
      <textarea
        className="front-editor-ta"
        value={value}
        readOnly={locked}
        onChange={event => onChange(event.target.value)}
        onScroll={event => sync(event.currentTarget)}
        aria-label="Effect code to convert"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
      />
    </div></CodeScroll>
  )
}

/* The nameOf hover type: the inferred type and why the error channel is empty. */
const NameOfTip = ({ children }: { children: React.ReactNode }) => (
  <span className="front-tip" tabIndex={0}>
    {children}
    <span className="front-tip-body" role="tooltip">
      <code>nameOf(id: string): string!!Users</code>
      <span>The fallback removed every failure, including the timeout.</span>
    </span>
  </span>
)

const annotateNameOf = (tok: Tok, key: number, node: React.ReactNode): React.ReactNode =>
  tok.text === "nameOf" ? <NameOfTip key={key}>{node}</NameOfTip> : node

/* A read-only pane body: highlighted code with line numbers; the right pane carries the nameOf hover type. */
const EffeckView = ({ code, tips = true }: { code: string; tips?: boolean }) => (
  <CodeScroll><pre className="front-code front-pane-code"><code>
    {tokenize(code).map((line, i) => (
      <span className="front-code-line" key={i}>
        <span className="front-code-num" aria-hidden="true">{i + 1}</span>
        <span className="front-code-src">{renderLine(line, tips ? annotateNameOf : undefined)}{"\n"}</span>
      </span>
    ))}
  </code></pre></CodeScroll>
)

const Badge = ({ state }: { state: CState }) => {
  switch (state) {
    case "initial": case "compiled": case "limit": case "shared":
      return <span className="front-badge front-badge-ok"><IconCheck />Compiles · vibelang 0.0.1</span>
    case "edited":
      return <span className="front-badge front-badge-neutral">Out of date</span>
    case "converting":
      return <span className="front-badge front-badge-live"><IconClock />Converting · 4 s</span>
    case "failed":
      return <span className="front-badge front-badge-danger"><IconX />Did not compile</span>
    case "shared-altered":
      return <span className="front-badge front-badge-neutral">Not verified</span>
    default:
      return null
  }
}

/* The Effect | VibeLang switch: on phone it sits inside the visible pane's header; hidden on desktop. */
const SegTabs = ({ tab, setTab }: { tab: "effect" | "effeck"; setTab: (tab: "effect" | "effeck") => void }) => (
  <div className="front-seg" role="tablist" aria-label="Code panes">
    <button type="button" role="tab" aria-selected={tab === "effect"} data-active={tab === "effect"} onClick={() => setTab("effect")}>Effect</button>
    <button type="button" role="tab" aria-selected={tab === "effeck"} data-active={tab === "effeck"} onClick={() => setTab("effeck")}>VibeLang</button>
  </div>
)

/* converter=off (Monday default): the hero pair is a read-only example; the one action is the install command. */
const ExampleLanding = ({ copied }: { copied: boolean }) => {
  const [tab, setTab] = useState<"effect" | "effeck">("effeck")
  return (
    <div className="front-page">
      <EffeckHeader />
      <main className="front-conv">
        <h1 className="front-h1">Effect, as a language.</h1>
        <p className="front-sub">VibeLang gives Effect.ts a simple, readable syntax that compiles to TypeScript, with first-class access to the TypeScript ecosystem.</p>
        <p className="front-pair-tag">Example</p>
        <div className="front-panes front-example-panes" style={{ "--front-pane-rows": Math.max(tokenize(HERO_EFFECT).length, tokenize(HERO_EFFECK).length) } as React.CSSProperties}>
          <section className="front-pane" data-active={tab === "effect"} aria-label="Effect example">
            <div className="front-pane-label">
              <span className="front-pane-name">Effect</span>
              <SegTabs tab={tab} setTab={setTab} />
            </div>
            <EffeckView code={HERO_EFFECT} tips={false} />
            <div className="front-pane-foot">{tokenize(HERO_EFFECT).length} lines</div>
          </section>
          <section className="front-pane" data-active={tab === "effeck"} aria-label="VibeLang example">
            <div className="front-pane-label">
              <span className="front-pane-name">VibeLang</span>
              <SegTabs tab={tab} setTab={setTab} />
            </div>
            <EffeckView code={HERO_EFFECK} />
            <div className="front-pane-foot">{tokenize(HERO_EFFECK).length} lines</div>
          </section>
        </div>
        <p className="front-caption">Both compile.</p>
        <CommandRow command={INSTALL_LINE} primary copied={copied} />
      </main>
      <EffeckFooter />
    </div>
  )
}

export const ConverterPage = ({ context }: { context: RouteContext }) => {
  const { flags } = useMock()
  if (flags.converter === "off" && !readShared(context)) {
    return <ExampleLanding copied={context.query.get("state") === "copied"} />
  }
  return <Converter context={context} />
}

const Converter = ({ context }: { context: RouteContext }) => {
  const { flags } = useMock()
  const shared = readShared(context)
  const opened = shared ? shared.valid ? "shared" : "shared-altered" : parseState(context.query.get("state"))
  const [cstate, setCstate] = useState<CState>(opened)
  const [left, setLeft] = useState<string>(shared?.left ?? initialLeft(opened))
  const [streamed, setStreamed] = useState(0)
  const [tab, setTab] = useState<"effect" | "effeck">("effeck")

  /* The converter's output for the current left pane. */
  const target = left.includes(`"5 seconds"`) ? CONVERTED_EFFECK : HERO_EFFECK

  useEffect(() => {
    if (cstate !== "converting") return
    if (still) { setStreamed(Math.floor(target.length / 2)); return }
    setStreamed(0)
    const startedAt = Date.now()
    const timer = setInterval(() => {
      const n = Math.min(target.length, Math.floor(((Date.now() - startedAt) / 2500) * target.length))
      setStreamed(n)
      if (n >= target.length) { clearInterval(timer); setCstate("compiled") }
    }, 24)
    return () => clearInterval(timer)
  }, [cstate])

  const edit = (next: string) => {
    setLeft(next)
    setCstate(next === HERO_EFFECT ? "initial" : "edited")
  }

  const convert = () => {
    if (flags.convert === "limit") { setCstate("limit"); return }
    if (!left.includes(`from "effect"`)) { setCstate("not-effect"); return }
    if (unbalanced(left)) { setCstate("failed"); return }
    setCstate("converting")
  }

  const reset = () => { setLeft(HERO_EFFECT); setCstate("initial") }

  const rightCode = cstate === "converting" ? target.slice(0, streamed)
    : cstate === "compiled" ? target
    : cstate === "failed" ? FAILED_EFFECK
    : (cstate === "shared" || cstate === "shared-altered") ? shared?.right ?? HERO_EFFECK : HERO_EFFECK

  const compiling = cstate === "initial" || cstate === "compiled" || cstate === "limit" || cstate === "shared"
  const showCaption = compiling
  const showShare = compiling
  const showCopy = compiling
  const editedLike = cstate === "edited" || cstate === "failed" || cstate === "not-effect" || cstate === "limit"
  const isShared = cstate === "shared" || cstate === "shared-altered"

  return (
    <div className="front-page">
      <EffeckHeader />
      <main className="front-conv" data-converter-state={cstate}>
        <h1 className="front-h1">Effect, as a language.</h1>
        <p className="front-sub">VibeLang gives Effect.ts a simple, readable syntax that compiles to TypeScript, with first-class access to the TypeScript ecosystem.</p>

        {isShared && <p className="front-note">Shared conversion. Opening it made no model call.</p>}

        {cstate === "limit" && (
          <div className="front-limit" role="status">
            <p>You've used today's conversions. Install VibeLang and convert locally.</p>
          </div>
        )}


        <div className="front-panes" style={{ "--front-pane-rows": Math.min(30, Math.max(...[HERO_EFFECT, HERO_EFFECK, EDITED_EFFECT, CONVERTED_EFFECK, BROKEN_EFFECT, FAILED_EFFECK, left, rightCode].map(code => tokenize(code).length))) } as React.CSSProperties}>
          <section className="front-pane" data-active={tab === "effect"} aria-label="Effect source" style={{ "--front-active-rows": tokenize(left).length } as React.CSSProperties}>
            <div className="front-pane-label">
              <span className="front-pane-name">Effect</span>
              <SegTabs tab={tab} setTab={setTab} />
              <span className="front-pane-hint">edit me</span>
              <span className="front-phone-status"><Badge state={cstate} /></span>
            </div>
            <EffectEditor value={left} onChange={edit} locked={cstate === "converting"} />
            <div className="front-pane-foot">{tokenize(left).length} lines</div>
          </section>

          <section className="front-pane" data-active={tab === "effeck"} aria-label="VibeLang result" style={{ "--front-active-rows": Math.max(1, tokenize(rightCode).length) } as React.CSSProperties}>
            <div className="front-pane-label">
              <span className="front-pane-name">VibeLang</span>
              <SegTabs tab={tab} setTab={setTab} />
              <Badge state={cstate} />
            </div>
            {cstate === "not-effect" ? (
              <div className="front-pane-message">
                <p>This doesn't look like Effect code. Paste code that imports from <code>effect</code>.</p>
              </div>
            ) : (
              <EffeckView code={rightCode} />
            )}
            <div className="front-pane-foot">{cstate === "not-effect" ? "" : `${tokenize(rightCode).length} lines`}</div>
          </section>

          <p className="front-disclose">Edits are converted by a model, run on Smithers and paid for by us: 10 a day. Don't paste secrets.</p>
          {cstate === "failed" && (
            <ul className="front-diags" aria-label="Compiler diagnostics">
              {DIAGNOSTICS.map(diag => (
                <li key={`${diag.line}:${diag.col}`}>
                  <code>{`${diag.file}:${diag.line}:${diag.col}`}</code>
                  <code className="front-diag-code">{diag.code}</code>
                  <span>{diag.message}</span>
                </li>
              ))}
              <li><Link to={`smithers.sh/effeck/effeck/bug?from=conversion&input=${encodeURIComponent(left)}&output=${encodeURIComponent(rightCode)}`}>Report this conversion</Link></li>
            </ul>
          )}
        </div>

        {cstate === "shared-altered" && <p className="front-unverified-note">This code changed after the link was shared, so it has not been compiled.</p>}

        {/* Reserve the caption row only while converting, so the compiled caption lands without moving the actions. */}
        {(showCaption || cstate === "converting") && (
          <p className="front-caption" style={{ visibility: showCaption ? "visible" : "hidden" }} aria-hidden={!showCaption}>Both compile, and TypeScript sees the same type for <code>names</code>: <code>{"Effect<string[], never, Users>"}</code>.</p>
        )}

        <div className="front-actions">
          {isShared ? (
            <button type="button" className="front-btn front-btn-primary" onClick={reset}>Convert your own</button>
          ) : cstate === "converting" ? (
            <button type="button" className="front-btn front-btn-secondary" onClick={() => setCstate("edited")}>Cancel</button>
          ) : (
            <button type="button" className="front-btn front-btn-primary" disabled={cstate !== "edited"} onClick={convert}>Convert</button>
          )}
          {editedLike && left !== HERO_EFFECT && (
            <button type="button" className="front-btn front-btn-secondary" onClick={reset}>Reset example</button>
          )}
          <span className="front-spacer" />
          {showCopy && <CopyButton text={rightCode} label="Copy VibeLang" />}
          {showShare && <CopyButton text={shareURL(left, rightCode)} label="Share link" copiedLabel="Link copied" />}
        </div>

        <CommandRow command={INSTALL_LINE} className="front-cmd-spaced" />

        {(cstate === "compiled" || cstate === "shared") && (
          <p className="front-smithers-line"><Link to={SMITHERS_HANDOFF}>This conversion ran on Smithers. Bring VibeLang to your own repo →</Link></p>
        )}

      </main>
      <EffeckFooter />
    </div>
  )
}

/* ---------- the docs (E#3) ---------- */

/* Resolve a markdown link from a docs page: known pages stay in the mock, other pages go to the live site. */
const normalize = (path: string): string => {
  const parts: Array<string> = []
  for (const part of path.split("/")) {
    if (part === "." || part === "") continue
    if (part === "..") parts.pop()
    else parts.push(part)
  }
  return parts.join("/")
}

const effeckLink = (page: EffeckDocPage): ResolveLink => (href) => {
  if (/^https?:/.test(href)) return { kind: "external", href }
  const dir = page.file.includes("/") ? page.file.slice(0, page.file.lastIndexOf("/")) : ""
  const target = normalize(dir === "" ? href : `${dir}/${href}`).replace(/\.md$/, ".html")
  const found = ALL_DOCS.find(each => each.slug === target)
  if (found !== undefined) return { kind: "route", to: `effeck.dev/${found.slug}` }
  return { kind: "external", href: `https://effeck.dev/${target}` }
}

const V0_WARNING = "VibeLang is v0. The language will change in major, breaking ways. It is not suitable for production use."

/* Docs bug reports go by prefilled email until outsiders can file issues on smithers.sh (pm-smithers-4). */
const bugMailto = (page: EffeckDocPage) =>
  `${EXTERNAL.support}?subject=${encodeURIComponent(`VibeLang docs: ${page.title}`)}&body=${encodeURIComponent(`https://effeck.dev/${page.slug}\n\nWhat happened:`)}`

export const EffeckDocsPage = ({ context }: { context: RouteContext }) => {
  const slug = (context.params["*"] ?? "").replace(/\.md$/, ".html")
  const page = ALL_DOCS.find(each => each.slug === slug)
  const [menuOpen, setMenuOpen] = useState(false)
  if (slug === "llms.txt") return <div className="front-page"><EffeckHeader /><main className="front-docs-missing"><h1>VibeLang documentation</h1><pre className="front-code front-llms">{ALL_DOCS.map(each => `${each.title}: https://effeck.dev/${each.slug}`).join("\n")}</pre></main><EffeckFooter /></div>
  if (page === undefined) {
    return (
      <div className="front-page">
        <EffeckHeader />
        <main className="front-docs-missing">
          <h1>Page moved</h1>
          <p>Open the docs index.</p>
          <p><Link to="effeck.dev/001-onboarding.html">Docs index</Link></p>
        </main>
        <EffeckFooter />
      </div>
    )
  }
  const index = ALL_DOCS.indexOf(page)
  const prev = index > 0 ? ALL_DOCS[index - 1] : undefined
  const next = index < ALL_DOCS.length - 1 ? ALL_DOCS[index + 1] : undefined
  const sections = sectionsOf(page.body)
  const sectionsList: Array<{ section: string | null; pages: Array<EffeckDocPage> }> = []
  for (const each of ALL_DOCS) {
    const group = sectionsList.find(item => item.section === each.section)
    if (group !== undefined) group.pages.push(each)
    else sectionsList.push({ section: each.section, pages: [each] })
  }
  return (
    <div className="front-page">
      <EffeckHeader />
      <div className="front-docs-body">
        <aside className="front-docs-side">
          <button type="button" className="front-docs-menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            Menu <IconChevron />
          </button>
          <nav className="front-docs-nav" data-open={menuOpen} aria-label="Docs">
            {sectionsList.map(group => (
              <div className="front-docs-group" key={group.section ?? "top"}>
                {group.section !== null && <p className="front-docs-section">{group.section}</p>}
                {group.pages.map(each => (
                  <Link key={each.slug} to={`effeck.dev/${each.slug}`} className="front-docs-item" data-current={each.slug === page.slug}>{each.title}</Link>
                ))}
              </div>
            ))}
          </nav>
        </aside>
        <main className="front-docs-main">
          <p className="front-callout front-callout-warning" role="note"><strong>Warning:</strong> {V0_WARNING}</p>
          <h1 className="front-doc-title">{page.title}</h1>
          <Markdown md={stripLeadingTitle(page.body, page.title)} link={effeckLink(page)} />
          <nav className="front-docs-pagenav" aria-label="Previous and next pages">
            {prev !== undefined
              ? <Link to={`effeck.dev/${prev.slug}`} className="front-docs-prev">← {prev.title}</Link>
              : <span />}
            {next !== undefined
              ? <Link to={`effeck.dev/${next.slug}`} className="front-docs-next">{next.title} →</Link>
              : <span />}
          </nav>
          <p className="front-docs-meta">
            <Link to={`smithers.sh/effeck/effeck/blob/main/docs/user/src/${page.file}`}>Edit this page</Link>
            <span aria-hidden="true">·</span>
            <a href={bugMailto(page)} target="_blank" rel="noopener noreferrer">Report a bug</a>
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
      <EffeckFooter />
    </div>
  )
}
