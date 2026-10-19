import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

const API = "https://api.github.com"
const iso = (value) => new Date(value).toISOString()
const chunk = (items, n) => Array.from({ length: Math.ceil(items.length / n) }, (_, i) => items.slice(i * n, i * n + n))

export function firstParentCommits(records, head) {
  const bySha = new Map(records.map((r) => [r.commit_id, r]))
  const result = []
  const seen = new Set()
  let sha = head
  while (sha) {
    const r = bySha.get(sha)
    if (!r || seen.has(sha)) throw new Error("incomplete main history")
    seen.add(sha)
    if (!/^0+$/.test(sha)) result.push({ sha, authoredAt: r.author.timestamp, landedAt: r.committer.timestamp, message: r.description })
    sha = r.parents[0]
  }
  // Keep first-parent landings as the denominator, while attributing a merged
  // feature commit (and its original author date) to its first main landing.
  const reachable = new Set()
  for (const landing of [...result].reverse()) {
    const pending = [landing.sha]
    landing.includedCommits = []
    while (pending.length) {
      const sha = pending.pop()
      if (reachable.has(sha)) continue
      const record = bySha.get(sha)
      if (!record) throw new Error("incomplete main history")
      reachable.add(sha)
      if (!/^0+$/.test(sha)) landing.includedCommits.push({ sha, authoredAt: record.author.timestamp, message: record.description })
      pending.push(...record.parents)
    }
  }
  return result
}

