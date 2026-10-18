/* <CodeView code={blob.content} path? startLine? selectedLine?/> renders every line.
 * Line ids are L<n>. Links use ?L=<n> because the mock router owns the URL hash. Shift-click selects a range. */
import { useEffect, useState } from "react"
import { navigate, useLocation } from "../../core/router"
export const CodeView = ({ code, content, path, startLine = 1, selectedLine }: { code?: string; content?: string; path?: string; startLine?: number; selectedLine?: number }) => {
  const location = useLocation()
  const [first, setFirst] = useState<number | null>(null)
  const [last, setLast] = useState<number | null>(null)
  useEffect(() => { setFirst(null); setLast(null) }, [path])
  const query = new URLSearchParams(location.split("?")[1] ?? "")
  const selected = selectedLine ?? Number(query.get("L")?.split("-")[0] ?? 0)
  const end = last ?? Number(query.get("L")?.split("-")[1] ?? selected)
  const lines = (code ?? content ?? "").replace(/\n$/, "").split("\n")
  const numberWidth = `calc(${String(startLine + lines.length - 1).length}ch + 12px)`
  return <div className="repo-ui-code" aria-label={path ?? "Source code"}><div className="repo-ui-code-scroll"><pre>{lines.map((text, i) => {
    const n = i + startLine
    const start = first ?? selected
    const active = n >= Math.min(start, end) && n <= Math.max(start, end)
    const nextQuery = new URLSearchParams(query)
    nextQuery.set("L", String(n))
    return <span className="repo-ui-code-line" id={`L${n}`} key={n} data-selected={active || undefined}><a style={{ width: numberWidth, flexBasis: numberWidth, paddingInline: 6, boxSizing: "border-box" }} aria-label={`Line ${n}`} href={`#/${location.split("?")[0]}?${nextQuery}`} onClick={event => {
      event.preventDefault()
      const from = event.shiftKey && first !== null ? first : n
      setFirst(from); setLast(n)
      nextQuery.set("L", from === n ? String(n) : `${Math.min(from, n)}-${Math.max(from, n)}`)
      navigate(`${location.split("?")[0]}?${nextQuery}`, { replace: true })
    }}>{n}</a><code>{text || " "}</code></span>
  })}</pre></div></div>
}
