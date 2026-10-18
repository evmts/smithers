/*
 * A mini markdown renderer for the docs pages: headings, paragraphs, fenced code, lists, tables, callouts,
 * and inline code/bold/links. Links resolve through `link(href)`: a mock route (Link) or an external URL
 * (target="_blank"). Every docs page's source is trimmed real content; this renders the subset it uses.
 */
import { useLayoutEffect, useRef, type ReactNode } from "react"
import { Link } from "../core/router"
import { CodeBlock } from "./highlight"
import { CodeScroll } from "./ui"

export type LinkTarget = { kind: "route"; to: string } | { kind: "external"; href: string }
export type ResolveLink = (href: string) => LinkTarget

export interface DocsSection { id: string; title: string }

/** Drop only a repeated leading title; leave headings in code fences untouched. */
export const stripLeadingTitle = (md: string, title: string): string => {
  const heading = md.match(/^\s*# ([^\n]+)\r?\n(?:\s*\n)*/)
  return heading && heading[1].trim().toLowerCase() === title.trim().toLowerCase()
    ? md.slice(heading[0].length) : md
}

const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

/** Keep prose tokens intact unless their natural width exceeds the available line. */
const InlineCode = ({ text }: { text: string }) => {
  const ref = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const code = ref.current
    const container = code?.parentElement
    if (!code || !container || code.closest("table")) return
    const measure = () => {
      code.style.whiteSpace = "nowrap"
      const available = container.clientWidth - parseFloat(getComputedStyle(container).paddingLeft) - parseFloat(getComputedStyle(container).paddingRight)
      code.style.whiteSpace = code.getBoundingClientRect().width > available ? "normal" : "nowrap"
    }
    measure()
    let active = true
    // Happy DOM (the frame tests) has no FontFaceSet.
    void (document.fonts?.ready ?? Promise.resolve()).then(() => { if (active) measure() })
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => { active = false; observer.disconnect() }
  }, [text])
  return <code ref={ref} className="front-inline-code">{text}</code>
}

const renderInline = (text: string, link: ResolveLink): ReactNode => {
  const out: Array<ReactNode> = []
  const RE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = RE.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index))
    const [whole, code, bold, anchor] = match
    key += 1
    if (code !== undefined) out.push(<InlineCode key={key} text={code.slice(1, -1)} />)
    else if (bold !== undefined) out.push(<strong key={key}>{bold.slice(2, -2)}</strong>)
    else if (anchor !== undefined) {
      const labelEnd = whole.indexOf("](")
      const label = whole.slice(1, labelEnd)
      const href = whole.slice(labelEnd + 2, -1)
      const target = link(href)
      out.push(target.kind === "route"
        ? <Link key={key} to={target.to} className="front-doc-link">{label}</Link>
        : <a key={key} href={target.href} target="_blank" rel="noopener noreferrer" className="front-doc-link">{label}</a>)
    }
    last = match.index + whole.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

interface Block { kind: "h2" | "h3" | "p" | "code" | "ul" | "ol" | "quote" | "table"; text?: string; lang?: string; items?: Array<string>; rows?: Array<Array<string>> }

const parse = (md: string): Array<Block> => {
  const lines = md.split("\n")
  const blocks: Array<Block> = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === "") { i += 1; continue }
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim()
      const body: Array<string> = []
      i += 1
      while (i < lines.length && !lines[i].startsWith("```")) { body.push(lines[i]); i += 1 }
      i += 1
      blocks.push({ kind: "code", lang, text: body.join("\n") })
      continue
    }
    if (line.startsWith("## ")) { blocks.push({ kind: "h2", text: line.slice(3) }); i += 1; continue }
    if (line.startsWith("### ")) { blocks.push({ kind: "h3", text: line.slice(4) }); i += 1; continue }
    if (line.startsWith("> ")) {
      const body: Array<string> = []
      while (i < lines.length && lines[i].startsWith("> ")) { body.push(lines[i].slice(2)); i += 1 }
      blocks.push({ kind: "quote", text: body.join(" ") })
      continue
    }
    if (line.startsWith("|")) {
      const rows: Array<Array<string>> = []
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i].split("|").slice(1, -1).map(cell => cell.trim())
        if (!cells.every(cell => /^-+$/.test(cell.replace(/:/g, "")))) rows.push(cells)
        i += 1
      }
      blocks.push({ kind: "table", rows })
      continue
    }
    if (/^- /.test(line)) {
      const items: Array<string> = []
      while (i < lines.length && /^- /.test(lines[i])) { items.push(lines[i].slice(2)); i += 1 }
      blocks.push({ kind: "ul", items })
      continue
    }
    if (/^\d+\. /.test(line)) {
      const items: Array<string> = []
      while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(lines[i].replace(/^\d+\. /, "")); i += 1 }
      blocks.push({ kind: "ol", items })
      continue
    }
    const para: Array<string> = []
    while (i < lines.length && lines[i].trim() !== "" && !/^(## |### |> |\||- |\d+\. |```)/.test(lines[i])) { para.push(lines[i]); i += 1 }
    blocks.push({ kind: "p", text: para.join(" ") })
  }
  return blocks
}

/** The h2 sections of a page, for the "On this page" rail. */
export const sectionsOf = (md: string): Array<DocsSection> =>
  parse(md).filter(block => block.kind === "h2").map(block => ({ id: slugify(block.text ?? ""), title: block.text ?? "" }))

export const Markdown = ({ md, link }: { md: string; link: ResolveLink }) => (
  <>
    {parse(md).map((block, i) => {
      switch (block.kind) {
        case "h2": return <h2 key={i} id={slugify(block.text ?? "")} className="front-doc-h2">{renderInline(block.text ?? "", link)}</h2>
        case "h3": return <h3 key={i} className="front-doc-h3">{renderInline(block.text ?? "", link)}</h3>
        case "p": return <p key={i} className="front-doc-p">{renderInline(block.text ?? "", link)}</p>
        case "code": return <CodeBlock key={i} code={block.text ?? ""} language={block.lang} />
        case "quote": {
          const warning = (block.text ?? "").startsWith("**Warning:**")
          return <p key={i} className={warning ? "front-callout front-callout-warning" : "front-callout"} role="note">{renderInline(block.text ?? "", link)}</p>
        }
        case "ul": return <ul key={i} className="front-doc-list">{block.items!.map((item, j) => <li key={j}>{renderInline(item, link)}</li>)}</ul>
        case "ol": return <ol key={i} className="front-doc-list">{block.items!.map((item, j) => <li key={j}>{renderInline(item, link)}</li>)}</ol>
        case "table": {
          const [head, ...body] = block.rows!
          return (
            <CodeScroll key={i} table><div className="front-doc-tablewrap">
              <table className="front-doc-table">
                <thead><tr>{head.map((cell, j) => <th key={j}>{renderInline(cell, link)}</th>)}</tr></thead>
                <tbody>{body.map((row, j) => <tr key={j}>{row.map((cell, k) => <td key={k}><span className="front-doc-field-label" aria-hidden="true">{renderInline(head[k] ?? "", link)}</span><span>{renderInline(cell, link)}</span></td>)}</tr>)}</tbody>
              </table>
            </div></CodeScroll>
          )
        }
      }
    })}
  </>
)
