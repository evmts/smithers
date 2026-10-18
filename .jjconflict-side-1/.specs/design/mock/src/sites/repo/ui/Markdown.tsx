/* Repository Markdown keeps the app's block renderer and substitutes a small HTML allowlist as React nodes.
 * No fixture HTML or attributes reach innerHTML. Relative links and images resolve through the fixture API. */
import { cloneElement, Fragment, isValidElement, type ReactNode } from "react"
import { CodeBlock, Markdown as AppMarkdown, type LinkResolver } from "../../app/lib"
import { Link } from "../../core/router"
import { file, repo, to } from "../fixtures"
import { stripFrontmatter } from "./markdown-source"
import { markdownTables } from "./markdown-tables"
import { markdownAlerts, type AlertKind } from "./markdown-alerts"

const entities: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0",
  copy: "©", reg: "®", trade: "™", hellip: "…", ndash: "–", mdash: "—"
}
const decode = (value: string) => value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
  if (!name.startsWith("#")) return entities[name] ?? entity
  const point = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1))
  return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : "�"
})

const resolver = (base: string): LinkResolver => href => {
  if (!href.trim()) return { kind: "text" }
  if (/^(https?:|mailto:)/i.test(href)) return { kind: "external", href }
  if (href.startsWith("wiki:")) return { kind: "route", to: to(`wiki/${href.slice(5)}`) }
  if (href.startsWith("smithers.sh/")) return { kind: "route", to: href }
  if (href.startsWith("#") || /^[\w+.-]+:/.test(href) || href.startsWith("//")) return { kind: "text" }
  if (/^(wiki|docs)\//.test(href)) return { kind: "route", to: to(href.replace(/\.md(?=$|[?#])/, "")) }
  if (/^(issues|pull|pulls|runs|flows|releases|settings|tree|blob|commit)\//.test(href)) return { kind: "route", to: to(href) }
  const path = href.replace(/^\.\//, "").replace(/^\//, "")
  if (!path) return { kind: "text" }
  return { kind: "route", to: to(base ? `${base}/${path.replace(/\.md$/, "")}` : `blob/${repo.defaultBranch}/${path}`) }
}

interface Html {
  tag: string
  attrs: Record<string, string>
  body: string
  end: number
}
const tagPattern = /<\/?[a-z][\w:-]*(?=[\s/>])(?:[^<>"']|"[^"]*"|'[^']*')*>/gi
const voidTags = new Set(["img", "br", "source", "hr", "input", "meta", "link", "wbr", "area", "base", "col", "embed", "param", "track"])

const readHtml = (source: string, start: number): Html | undefined => {
  const opening = new RegExp(tagPattern.source, "iy"); opening.lastIndex = start
  const match = opening.exec(source)
  if (!match || match[0].startsWith("</")) return undefined
  const tag = /^<([\w:-]+)/.exec(match[0])![1].toLowerCase()
  const attrs: Record<string, string> = {}
  for (const attr of match[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attrs[attr[1].toLowerCase()] = decode(attr[2] ?? attr[3] ?? attr[4])
  }
  const end = opening.lastIndex
  if (voidTags.has(tag) || /\/\s*>$/.test(match[0])) return { tag, attrs, body: "", end }
  const tags = new RegExp("<!--[\\s\\S]*?(?:-->|$)|" + tagPattern.source, "gi"); tags.lastIndex = end
  let depth = 1
  let next: RegExpExecArray | null
  while ((next = tags.exec(source))) {
    if (next[0].startsWith("<!--")) continue
    if (/^<\/?([\w:-]+)/.exec(next[0])![1].toLowerCase() !== tag) continue
    if (next[0].startsWith("</")) depth--
    else if (!/\/\s*>$/.test(next[0])) depth++
    if (!depth) return { tag, attrs, body: source.slice(end, next.index), end: tags.lastIndex }
  }
  // Unclosed/unknown wrappers disappear; their following text is still parsed normally.
  return { tag, attrs, body: "", end }
}

const image = (src: string, alt: string, base: string): ReactNode => {
  const path = src.replace(/^\.\//, "").replace(/^\//, "").split(/[?#]/)[0]
  const blob = file(path) ?? (base ? file(`${base}/${path}`) : undefined)
  if (!blob) return alt
  const data = /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[\da-z+/=\s]+$/i.test(blob.content)
    ? blob.content : /\.svg$/i.test(path) && /^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(blob.content)
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(blob.content)}` : undefined
  return data ? <img src={data} alt={alt} style={{ maxWidth: "100%", height: "auto" }} /> : alt
}

const inlineChildren = (tree: ReactNode): ReactNode => {
  if (Array.isArray(tree)) return tree.map((child, i) => <Fragment key={i}>{inlineChildren(child)}</Fragment>)
  if (!isValidElement<{ children?: ReactNode }>(tree)) return tree
  return tree.type === "div" || tree.type === "p" ? inlineChildren(tree.props.children) : tree
}

const renderHtml = ({ tag, attrs, body }: Html, base: string): ReactNode => {
  const content = () => inlineChildren(markdownTree(body, base, false, true))
  if (tag === "source") return null
  if (tag === "img") return image(attrs.src ?? "", attrs.alt ?? "", base)
  if (tag === "br") return <br />
  if (tag === "pre") {
    const text = decode(body.replace(/<!--[\s\S]*?-->/g, "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "")).replace(/^\r?\n/, "")
    const centered = attrs.align?.toLowerCase() === "center"
    return <pre style={{ textAlign: centered ? "center" : undefined, maxWidth: "100%", boxSizing: "border-box" }}><code style={{ display: "block", width: "max-content", marginInline: centered ? "auto" : undefined, textAlign: "left" }}>{text}</code></pre>
  }
  if (tag === "p") return <p style={{ textAlign: attrs.align?.toLowerCase() === "center" ? "center" : undefined }}>{content()}</p>
  if (tag === "strong") return <strong>{content()}</strong>
  if (tag === "em") return <em>{content()}</em>
  if (tag === "code") return <code>{decode(body.replace(/<[^>]*>/g, ""))}</code>
  if (tag === "a") {
    const href = attrs.href ?? ""
    const link = resolver(base)(href.replace(/[\u0000-\u0020\u007f]/g, ""))
    return link.kind === "route" ? <Link to={link.to}>{content()}</Link>
      : link.kind === "external" ? <a href={link.href} target="_blank" rel="noopener noreferrer">{content()}</a> : content()
  }
  // picture is a transparent wrapper; all other unsupported tags keep only their text/approved children.
  return content()
}

const alertIcons: Record<AlertKind, ReactNode> = {
  NOTE: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  TIP: <><path d="M9 18h6M10 21h4M8 13a6 6 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z" /></>,
  IMPORTANT: <><path d="M5 3h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-8l-6 4v-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M12 7v4M12 14h.01" /></>,
  WARNING: <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5M12 17h.01" /></>,
  CAUTION: <><path d="m8 2-6 6v8l6 6h8l6-6V8l-6-6H8Z" /><path d="M12 7v6M12 17h.01" /></>
}

const markdownTree = (source: string, base: string, dense = false, htmlText = false): ReactNode => {
  const nodes = new Map<string, { node: ReactNode; block: boolean }>()
  // Pick delimiters absent from the source so ordinary prose cannot inject a placeholder.
  let prefix = "\ue000repo-html-"
  while (source.includes(prefix)) prefix += "-"
  const marker = (node: ReactNode, block: boolean) => {
    const key = `${prefix}${nodes.size}\ue001`
    nodes.set(key, { node, block })
    return block ? `\n\n${key}\n\n` : key
  }
  source = markdownAlerts(source, (kind, body) => marker(
    <aside className="repo-ui-markdown-alert" data-kind={kind.toLowerCase()}>
      <strong className="repo-ui-markdown-alert-label">
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{alertIcons[kind]}</svg>
        {kind[0] + kind.slice(1).toLowerCase()}
      </strong>
      {markdownTree(body, base, dense)}
    </aside>, true))
  source = markdownTables(source, ({ headers, align, rows }) => marker(
    <div className="repo-ui-markdown-table" tabIndex={0} role="region" aria-label={headers.join(" · ")}>
      <table>
        <thead><tr>{headers.map((cell, i) => <th key={i} scope="col" style={{ textAlign: align[i] }}>{inlineChildren(markdownTree(cell, base))}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} style={{ textAlign: align[j] }}>{inlineChildren(markdownTree(cell, base))}</td>)}</tr>)}</tbody>
      </table>
    </div>, true))
  const tokens = new RegExp("```[\\s\\S]*?(?:```|$)|`[^`\\n]+`|<!--[\\s\\S]*?(?:-->|$)|!\\[([^\\]]*)\\]\\(([^)]+)\\)|" + tagPattern.source, "gi")
  let prepared = "", cursor = 0
  let match: RegExpExecArray | null
  while ((match = tokens.exec(source))) {
    prepared += source.slice(cursor, match.index)
    const token = match[0]
    if (/^```(?:vibe|effeck)\s*\n/i.test(token)) {
      const code = token.replace(/^```[^\n]*\n/, "").replace(/\n?```$/, "")
      prepared += marker(<div className="repo-docs-code"><div className="repo-docs-code-toolbar"><span>VibeLang</span></div><CodeBlock code={code} /></div>, true)
    }
    else if (token.startsWith("`")) prepared += token
    else if (token.startsWith("![")) prepared += marker(image(match[2], match[1], base), false)
    else if (!token.startsWith("<!--") && !token.startsWith("</")) {
      const html = readHtml(source, match.index)!
      const block = /^(pre|p|div|section|article|details|table|picture)$/.test(html.tag)
      prepared += marker(renderHtml(html, base), block)
      tokens.lastIndex = html.end
    }
    cursor = tokens.lastIndex
  }
  prepared += source.slice(cursor)
  const restore = (tree: ReactNode): ReactNode => {
    if (typeof tree === "string") return tree.split(new RegExp(`(${prefix}\\d+\ue001)`)).map((part, i) =>
      nodes.has(part) ? <Fragment key={i}>{nodes.get(part)!.node}</Fragment> : htmlText ? decode(part) : part)
    if (Array.isArray(tree)) return tree.map(restore)
    if (!isValidElement<{ children?: ReactNode }>(tree)) return tree
    const child = tree.props.children
    const only = typeof child === "string" ? child : Array.isArray(child) && child.length === 1 && typeof child[0] === "string" ? child[0] : ""
    if (tree.type === "p" && nodes.get(only.trim())?.block) {
      return <Fragment key={tree.key}>{nodes.get(only.trim())!.node}</Fragment>
    }
    return cloneElement(tree, undefined, restore(child))
  }
  // AppMarkdown is a pure renderer. Preserve its blocks, link behavior and highlighted code fences.
  return restore(AppMarkdown({ source: prepared, dense, resolve: resolver(base) }))
}

export const Markdown = ({ source, children, base = "", dense = false }: { source?: string; children?: string; base?: string; dense?: boolean }) =>
  <div className="repo-ui-markdown">{markdownTree(stripFrontmatter(source ?? children ?? ""), base, dense)}</div>
