import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Link, useLocation } from "../../../core/router"
import { repo, to } from "../../fixtures"
import { Syntax } from "../../ui/syntax"
import { registerSlash } from "../../frame"
import { docsCodeHovers, type DocsHover } from "./model"

type ActiveHover = { symbol: DocsHover; left: number; top: number }

/** Drop-in code-block renderer; the Docs view keeps its existing toolbar and Copy action. */
export const DocsCode = ({ code }: { code: string }) => {
  const root = useRef<HTMLPreElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const focusCard = useRef(false)
  const id = useId()
  const location = useLocation()
  const slug = repo.slug
  const symbols = useMemo(() => docsCodeHovers(code), [code, slug])
  const [active, setActive] = useState<ActiveHover | null>(null)
  const keep = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  const dismiss = (restoreFocus = false) => {
    keep()
    setActive(null)
    if (restoreFocus) trigger.current?.focus({ preventScroll: true })
  }
  const closeSoon = () => {
    keep()
    if (active?.symbol.name === new URLSearchParams(location.split("?")[1]).get("hover")) return
    closeTimer.current = setTimeout(() => {
      if (!card.current?.contains(document.activeElement) && document.activeElement !== trigger.current) setActive(null)
    }, 180)
  }
  const show = (symbol: DocsHover, element: HTMLButtonElement) => {
    keep()
    trigger.current = element
    const rect = element.getBoundingClientRect()
    const width = Math.min(380, window.innerWidth - 32)
    setActive({ symbol, left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)), top: rect.bottom + 8 })
  }
  useLayoutEffect(() => {
    if (!active || !card.current) return
    const rect = card.current.getBoundingClientRect()
    const top = Math.max(12, Math.min(active.top, window.innerHeight - rect.height - 12))
    if (top !== active.top) setActive(value => value ? { ...value, top } : null)
    if (focusCard.current) {
      focusCard.current = false
      card.current.querySelector<HTMLAnchorElement>("a")?.focus({ preventScroll: true })
    }
  }, [active])
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && card.current) {
        event.preventDefault()
        // Focus before clearing the state: onFocus may otherwise immediately reopen the card.
        trigger.current?.focus({ preventScroll: true })
        dismiss()
      }
    }
    const resize = () => dismiss()
    window.addEventListener("keydown", close)
    window.addEventListener("resize", resize)
    return () => { keep(); window.removeEventListener("keydown", close); window.removeEventListener("resize", resize) }
  }, [])
  useLayoutEffect(() => {
    dismiss()
    // A review screen can open one real hover, without a separate static card implementation.
    const name = new URLSearchParams(location.split("?")[1]).get("hover")
    const first = Array.from(document.querySelectorAll<HTMLButtonElement>(".repo-hovers-token")).find(button => button.dataset.name === name)
    const symbol = symbols.find(value => value.name === name)
    if (first && symbol && root.current?.contains(first)) show(symbol, first)
  }, [code, location, symbols])
  useEffect(() => registerSlash("docs.symbol", {
    purpose: "Show a documentation symbol's type", access: "public", confirm: false,
    fields: [{ name: "name", label: "Identifier" }],
    run: ({ name }, { closeAsk }) => {
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".repo-hovers-token")).find(value => value.dataset.name === name)
      closeAsk()
      button?.click()
    }
  }), [])
  const parts = []
  let cursor = 0
  for (const symbol of symbols) {
    if (symbol.start > cursor) parts.push(<Syntax key={`text-${cursor}`} code={code.slice(cursor, symbol.start)} />)
    parts.push(<button key={symbol.start} type="button" className="repo-hovers-token" data-name={symbol.name}
      title={`/docs.symbol ${symbol.name}`} aria-label={`${symbol.name}: show inferred type`}
      aria-expanded={active?.symbol.start === symbol.start} aria-controls={active?.symbol.start === symbol.start ? id : undefined}
      onMouseEnter={event => show(symbol, event.currentTarget)} onMouseLeave={closeSoon}
      onFocus={event => show(symbol, event.currentTarget)} onBlur={closeSoon}
      onClick={event => { focusCard.current = true; show(symbol, event.currentTarget) }}>
      {<Syntax code={code.slice(symbol.start, symbol.end)} />}
    </button>)
    cursor = symbol.end
  }
  parts.push(<Syntax key={`text-${cursor}`} code={code.slice(cursor)} />)
  const definition = active?.symbol.definition
  const [signature, ...documentation] = active?.symbol.hover.split("\n") ?? []
  return <>
    <pre className="repo-hovers-code" ref={root} onScroll={() => {
      // Font/layout settling can scroll a pre on a fresh review URL. Keep its
      // requested hover visible; ordinary pointer hovers still dismiss on scroll.
      const requested = new URLSearchParams(location.split("?")[1]).get("hover")
      if (!active || active.symbol.name !== requested) dismiss()
    }}><code>{parts}</code></pre>
    {active && createPortal(<div ref={card} id={id} role="dialog" aria-label={`${active.symbol.name} inferred type`}
      className="repo-hovers-card" style={{ left: active.left, top: active.top }}
      onMouseEnter={keep} onMouseLeave={closeSoon} onFocus={keep} onBlur={closeSoon}>
      <code>{signature}</code>
      {documentation.length > 0 && <p>{documentation.join("\n")}</p>}
      <nav aria-label="Symbol actions">
        {definition && <Link to={`${to(`blob/${encodeURIComponent(repo.defaultBranch)}/${definition.path}`)}?L=${definition.line}`}>Go to definition</Link>}
        <Link to={to(`search?q=${encodeURIComponent(`symbol:${active.symbol.name}`)}`)}>Find references</Link>
      </nav>
    </div>, document.body)}
  </>
}
