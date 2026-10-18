import { useSyncExternalStore } from "react"
import { MAYA } from "../../../core/catalog"
import { commit, history, issues, MOCK_NOW, people, pull, repo, runs, stack } from "../../fixtures"
import type { Issue, Run, StackItem } from "../../fixtures/types"

type LocalData = { issues: Record<number, Issue>; runs: Run[]; todos: StackItem[] }
const stores = new Map<string, LocalData>()
const listeners = new Set<() => void>()
let revision = 0
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
const snapshot = () => revision
const storageKey = () => `repo-issues-local:${repo.slug}`

/* Local writes survive navigation. Publishing new runs and TODOs into the active fixture arrays lets the
 * other mock families resolve the resulting links through the same fixture API, without changing fixture files. */
const local = (): LocalData => {
  let data = stores.get(repo.slug)
  if (!data) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey()) ?? "null")
      if (saved && saved.issues && Array.isArray(saved.runs) && Array.isArray(saved.todos)) data = saved
    } catch { /* Storage is optional for this session. */ }
    data ??= { issues: {}, runs: [], todos: [] }
    stores.set(repo.slug, data)
  }
  for (const run of data.runs) if (!runs.some(item => item.id === run.id)) runs.unshift(run)
  for (const todo of data.todos) if (!stack.some(item => item.id === todo.id)) stack.unshift(todo)
  return data
}
const publish = () => {
  const data = local()
  try { sessionStorage.setItem(storageKey(), JSON.stringify(data)) } catch { /* Keep the in-memory edit. */ }
  repo.counts.issuesOpen = allIssues().filter(item => item.state === "open").length
  repo.counts.runsActive = runs.filter(item => item.state === "running" || item.state === "waiting" || item.state === "queued").length
  revision += 1
  listeners.forEach(listener => listener())
}
export const allIssues = (): Issue[] => {
  const edits = local().issues
  return [...issues.filter(item => !edits[item.n]), ...Object.values(edits)]
    .sort((a, b) => b.n - a.n)
}
export const useIssues = (): Issue[] => {
  useSyncExternalStore(subscribe, snapshot, snapshot)
  return allIssues()
}
export const saveIssue = (item: Issue) => {
  local().issues[item.n] = item
  publish()
}
export const addIssueComment = (item: Issue, body: string) => {
  if (!body.trim()) return
  saveIssue({ ...item, comments: [...item.comments, { author: MAYA.login, body: body.trim(), date: MOCK_NOW }], updated: MOCK_NOW })
}
export const setIssueClosed = (item: Issue, closed: boolean) => {
  if ((item.state === "closed") === closed) return
  saveIssue({
    ...item, state: closed ? "closed" : "open", updated: MOCK_NOW,
    events: [...item.events, closed
      ? { kind: "closed", actor: MAYA.login, date: MOCK_NOW, reason: "completed" }
      : { kind: "reopened", actor: MAYA.login, date: MOCK_NOW }]
  })
}
export const createIssue = (title: string, body: string, labels: string[], assignees: string[]): Issue => {
  const n = Math.max(0, ...issues.map(item => item.n), ...Object.values(local().issues).map(item => item.n)) + 1
  const item: Issue = {
    n, title, body, author: MAYA.login, state: "open", labels, assignees,
    opened: MOCK_NOW, updated: MOCK_NOW, comments: [], events: [], pulls: []
  }
  saveIssue(item)
  return item
}
export const todoFor = (item: Issue) => stack.find(entry => entry.id === item.todo || entry.issue === item.n)
export const makeCodeTodo = (title: string, source: string) => {
  const entry: StackItem = {
    id: `todo-code-${Date.now()}`, title: `${title} · ${source}`, state: "queued", owner: MAYA.login,
    order: stack.length + 1, updated: MOCK_NOW
  }
  local().todos.push(entry)
  publish()
  return entry
}
export const makeTodo = (item: Issue) => {
  if (todoFor(item)) return
  const entry: StackItem = {
    id: `todo-local-${item.n}`, title: item.title, state: "queued", owner: MAYA.login,
    order: stack.length + 1, issue: item.n, updated: MOCK_NOW
  }
  local().todos.push(entry)
  saveIssue({
    ...item, todo: entry.id, updated: MOCK_NOW,
    events: [...item.events, { kind: "todo", actor: MAYA.login, date: MOCK_NOW, run: "" }]
  })
}
export const startIssueRun = (item: Issue, act: "implement" | "repro"): Run => {
  const running = runs.find(entry => entry.issue === item.n && entry.state === "running" && entry.flow === (act === "implement" ? "implement-issue" : "reproduce-issue"))
  if (running) return running
  const entry: Run = {
    id: `run-local-${item.n}-${act}-${Date.now()}`, flow: act === "implement" ? "implement-issue" : "reproduce-issue",
    title: `${act === "implement" ? "Implement" : "Reproduce"} #${item.n}: ${item.title}`,
    state: "running", trigger: { kind: "issue", by: MAYA.login, ref: String(item.n) },
    harness: "Codex · gpt-6.1-sol", started: MOCK_NOW, duration: "Just started",
    cost: { usd: 0, tokens: 0 }, issue: item.n, branch: `smithers/issue-${item.n}`,
    stages: [{ id: "inspect", label: "Inspect issue", state: "running", started: MOCK_NOW,
      summary: "Reading the issue and repository.", log: [`Opened issue #${item.n}.`] }],
    approvals: [], trace: [{ at: MOCK_NOW, stage: "inspect", kind: "message", text: `Started by ${MAYA.login}.` }]
  }
  local().runs.push(entry)
  saveIssue({ ...item, updated: MOCK_NOW, events: [
    ...item.events, { kind: "run", actor: MAYA.login, date: MOCK_NOW, run: entry.id, state: "running" }
  ] })
  return entry
}
export const landedCommit = (item: Issue) => {
  const sha = item.receipt?.landed?.sha
  if (!sha) return undefined
  const found = commit(sha)
  return found && history(repo.defaultBranch).some(entry => entry.sha === found.sha) ? found : undefined
}
export const fixedByAgents = (item: Issue) => {
  const acceptedOnly = repo.config.home?.some(block => block.type === "fixed-by-agents" && block.acceptedOnly)
  return item.state === "closed" && (!acceptedOnly || Boolean(item.receipt?.accepted)) && Boolean(landedCommit(item)?.agent)
}
export const queueLanded = (item: Issue) => Boolean(item.receipt?.landed && !item.receipt.review
  && stack.some(entry => entry.issue === item.n && entry.state === "merged"))
