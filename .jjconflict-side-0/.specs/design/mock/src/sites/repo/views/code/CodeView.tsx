/* Local CodeView adds the symbol and diagnostic slots the shared CodeView lacks. */
import { useEffect, useMemo, useRef, useState, type MouseEvent, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { Link, navigate, useLocation } from "../../../core/router"
import { to } from "../../fixtures"
import type { FileBlob, Symbol as CodeSymbol } from "../../fixtures/types"
import { tokenize } from "../../ui/syntax"
import { sourceRoute } from "./shared"

export type LineRange = { start: number; end: number }

export const readSelection = (location: string, count: number): LineRange | null => {
  const value = new URLSearchParams(location.split("?")[1]).get("L")
  if (!value || !/^\d+(?:-\d+)?$/.test(value) || !count) return null
  const [first, second = first] = value.split("-").map(Number)
  if (first < 1 || first > count || second < 1 || second > count) return null
  return { start: Math.min(first, second), end: Math.max(first, second) }
}

export const useLineSelection = (count: number) => {
  const location = useLocation()
  const selected = readSelection(location, count)
  const anchor = useRef<number | null>(selected?.start ?? null)
  const select = (line: number, extend = false) => {
    const first = extend ? anchor.current ?? selected?.start ?? line : line
    if (!extend) anchor.current = line
    const query = new URLSearchParams(location.split("?")[1])
    query.set("L", first === line ? String(line) : `${Math.min(first, line)}-${Math.max(first, line)}`)
    navigate(`${location.split("?")[0]}?${query}`, { replace: true })
  }
  return { selected, select }
}

type Hover = { symbol: CodeSymbol; left: number; top: number }

export const CodeView = ({ blob, revision, selected, onSelect, startLine = 1, endLine }: {
  blob: FileBlob
  revision: string
  selected: LineRange | null
  onSelect: (line: number, extend?: boolean) => void
  startLine?: number
  endLine?: number
}) => {
  const location = useLocation()
  const root = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<Hover | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tokens = useMemo(() => tokenize(blob.content), [blob.content])
  const keepOpen = () => { if (closeTimer.current) clearTimeout(closeTimer.current) }
  const closeSoon = () => {
    keepOpen()
    closeTimer.current = setTimeout(() => {
      if (!card.current?.contains(document.activeElement)) setHover(null)
    }, 180)
  }
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])
  useEffect(() => {
    if (!selected) return
    // Defer past the router's scroll reset, including static screenshot renders and blame ranges.
    const frame = requestAnimationFrame(() => {
      const target = root.current?.querySelector<HTMLElement>(`[data-line="${selected.start}"]`)
      if (target) window.scrollTo({ top: window.scrollY + target.getBoundingClientRect().top - window.innerHeight / 3, behavior: "instant" })
    })
    return () => cancelAnimationFrame(frame)
  }, [blob.path, revision, selected?.start, selected?.end])
  useEffect(() => {
    if (!hover) return
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setHover(null) }
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [hover])
  const showSymbol = (symbol: CodeSymbol, element: HTMLElement) => {
    keepOpen()
    const rect = element.getBoundingClientRect()
    setHover({
      symbol,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - 372)),
      top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 220))
    })
  }
  const lineHref = (line: number) => {
    const query = new URLSearchParams(location.split("?")[1])
    query.set("L", String(line))
    return `${location.split("?")[0]}?${query}`
  }
  const handleLine = (event: MouseEvent, line: number) => {
    event.preventDefault()
    onSelect(line, event.shiftKey)
  }
  const definition = hover?.symbol.definition ?? (hover ? { path: blob.path, line: hover.symbol.line } : null)
  const [signature, ...documentation] = hover?.symbol.hover.split("\n") ?? []
  return (
    <div className="repo-code-source" style={{ "--repo-code-number-width": `calc(${String(tokens.length).length}ch + 12px)` } as CSSProperties} ref={root} aria-label={`Source of ${blob.path}`}>
      <div className="repo-code-source-scroll" onScroll={() => setHover(null)}>
        <pre>
          {tokens.slice(startLine - 1, endLine).map((line, index) => {
            const number = startLine + index
            const diagnostics = blob.diagnostics?.filter(item => item.line === number) ?? []
            const active = Boolean(selected && number >= selected.start && number <= selected.end)
            return (
              <span
                key={number}
                className="repo-code-source-line"
                data-line={number}
                id={`repo-code-L${number}`}
                data-selected={active || undefined}
              >
                <Link
                  className="repo-code-line-number"
                  to={lineHref(number)}
                  aria-label={`Select line ${number}`}
                  aria-current={active ? "location" : undefined}
                  onClick={event => handleLine(event, number)}
                  onKeyDown={event => {
                    if (event.key === "Enter" && event.shiftKey) {
                      event.preventDefault()
                      onSelect(number, true)
                    }
                  }}
                >
                  {number}
                </Link>
                <span className="repo-code-diagnostic-gutter">
                  {diagnostics.length > 0 && (
                    <button
                      className="repo-code-gutter-mark"
                      title={`/diagnostics.show ${blob.path}:${number}\n${diagnostics.map(item => item.message).join("\n")}`}
                      aria-label={`${diagnostics[0].severity} on line ${number}: ${diagnostics[0].message}`}
                      onClick={() => onSelect(number)}
                    >
                      !
                    </button>
                  )}
                </span>
                <code
                  className={diagnostics.length ? "repo-code-diagnostic-line" : undefined}
                  tabIndex={diagnostics.length ? 0 : undefined}
                  title={diagnostics.map(item => item.message).join("\n") || undefined}
                  aria-label={diagnostics.length ? diagnostics.map(item => item.message).join(". ") : undefined}
                >
                  {line.length ? line.map((token, tokenIndex) => {
                    const symbol = token.kind === "plain" || token.kind === "type"
                      ? blob.symbols?.find(item => item.name === token.text && item.line === number)
                        ?? blob.symbols?.find(item => item.name === token.text)
                      : undefined
                    return symbol ? (
                      <button
                        key={tokenIndex}
                        className={`repo-code-symbol repo-code-token-${token.kind}`}
                        title={`/code.symbol ${blob.path}:${number} ${symbol.name}`}
                        aria-label={`${symbol.name}: show definition and references`}
                        aria-expanded={hover?.symbol === symbol}
                        onMouseEnter={event => showSymbol(symbol, event.currentTarget)}
                        onMouseLeave={closeSoon}
                        onFocus={event => showSymbol(symbol, event.currentTarget)}
                        onBlur={closeSoon}
                        onClick={event => {
                          showSymbol(symbol, event.currentTarget)
                          setTimeout(() => card.current?.querySelector("a")?.focus(), 0)
                        }}
                      >
                        {token.text}
                      </button>
                    ) : <span className={`repo-code-token-${token.kind}`} key={tokenIndex}>{token.text}</span>
                  }) : " "}
                  {diagnostics.length > 0 && (
                    <span className="repo-code-diagnostic-tip" role="tooltip">
                      {diagnostics.map(item => item.message).join("\n")}
                    </span>
                  )}
                </code>
              </span>
            )
          })}
        </pre>
      </div>
      {hover && definition && createPortal(
        <div
          className="repo-code-symbol-card"
          ref={card}
          role="dialog"
          aria-label={`${hover.symbol.name} symbol`}
          style={{ left: hover.left, top: hover.top }}
          onMouseEnter={keepOpen}
          onMouseLeave={closeSoon}
          onFocus={keepOpen}
          onBlur={closeSoon}
        >
          <code>{signature}</code>
          {documentation.length > 0 && <p>{documentation.join("\n")}</p>}
          <div className="repo-code-symbol-actions">
            <Link to={`${sourceRoute("blob", revision, definition.path)}?L=${definition.line}`}>
              Go to definition
            </Link>
            <Link to={to(`search?q=${encodeURIComponent(`symbol:${hover.symbol.name}`)}`)}>
              Find references
            </Link>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
