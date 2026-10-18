// Pure definitions: no filesystem, process, clock or network access.
export const HOUR = 3_600_000
export const WEEK = 168 * HOUR
export const DEFINITION = Object.freeze({
  definitionVersion: 1,
  unit: "completed issue with a main landing, or an unlinked merged PR",
  request_lead_time: "created to final completed closure, grouped by closure UTC Monday; unlinked PR uses opened to merged",
  quantile: "nearest rank: sorted[ceil(p*n)-1]",
  mainHistory: "main@origin first-parent landings; merged ancestors retain their original authored timestamps and references; committer timestamp approximates landing time",
  paperwork: "linked fix authored before issue creation, or closure under 10 minutes with no comment before closure",
  excluded: "direct-to-main commits with no issue or PR; non-completed issues; duplicate issue/PR references",
  pair: "change_failure_rate (not computed in this skeleton)",
  main_red_time: "failed whole UTC hours / all whole UTC hours; each hour requires an unchanged known state of every versioned required check on the latest main commit; all other hours unknown",
  requiredChecks: "v1: current GitHub required contexts/workflows; historical configuration is unknown before observedAt",
  successRule: {
    authority: "CEO ruling 4, 2026-10-17",
    medianRequestLeadTimeReductionAtLeast: 0.2,
    differenceInDifferencesConfidence: 0.95,
    differenceInDifferencesIntervalExcludes: 0,
    changeFailureRateRiseRuledOutAbove: 0.02,
    publicClaimMinimumOptedInProjects: 5,
    publicClaimMinimumPostT0Weeks: 12,
    status: "pending", evaluated: false
  },
  interpretation: "Smithers has no clean before period; pipeline evidence only, no causal claim."
})

export function weekStart(date) {
  const value = new Date(date)
  value.setUTCHours(0, 0, 0, 0)
  value.setUTCDate(value.getUTCDate() - (value.getUTCDay() + 6) % 7)
  return value.toISOString()
}

export function window26(now) {
  const from = new Date(Date.parse(weekStart(now)) - 25 * WEEK).toISOString()
  return { from, to: new Date(now).toISOString() }
}

const within = (date, from, to) => Date.parse(date) >= Date.parse(from) && Date.parse(date) < Date.parse(to)
const intersects = (a, b, c, d) => Date.parse(a) < Date.parse(d) && Date.parse(c) < Date.parse(b)
const ratio = (n, d) => d ? n / d : null
const quantile = (values, p) => values[Math.ceil(values.length * p) - 1]

