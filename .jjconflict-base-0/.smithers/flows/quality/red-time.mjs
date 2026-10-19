import { HOUR, WEEK, missingSources, weekStart } from "./metrics.mjs"

export function computeMainRedTime({ from, to, sources, commits, runs, requiredVersions = [] }) {
  const weeks = []
  const orderedCommits = [...commits].sort((a, b) => Date.parse(a.landedAt) - Date.parse(b.landedAt))
  const failed = new Set(["failure", "timed_out", "action_required", "startup_failure"])
  for (let start = Date.parse(weekStart(from)); start < Date.parse(to); start += WEEK) {
    const end = Math.min(start + WEEK, Date.parse(to))
    const missing = missingSources(sources, ["main_commits", "actions", "required_checks"], new Date(start).toISOString(), new Date(end).toISOString())
    let failedHours = 0, knownHours = 0, unknownHours = 0
    for (let hour = start; hour + HOUR <= end; hour += HOUR) {
      const version = requiredVersions.find((v) => Date.parse(v.from) <= hour && Date.parse(v.to) >= hour + HOUR)
      if (!version?.contexts.length) { unknownHours++; missing.push("required_checks_history"); continue }
      const commit = orderedCommits.findLast((c) => Date.parse(c.landedAt) <= hour)
      const changed = orderedCommits.some((c) => Date.parse(c.landedAt) > hour && Date.parse(c.landedAt) < hour + HOUR)
      if (!commit || changed) { unknownHours++; missing.push("main_hour_state"); continue }
      const states = version.contexts.map((context) => {
        // Only an explicitly mapped required context is admissible. A workflow
        // run name is not its job's required status context.
        const checks = runs.filter((r) => r.context === context && r.head_sha === commit.sha)
        if (checks.some((r) => [r.created_at, r.updated_at].some((d) => Date.parse(d) > hour && Date.parse(d) < hour + HOUR))) return null
        const latest = checks.filter((r) => Date.parse(r.created_at) <= hour).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || (a.run_attempt ?? 1) - (b.run_attempt ?? 1)).at(-1)
        if (!latest || latest.status !== "completed" || Date.parse(latest.updated_at) > hour) return null
        return latest.conclusion === "success" ? "green" : failed.has(latest.conclusion) ? "red" : null
      })
      if (states.some((s) => s === null)) { unknownHours++; missing.push("required_check_results"); continue }
      knownHours++
      if (states.includes("red")) failedHours++
    }
    const uniqueMissing = [...new Set(missing)]
    const totalHours = knownHours + unknownHours
    const status = uniqueMissing.length ? "source_missing" : start + WEEK > Date.parse(to) ? "collecting" : totalHours ? "ready" : "pending"
    const value = { redShare: totalHours ? failedHours / totalHours : null, failedHours, knownHours, unknownHours, totalHours }
    weeks.push({ weekStart: new Date(start).toISOString().slice(0, 10), status, value: status === "ready" ? value : null,
      coverage: { from: new Date(start).toISOString(), to: new Date(end).toISOString(), failedHours, knownHours, unknownHours, totalHours, missingSources: uniqueMissing } })
  }
  return { pair: null, status: weeks.some((w) => w.status === "source_missing") ? "source_missing" : "collecting", requiredCheckDefinitionVersion: 1, weeks }
}