export class GitHubReader {
  constructor({ repo, from, to, cacheDir, token = process.env.GITHUB_TOKEN, transport = fetch, progress = () => {} }) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("invalid repository")
    Object.assign(this, { repo, from: iso(from), to: iso(to), cacheDir, token, transport, progress })
    this.pages = new Map()
  }

  async page(path, query) {
    const url = new URL(path, API)
    if (url.origin !== API) throw new Error("refused pagination host")
    const method = query ? "POST" : "GET"
    const body = query ? JSON.stringify({ query }) : undefined
    if (query && !/^query\b/.test(query)) throw new Error("only GraphQL queries are allowed")
    // Reuse only within one frozen observation window. A new daily/manual
    // observation must not silently reuse an older issues page.
    const key = createHash("sha256").update(JSON.stringify([this.repo, this.from, this.to, method, url.href, body])).digest("hex")
    await mkdir(this.cacheDir, { recursive: true, mode: 0o700 })
    const pathOnDisk = join(this.cacheDir, `${key}.json`)
    let cached
    try { cached = JSON.parse(await readFile(pathOnDisk, "utf8")) } catch (error) { if (error.code !== "ENOENT") throw new Error("unreadable raw page cache") }
    if (cached) {
      if (cached.url !== url.href || cached.query !== (query ?? null)) throw new Error("raw page cache identity mismatch")
      this.pages.set(key, { key, url: cached.url, fetchedAt: cached.fetchedAt })
      return cached
    }
    if (!this.token) throw new Error("GITHUB_TOKEN is required for an uncached page")
    this.progress(`${method === "POST" ? "GraphQL query" : "GET"} ${url.pathname}`)
    const response = await this.transport(url.href, {
      method, headers: { Authorization: `Bearer ${this.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(query ? { "Content-Type": "application/json" } : {}) },
      body, redirect: "error", signal: AbortSignal.timeout(60_000)
    })
    if (!response.ok) {
      const retry = response.headers.get("x-ratelimit-reset")
      throw new Error(`GitHub HTTP ${response.status}${retry ? `; retryAt=${new Date(Number(retry) * 1000).toISOString()}` : ""}`)
    }
    const data = await response.json()
    if (data.errors?.length) throw new Error("GitHub GraphQL incomplete response")
    cached = { url: url.href, query: query ?? null, fetchedAt: new Date().toISOString(), link: response.headers.get("link"), data }
    await writeFile(pathOnDisk, JSON.stringify(cached), { mode: 0o600 })
    this.pages.set(key, { key, url: cached.url, fetchedAt: cached.fetchedAt })
    return cached
  }

  async list(path, field, stop) {
    const rows = []
    const seen = new Set()
    let next = path
    while (next) {
      if (seen.has(next) || seen.size >= 2000) throw new Error("pagination did not terminate")
      seen.add(next)
      const page = await this.page(next)
      const items = field ? page.data[field] : page.data
      if (!Array.isArray(items)) throw new Error("GitHub page is not an array")
      rows.push(...items)
      if (stop?.(items)) break
      next = page.link?.match(/<([^>]+)>; rel="next"/)?.[1]
    }
    return rows
  }

  source(name) { return { name, from: this.from, to: this.to, complete: true, count: 0, gaps: [] } }

  async readRequests() {
    const sources = [this.source("issues"), this.source("pulls"), this.source("issue_timeline")]
    let rawIssues = [], rawPulls = []
    try {
      rawIssues = await this.list(`/repos/${this.repo}/issues?state=all&sort=updated&direction=asc&per_page=100&page=1`)
    } catch (error) { sources[0].complete = false; sources[0].reason = safeReason(error) }
    try {
      rawPulls = await this.list(`/repos/${this.repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=1`, undefined,
        (rows) => rows.length > 0 && Date.parse(rows.at(-1).updated_at) < Date.parse(this.from))
    } catch (error) { sources[1].complete = false; sources[1].reason = safeReason(error) }
    const issues = [...new Map(rawIssues.filter((r) => !r.pull_request).map((r) => [r.number, {
      number: r.number, nodeId: r.node_id, url: r.html_url, createdAt: r.created_at, closedAt: r.closed_at,
      stateReason: r.state_reason, firstCommentAt: null
    }])).values()]
    const pulls = [...new Map(rawPulls.filter((r) => r.merged_at && Date.parse(r.merged_at) >= Date.parse(this.from)).map((r) => [r.number, {
      number: r.number, nodeId: r.node_id, url: r.html_url, title: r.title, body: r.body ?? "", createdAt: r.created_at,
      mergedAt: r.merged_at, mergeCommitSha: r.merge_commit_sha
    }])).values()]
    const candidates = issues.filter((r) => r.stateReason === "completed" && r.closedAt && Date.parse(r.closedAt) >= Date.parse(this.from) && Date.parse(r.closedAt) < Date.parse(this.to))
    const timelines = []
    for (const batch of chunk(candidates, 40)) {
      try {
        if (batch.some((r) => !r.nodeId)) throw new Error("missing issue node id")
        const page = await this.page("/graphql", timelineQuery(batch.map((r) => r.nodeId)))
        const nodes = page.data.data?.nodes
        if (!Array.isArray(nodes) || nodes.length !== batch.length) throw new Error("missing timeline nodes")
        for (const issue of batch) {
          const node = nodes.find((r) => r?.id === issue.nodeId)
          if (!node?.timelineItems || !node.comments) throw new Error("missing timeline node")
          const events = [...node.timelineItems.nodes]
          const cursors = new Set()
          let info = node.timelineItems.pageInfo
          while (info.hasNextPage) {
            if (!info.endCursor || cursors.has(info.endCursor)) throw new Error("timeline pagination did not terminate")
            cursors.add(info.endCursor)
            const more = await this.page("/graphql", timelineQuery([issue.nodeId], info.endCursor))
            const next = more.data.data?.nodes?.[0]?.timelineItems
            if (!next) throw new Error("missing timeline page")
            events.push(...next.nodes)
            info = next.pageInfo
          }
          issue.firstCommentAt = node.comments.nodes[0]?.createdAt ?? null
          const commitShas = [], pullNumbers = []
          for (const event of events) {
            if (event.commit?.oid) commitShas.push(event.commit.oid)
            if (event.source?.mergedAt && event.source.repository?.nameWithOwner === this.repo) pullNumbers.push(event.source.number)
          }
          timelines.push({ number: issue.number, commitShas: [...new Set(commitShas)], pullNumbers: [...new Set(pullNumbers)] })
        }
      } catch (error) {
        this.progress(`source_missing: issue_timeline #${batch[0]?.number}..#${batch.at(-1)?.number}; ${safeReason(error)}`)
        sources[2].complete = false
        for (const issue of batch) sources[2].gaps.push({ from: issue.closedAt, to: new Date(Date.parse(issue.closedAt) + 1).toISOString(), issue: issue.number, reason: safeReason(error) })
      }
    }
    // Earliest authored PR commit makes issue links through a PR auditable too.
    for (const batch of chunk(pulls, 40)) {
      try {
        const ids = batch.map((r) => r.nodeId)
        const page = await this.page("/graphql", `query { nodes(ids: ${JSON.stringify(ids)}) { ... on PullRequest { id commits(first: 1) { nodes { commit { authoredDate } } } } } }`)
        for (const pr of batch) {
          const node = page.data.data?.nodes?.find((n) => n?.id === pr.nodeId)
          if (!node?.commits?.nodes?.[0]) throw new Error("missing PR commit date")
          pr.firstAuthoredAt = node.commits.nodes[0].commit.authoredDate
        }
      } catch (error) { sources[1].complete = false; sources[1].reason = safeReason(error) }
    }
    sources[0].count = issues.length
    sources[1].count = pulls.length
    sources[2].count = timelines.length
    if (!sources[0].complete) { sources[2].complete = false; sources[2].reason = "issues unavailable" }
    await this.manifest()
    return { issues, pulls, timelines, sources }
  }

  async readActions() {
    const source = this.source("actions")
    const runs = []
    // GitHub caps a filtered run query at 1,000; subdivide until every page is retrievable.
    const range = async (start, end) => {
      const path = `/repos/${this.repo}/actions/runs?branch=main&created=${encodeURIComponent(`${new Date(start).toISOString()}..${new Date(end - 1).toISOString()}`)}&per_page=100&page=1`
      const first = await this.page(path)
      if (first.data.total_count > 1000) {
        if (end - start <= 1000) throw new Error("Actions range exceeds 1000 even at one second")
        const mid = Math.floor((start + end) / 2000) * 1000
        await range(start, mid)
        await range(mid, end)
      } else {
        const rows = await this.list(path, "workflow_runs")
        if (rows.length < first.data.total_count) throw new Error("Actions run count changed or truncated")
        runs.push(...rows)
      }
    }
    try { await range(Date.parse(this.from) - 7 * 86400000, Date.parse(this.to)) }
    catch (error) { source.complete = false; source.reason = safeReason(error) }
    source.count = new Set(runs.map((r) => r.id)).size
    // API success does not prove deleted runs/90-day retention are complete.
    source.retention = "unknown; successful pagination cannot prove deleted historical runs"
    const requiredSource = this.source("required_checks")
    let required = []
    try {
      const rules = await this.page(`/repos/${this.repo}/rules/branches/main`)
      const protection = await this.page(`/repos/${this.repo}/branches/main/protection/required_status_checks`)
      required = [...new Set([
        ...(protection.data.contexts ?? []), ...(protection.data.checks ?? []).map((r) => r.context),
        ...rules.data.filter((r) => r.type === "required_status_checks").flatMap((r) => r.parameters?.required_status_checks?.map((c) => c.context) ?? [])
      ])].sort()
      if (!required.length) throw new Error("no required checks declared")
    } catch (error) { requiredSource.reason = safeReason(error) }
    requiredSource.complete = false
    requiredSource.count = required.length
    requiredSource.reason ??= "historical required-check configuration unavailable"
    requiredSource.definitionVersion = 1
    requiredSource.observedAt = this.to
    requiredSource.contexts = required
    await this.manifest()
    return { runs: [...new Map(runs.map((r) => [r.id, r])).values()], sources: [source, requiredSource] }
  }

  async manifest() {
    await mkdir(this.cacheDir, { recursive: true, mode: 0o700 })
    await writeFile(join(this.cacheDir, "manifest.json"), JSON.stringify({ repo: this.repo, from: this.from, to: this.to, pages: [...this.pages.values()] }, null, 2), { mode: 0o600 })
  }
}

// Error bodies and token-bearing transport messages never reach diagnostics.
export function safeReason(error) {
  return /^GitHub (HTTP \d{3}(; retryAt=[\dT:Z.-]+)?|GraphQL incomplete response)$/.test(error.message)
    ? error.message : "source read failed (see named stage and cached successful pages)"
}

function timelineQuery(ids, after) {
  return `query { nodes(ids: ${JSON.stringify(ids)}) { ... on Issue {
    id number comments(first: 1) { nodes { createdAt } }
    timelineItems(first: 100${after ? `, after: ${JSON.stringify(after)}` : ""}, itemTypes: [REFERENCED_EVENT, CROSS_REFERENCED_EVENT, CLOSED_EVENT, REOPENED_EVENT]) {
      pageInfo { hasNextPage endCursor }
      nodes { __typename ... on ReferencedEvent { commit { oid } } ... on CrossReferencedEvent { source { ... on PullRequest { number mergedAt repository { nameWithOwner } } } } ... on ClosedEvent { createdAt } ... on ReopenedEvent { createdAt } }
    }
  } } }`
}
