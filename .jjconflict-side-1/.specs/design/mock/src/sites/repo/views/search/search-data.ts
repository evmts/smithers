import { commits, docs, file, issues, pulls, repo, runs, to, tree, wiki } from "../../fixtures"
import type { AgentMark, FileBlob } from "../../fixtures/types"

export type Subject = "code" | "commits" | "issues" | "pulls" | "runs" | "wiki" | "docs"
export const subjects: Array<{ key: Subject; label: string; icon: string }> = [
  { key: "code", label: "Code", icon: "file" },
  { key: "commits", label: "Commits", icon: "change" },
  { key: "issues", label: "Issues", icon: "issue" },
  { key: "pulls", label: "Pull requests", icon: "change" },
  { key: "runs", label: "Runs", icon: "clock" },
  { key: "wiki", label: "Wiki", icon: "file" },
  { key: "docs", label: "Docs", icon: "file" }
]
export type MatchLine = { number: number; text: string; target?: string; detail?: string }
export type SearchResult = {
  id: string
  subject: Subject
  title: string
  target: string
  excerpt: string
  state?: string
  author?: string
  date?: string
  number?: number
  labels?: string[]
  agent?: AgentMark
  lines?: MatchLine[]
}
export type SearchIndex = Record<Subject, SearchResult[]>

export const searchMode = (query: string) => {
  const match = query.match(/^(symbol|ref):\s*(.*)$/i)
  return { kind: match?.[1].toLowerCase() ?? "text", term: (match?.[2] ?? query).trim() }
}

export const searchSubject = (value: string | null): Subject => {
  if (["pull", "pr", "pullrequests", "pull_requests", "pull-requests"].includes(value ?? "")) return "pulls"
  return subjects.some(subject => subject.key === value) ? value as Subject : "code"
}

export const plainText = (text: string) => text
  .replace(/^---\n[\s\S]*?\n---\n/, "")
  .replace(/```\w*\n|```/g, "")
  .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
  .replace(/[#*`>|]/g, "")
  .replace(/\s+/g, " ")
  .trim()

export const excerptAt = (body: string, query: string): string => {
  const text = plainText(body)
  const at = text.toLowerCase().indexOf(query.toLowerCase())
  const start = Math.max(0, at - 65)
  const end = Math.min(text.length, Math.max(190, at + query.length + 100))
  return `${start ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`
}

export const identifierUses = (text: string, name: string): boolean => {
  if (!name) return false
  const haystack = text.toLowerCase()
  const needle = name.toLowerCase()
  let at = haystack.indexOf(needle)
  while (at !== -1) {
    const before = text[at - 1] ?? ""
    const after = text[at + name.length] ?? ""
    if (!/[\w$]/.test(before) && !/[\w$]/.test(after)) return true
    at = haystack.indexOf(needle, at + 1)
  }
  return false
}

const blobTarget = (path: string, line?: number) =>
  to(`blob/${encodeURIComponent(repo.defaultBranch)}/${path}${line ? `?L=${line}` : ""}`)

const codeMatches = (blob: FileBlob, query: string): MatchLine[] => {
  const { kind, term } = searchMode(query)
  const lines = blob.content.split("\n")
  if (kind === "symbol") {
    return (blob.symbols ?? [])
      .filter(symbol => symbol.name.toLowerCase().includes(term.toLowerCase()))
      .map(symbol => ({
        number: symbol.line,
        text: lines[symbol.line - 1] ?? symbol.name,
        detail: `${symbol.kind} · ${symbol.name}`,
        target: symbol.definition ? blobTarget(symbol.definition.path, symbol.definition.line) : undefined
      }))
  }
  return lines.flatMap((text, i) => {
    const matches = kind === "ref" ? identifierUses(text, term) : text.toLowerCase().includes(term.toLowerCase())
    return matches ? [{ number: i + 1, text }] : []
  })
}

/** All fixture reads stay inside the function, so the index follows the selected repository. */
export const searchFixtures = (query: string, empty = false): SearchIndex => {
  const index: SearchIndex = { code: [], commits: [], issues: [], pulls: [], runs: [], wiki: [], docs: [] }
  if (empty || !query.trim()) return index
  const mode = searchMode(query)
  const contains = (value: string) => value.toLowerCase().includes(mode.term.toLowerCase())
  for (const entry of tree) {
    if (entry.kind !== "file") continue
    const blob = file(entry.path)
    if (!blob) continue
    const lines = codeMatches(blob, query)
    if (!lines.length && !(mode.kind === "text" && contains(blob.path))) continue
    index.code.push({
      id: blob.path, subject: "code", title: blob.path,
      target: blobTarget(blob.path, lines[0]?.number), excerpt: "", lines
    })
  }
  if (mode.kind !== "text") return index
  for (const item of commits) {
    const body = `${item.title}\n${item.body ?? ""}\n${item.sha}\n${item.files.map(changed => changed.lines.map(line => line.text).join("\n")).join("\n")}`
    if (contains(body)) index.commits.push({
      id: item.sha, subject: "commits", title: item.title, target: to(`commit/${item.sha}`),
      excerpt: excerptAt(body, query), author: item.author, date: item.date, agent: item.agent
    })
  }
  for (const item of issues) {
    const body = `${item.title}\n${item.body}\n${item.comments.map(comment => comment.body).join("\n")}`
    if (contains(body)) index.issues.push({
      id: String(item.n), subject: "issues", title: item.title, target: to(`issues/${item.n}`),
      excerpt: excerptAt(item.body, query), state: item.state, number: item.n,
      author: item.author, date: item.opened, labels: item.labels
    })
  }
  for (const item of pulls) {
    const body = `${item.title}\n${item.body}\n${item.comments.map(comment => comment.body).join("\n")}`
    if (contains(body)) index.pulls.push({
      id: String(item.n), subject: "pulls", title: item.title, target: to(`pull/${item.n}`),
      excerpt: excerptAt(item.body, query), state: item.state, number: item.n,
      author: item.author, date: item.opened, labels: item.labels, agent: item.agent
    })
  }
  for (const item of runs) {
    const body = [item.title, item.flow, item.id, item.failure?.reason ?? "",
      ...item.stages.flatMap(stage => [stage.label, stage.summary, ...stage.log]),
      ...item.trace.map(event => event.text)].join("\n")
    if (contains(body)) index.runs.push({
      id: item.id, subject: "runs", title: item.title, target: to(`runs/${item.id}`),
      excerpt: excerptAt(body, query), state: item.state, author: item.trigger.by, date: item.started
    })
  }
  for (const item of wiki) {
    if (contains(`${item.title}\n${item.body}`)) index.wiki.push({
      id: item.slug, subject: "wiki", title: item.title, target: to(`wiki/${item.slug}`),
      excerpt: excerptAt(item.body, query), author: item.author, date: item.updated,
      agent: item.provenance.run ? {
        run: item.provenance.run, flow: "wiki", harness: "", for: item.author
      } : undefined
    })
  }
  for (const item of docs) {
    if (contains(`${item.title}\n${item.body}`)) index.docs.push({
      id: item.slug, subject: "docs", title: item.title, target: to(`docs/${item.slug}`),
      excerpt: excerptAt(item.body, query)
    })
  }
  return index
}