export function references(message, repo = "smithersai/smithers") {
  const result = new Set()
  // A bare # cannot be part of another repo's qualified reference (plue#123).
  for (const match of message.matchAll(/(?<![\w/])#(\d+)\b/g)) result.add(Number(match[1]))
  const escaped = repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  for (const match of message.matchAll(new RegExp(`(?:\\b${escaped}#|https://github\\.com/${escaped}/(?:issues|pull)/)(\\d+)\\b`, "g"))) {
    result.add(Number(match[1]))
  }
  return [...result]
}

export function referenceForms(commits) {
  const rules = {
    parenthesized: /\(#\d+\)/,
    closingVerb: /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:issue\s+)?#\d+/i,
    bareHash: /(?<![\w/])#\d+/,
    qualified: /smithersai\/smithers#\d+/,
    url: /https:\/\/github\.com\/smithersai\/smithers\/(?:issues|pull)\/\d+/
  }
  return Object.fromEntries(Object.entries(rules).map(([name, regex]) => [name, {
    count: commits.filter((c) => regex.test(c.message)).length,
    examples: commits.filter((c) => regex.test(c.message)).slice(0, 3).map((c) => ({ sha: c.sha, subject: c.message.split("\n")[0] }))
  }]))
}

export function missingSources(sources, names, from, to) {
  return names.filter((name) => {
    const source = sources.find((s) => s.name === name)
    if (!source || Date.parse(source.from) > Date.parse(from) || Date.parse(source.to) < Date.parse(to)) return true
    if (source.complete) return false
    return !source.gaps?.length || source.gaps.some((g) => intersects(g.from, g.to, from, to))
  })
}

export function deliveredRequests(input) {
  const { repo, issues, commits, pulls = [], timelines = [] } = input
  const reachableCommits = commits.flatMap((c) => (c.includedCommits ?? [c]).map((member) => ({ ...member, landingSha: c.sha, landedAt: c.landedAt })))
  const bySha = new Map(reachableCommits.map((c) => [c.sha, c]))
  const byIssue = new Map(issues.map((i) => [i.number, i]))
  const issueLinks = new Map()
  const link = (number, commit) => {
    if (!byIssue.has(number) || !commit) return
    const linked = issueLinks.get(number) ?? new Map()
    linked.set(commit.sha, commit)
    issueLinks.set(number, linked)
  }
  for (const c of reachableCommits) for (const number of references(c.message, repo)) link(number, c)
  // Timeline links are admitted only when the linked commit really is on main.
  for (const timeline of timelines) {
    for (const sha of timeline.commitShas ?? []) link(timeline.number, bySha.get(sha))
  }
  const representedPulls = new Set()
  for (const pr of pulls) {
    const commit = bySha.get(pr.mergeCommitSha)
    if (!commit || !pr.mergedAt) continue
    const numbers = new Set(references(`${pr.title}\n${pr.body}`, repo))
    for (const t of timelines) if (t.pullNumbers?.includes(pr.number)) numbers.add(t.number)
    for (const n of numbers) {
      link(n, { ...commit, authoredAt: pr.firstAuthoredAt ?? commit.authoredAt })
      if (byIssue.has(n)) representedPulls.add(pr.number)
    }
    if ([...(issueLinks.values())].some((links) => links.has(commit.sha))) representedPulls.add(pr.number)
  }
  const requests = []
  for (const issue of issues) {
    const links = [...(issueLinks.get(issue.number)?.values() ?? [])]
    if (issue.stateReason !== "completed" || !issue.closedAt || !links.length) continue
    const hours = (Date.parse(issue.closedAt) - Date.parse(issue.createdAt)) / HOUR
    if (!Number.isFinite(hours) || hours < 0) throw new Error(`invalid issue dates: #${issue.number}`)
    const authoredBefore = links.some((c) => Date.parse(c.authoredAt) < Date.parse(issue.createdAt))
    const noComment = !issue.firstCommentAt || Date.parse(issue.firstCommentAt) > Date.parse(issue.closedAt)
    const paperwork = authoredBefore || (hours < 1 / 6 && noComment)
    requests.push({
      kind: "issue", number: issue.number, url: issue.url, createdAt: issue.createdAt, closedAt: issue.closedAt,
      linkedCommit: links.sort((a, b) => Date.parse(a.authoredAt) - Date.parse(b.authoredAt))[0].sha,
      leadTimeHours: hours, paperwork,
      paperworkReason: authoredBefore ? "authored_before_issue" : paperwork ? "under_10_minutes_no_comment" : null
    })
  }
  for (const pr of pulls) {
    if (!pr.mergedAt || !bySha.has(pr.mergeCommitSha) || representedPulls.has(pr.number)) continue
    requests.push({ kind: "pull", number: pr.number, url: pr.url, createdAt: pr.createdAt, closedAt: pr.mergedAt,
      linkedCommit: pr.mergeCommitSha, leadTimeHours: (Date.parse(pr.mergedAt) - Date.parse(pr.createdAt)) / HOUR,
      paperwork: false, paperworkReason: null })
  }
  const issueLinked = new Set([...issueLinks.values()].flatMap((links) => [...links.keys()]))
  const pullLinked = new Set(pulls.filter((p) => p.mergedAt).map((p) => p.mergeCommitSha))
  const excludedDirect = commits.filter((c) => (c.includedCommits ?? [c]).every((member) => !issueLinked.has(member.sha) && !pullLinked.has(member.sha)))
  return { requests: requests.sort((a, b) => a.closedAt.localeCompare(b.closedAt) || a.number - b.number), excludedDirect }
}

export function paperworkShare(input, delivered = deliveredRequests(input)) {
  const to = input.to
  const from = new Date(Date.parse(to) - 30 * 24 * HOUR).toISOString()
  const missing = missingSources(input.sources, ["issues", "issue_timeline", "pulls", "main_commits"], from, to)
  const requests = delivered.requests.filter((r) => within(r.closedAt, from, to))
  const paperwork = requests.filter((r) => r.paperwork).length
  return { from, to, status: missing.length ? "source_missing" : requests.length ? "ready" : "pending",
    requests: requests.length, issueRequests: requests.filter((r) => r.kind === "issue").length,
    paperwork, share: missing.length ? null : ratio(paperwork, requests.length), missingSources: missing }
}

export function computeLeadTime(input, delivered = deliveredRequests(input)) {
  const weeks = []
  for (let start = Date.parse(weekStart(input.from)); start < Date.parse(input.to); start += WEEK) {
    const from = new Date(start).toISOString()
    const end = new Date(start + WEEK).toISOString()
    const observedTo = new Date(Math.min(start + WEEK, Date.parse(input.to))).toISOString()
    const requests = delivered.requests.filter((r) => within(r.closedAt, from, observedTo))
    const normal = requests.filter((r) => !r.paperwork)
    const paperwork = requests.length - normal.length
    const direct = delivered.excludedDirect.filter((c) => within(c.landedAt, from, observedTo)).length
    const commits = input.commits.filter((c) => within(c.landedAt, from, observedTo)).length
    const missing = missingSources(input.sources, ["issues", "issue_timeline", "pulls", "main_commits"], from, observedTo)
    const status = missing.length ? "source_missing" : start + WEEK > Date.parse(input.to) ? "collecting" : normal.length ? "ready" : "pending"
    const times = normal.map((r) => r.leadTimeHours).sort((a, b) => a - b)
    weeks.push({ weekStart: from.slice(0, 10), status,
      value: status === "ready" ? { p50Hours: quantile(times, 0.5), p85Hours: quantile(times, 0.85), n: normal.length, paperwork } : null,
      coverage: { from, to: end, observedTo, requests: requests.length, issueRequests: requests.filter((r) => r.kind === "issue").length,
        paperwork, paperworkShare: missing.length ? null : ratio(paperwork, requests.length), mainCommits: commits,
        excludedDirectCommits: direct, excludedDirectShare: missing.length ? null : ratio(direct, commits), missingSources: missing,
        ...(status === "pending" ? { reason: "no_non_paperwork_delivered_requests" } : {}) }
    })
  }
  return { pair: "change_failure_rate", status: weeks.some((w) => w.status === "source_missing") ? "source_missing" : weeks.some((w) => w.status === "collecting") ? "collecting" : weeks.some((w) => w.status === "ready") ? "ready" : "pending", weeks }
}

// No quality comparison or causal analysis is evaluated here.
export function makeSnapshot(input, mainRedTime) {
  const delivered = deliveredRequests(input)
  const paperwork = paperworkShare(input, delivered)
  const fallback = paperwork.status === "ready" && paperwork.share > 0.4
  const lead = computeLeadTime(input, delivered)
  const selectedMetric = fallback ? "main_red_time" : "request_lead_time"
  const metrics = { request_lead_time: { ...lead, selected: !fallback },
    change_failure_rate: { status: "pending", weeks: [], reason: "not_computed_in_skeleton" } }
  if (fallback) metrics.main_red_time = mainRedTime ?? { status: "source_missing", weeks: [], missingSources: ["actions", "required_checks"] }
  const selected = metrics[selectedMetric]
  return {
    definitionVersion: 1, definition: DEFINITION, repo: input.repo, generatedAt: input.generatedAt,
    selectedMetric, selectionReason: fallback ? "30-day paperwork share exceeds 40%; main_red_time replaces headline lead time" : paperwork.status === "ready" ? "30-day paperwork share is at most 40%" : "paperwork source coverage unavailable; no fallback decision",
    coverage: { from: input.from, to: input.to, sources: input.sources, paperwork30Days: paperwork,
      counts: { issues: input.issues.length, pulls: input.pulls.length,
        mainCommits: input.commits.filter((c) => within(c.landedAt, input.from, input.to)).length,
        mainAncestryLandings: input.commits.length,
        deliveredRequests: delivered.requests.filter((r) => within(r.closedAt, input.from, input.to)).length,
        excludedDirectCommits: delivered.excludedDirect.filter((c) => within(c.landedAt, input.from, input.to)).length,
        excludedDirectShare: missingSources(input.sources, ["issues", "pulls", "main_commits"], input.from, input.to).length ? null : ratio(delivered.excludedDirect.filter((c) => within(c.landedAt, input.from, input.to)).length, input.commits.filter((c) => within(c.landedAt, input.from, input.to)).length) },
      referenceForms: referenceForms(input.commits.flatMap((c) => c.includedCommits ?? [c])),
      gaps: selected.weeks.filter((w) => w.status !== "ready").map((w) => ({ weekStart: w.weekStart, status: w.status, missingSources: w.coverage.missingSources })) },
    metrics
  }
}

// Deterministic, spread across weeks; round-robin also includes paperwork.
export function auditSample(requests, from, to, limit = 30) {
  const groups = new Map()
  for (const r of requests.filter((r) => within(r.closedAt, from, to))) {
    const key = weekStart(r.closedAt)
    const group = groups.get(key) ?? []
    group.push(r)
    groups.set(key, group)
  }
  const sample = []
  const buckets = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, rows]) => rows.sort((a, b) => Number(b.paperwork) - Number(a.paperwork) || a.number - b.number))
  while (sample.length < limit && buckets.some((b) => b.length)) {
    for (const bucket of buckets) if (bucket.length && sample.length < limit) sample.push(bucket.shift())
  }
  return sample
}