export const landingLabel = (item: Issue) => {
  const mergedBy = item.receipt?.review ? pull(item.receipt.review.pull)?.merged?.by : undefined
  if (mergedBy && people.some(person => person.login === mergedBy && person.kind === "human")) return `Landed by ${mergedBy}`
  if (!queueLanded(item)) return "On main"
  const approver = stack.find(entry => entry.issue === item.n && entry.state === "merged")?.approver
  return approver && people.some(person => person.login === approver && person.kind === "human") ? `Landed by ${approver}` : "On main"
}
export const receiptStages = (item: Issue) => {
  const receipt = item.receipt
  if (!receipt) return []
  const landed = landedCommit(item)
  return [
    { name: "Reported", date: receipt.reported.date, path: `issues/${item.n}`, evidence: receipt.reported.by },
    { name: "Accepted", date: receipt.accepted?.date, path: `issues/${item.n}?evidence=accepted`, evidence: receipt.accepted?.by },
    { name: "Working", date: receipt.working?.date, path: `runs/${receipt.working?.run}`, evidence: receipt.working?.run },
    { name: "In review", date: receipt.review?.date, path: `pull/${receipt.review?.pull}`, evidence: receipt.review ? `#${receipt.review.pull}` : undefined },
    { name: "Landed", label: landingLabel(item), date: landed ? receipt.landed?.date : undefined, path: `commit/${landed?.sha}`, evidence: landed?.sha.slice(0, 7) }
  ].filter(stage => !queueLanded(item) || Boolean(stage.date && stage.evidence))
}
const latestReceiptStage = (item: Issue) => receiptStages(item).filter(stage => stage.date).at(-1)
export const stageFor = (item: Issue): string | undefined => latestReceiptStage(item)?.name
export const latestReceiptDate = (item: Issue): number => Date.parse(latestReceiptStage(item)?.date ?? item.opened)

/* Quoted values keep labels such as label:"good first issue" useful in the same filter field. */
export const queryTokens = (query: string) => query.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(token => token.replaceAll('"', "")) ?? []
export const matchesIssue = (item: Issue, query: string) => {
  const tokens = queryTokens(query)
  return tokens.every(token => {
    const value = token.toLowerCase()
    if (value === "is:open" || value === "is:closed") return item.state === value.slice(3)
    if (value === "is:todo") return Boolean(todoFor(item))
    if (value === "is:fixed-by-agents") return fixedByAgents(item)
    if (value.startsWith("label:")) return item.labels.some(name => name.toLowerCase() === value.slice(6))
    if (value.startsWith("author:")) return item.author.toLowerCase() === value.slice(7)
    if (value.startsWith("assignee:")) return item.assignees.some(login => login.toLowerCase() === value.slice(9))
    if (value.startsWith("sort:")) return true
    return `${item.title} ${item.body} #${item.n}`.toLowerCase().includes(value)
  })
}
export const updateQuery = (query: string, key: string, value: string) => {
  const filtered = query.match(/(?:[^\s"]+|"[^"]*")+/g)?.filter(token =>
    key === "state" ? !/^is:(open|closed)$/.test(token) : !token.startsWith(`${key}:`)
  ) ?? []
  if (value) filtered.push(key === "state" ? `is:${value}` : `${key}:${value.includes(" ") ? `"${value}"` : value}`)
  return filtered.join(" ")
}
