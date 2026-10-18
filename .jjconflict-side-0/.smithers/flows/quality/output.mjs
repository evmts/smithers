const escape = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
const number = (v) => v == null ? "—" : Number(v.toFixed(3)).toString()

export function auditCsv(rows) {
  const quote = (value) => `"${String(value ?? "").replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`
  const header = ["issue_number", "url", "created", "closed", "linked_commit", "lead_time_hours", "paperwork", "kind", "paperwork_reason"]
  return [header, ...rows.map((r) => [r.number, r.url, r.createdAt, r.closedAt, r.linkedCommit, r.leadTimeHours, r.paperwork, r.kind, r.paperworkReason])].map((r) => r.map(quote).join(",")).join("\r\n") + "\r\n"
}

function chart(metric, key) {
  const weeks = metric.weeks
  const values = weeks.flatMap((w) => w.value ? key === "request_lead_time" ? [w.value.p50Hours, w.value.p85Hours] : [w.value.redShare * 100] : [])
  const max = Math.max(1, ...values)
  const x = (i) => 70 + i * (870 / Math.max(1, weeks.length - 1))
  const y = (n) => 230 - n / max * 185
  const series = key === "request_lead_time" ? [["p50Hours", "#2166ac"], ["p85Hours", "#b35806"]] : [["redShare", "#b2182b"]]
  const paths = series.map(([name, color]) => {
    let path = "", previous = false
    weeks.forEach((w, i) => {
      if (!w.value) { previous = false; return }
      const value = w.value[name] * (name === "redShare" ? 100 : 1)
      path += `${previous ? " L" : " M"}${x(i)},${y(value)}`
      previous = true
    })
    return `<path d="${path}" stroke="${color}" fill="none" stroke-width="2"/>` + weeks.map((w, i) => w.value ? `<circle cx="${x(i)}" cy="${y(w.value[name] * (name === "redShare" ? 100 : 1))}" r="4" fill="${color}"><title>${escape(`${w.weekStart}: ${name} ${number(w.value[name])}`)}</title></circle>` : "").join("")
  }).join("")
  const gaps = weeks.map((w, i) => !w.value ? `<rect x="${x(i) - 8}" y="238" width="16" height="12" fill="#999"><title>${escape(`${w.weekStart}: ${w.status}; ${w.coverage.missingSources.join(", ")}`)}</title></rect>` : "").join("")
  return `<svg viewBox="0 0 1000 285" role="img" aria-label="${escape(key)} weekly trend; gaps are listed in the table"><text x="10" y="20">${key === "request_lead_time" ? "Hours · blue p50 · amber p85" : "Failed hours (%)"}</text><path d="M60 35V230H955" fill="none" stroke="currentColor"/><text x="5" y="48">${number(max)}</text><text x="40" y="234">0</text>${paths}${gaps}<text x="60" y="278">${escape(weeks[0]?.weekStart ?? "")}</text><text x="865" y="278">${escape(weeks.at(-1)?.weekStart ?? "")}</text></svg>`
}

export function renderTrend(snapshot) {
  const metricSections = Object.entries(snapshot.metrics).filter(([, m]) => m.weeks.length).map(([key, m]) => {
    const rows = m.weeks.map((w) => `<tr><td>${escape(w.weekStart)}</td><td>${escape(w.status)}</td><td>${w.value ? key === "request_lead_time" ? `${number(w.value.p50Hours)} / ${number(w.value.p85Hours)} h` : `${number(w.value.redShare * 100)}%` : "—"}</td><td>${w.value?.n ?? w.coverage.knownHours ?? "—"}</td><td>${w.coverage.paperwork ?? w.coverage.unknownHours ?? "—"}</td><td>${w.coverage.excludedDirectCommits ?? "—"}</td><td>${escape(w.coverage.missingSources.join(", "))}</td></tr>`).join("")
    return `<section><h2>${escape(key)}${key === snapshot.selectedMetric ? " · selected" : ""}</h2><p>${key === "request_lead_time" ? "Pair: change_failure_rate · pending" : "Unknown hours remain unknown; no rate is shown for incomplete weeks."}</p>${chart(m, key)}<table><caption>${key === "request_lead_time" ? "p50 / p85 · n excludes paperwork" : "Known / unknown whole hours"}</caption><thead><tr><th>UTC week</th><th>Status</th><th>${key === "request_lead_time" ? "p50 / p85" : "Red share"}</th><th>${key === "request_lead_time" ? "n" : "Known h"}</th><th>${key === "request_lead_time" ? "Paperwork" : "Unknown h"}</th><th>Direct commits excluded</th><th>Missing sources</th></tr></thead><tbody>${rows}</tbody></table></section>`
  }).join("")
  const p = snapshot.coverage.paperwork30Days
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(snapshot.repo)} · quality</title><style>:root{color-scheme:light dark;font:16px/1.5 system-ui,sans-serif}body{max-width:1100px;margin:2rem auto;padding:0 1rem}h1{font-size:1.6rem}h2{font-size:1.3rem}svg{width:100%;height:auto}svg text{fill:currentColor;font-size:14px}table{border-collapse:collapse;width:100%;font-size:.86rem}th,td{text-align:left;padding:.5rem;border-bottom:1px solid #9996}section{margin:2rem 0;overflow-x:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.8rem}summary{cursor:pointer}a{color:inherit}</style><body><h1>${escape(snapshot.repo)} · ${escape(snapshot.selectedMetric)}</h1><p>${escape(snapshot.generatedAt)} · definition v${snapshot.definitionVersion}</p><p>30-day paperwork: ${p.share == null ? escape(p.status) : `${number(p.share * 100)}% (${p.paperwork}/${p.requests})`}</p><p>${escape(snapshot.selectionReason)}</p><p>${escape(snapshot.definition.interpretation)}</p>${metricSections}<details><summary>Coverage manifest</summary><pre>${escape(JSON.stringify(snapshot.coverage, null, 2))}</pre></details><details><summary>Definition and pre-registered success rule · not evaluated</summary><pre>${escape(JSON.stringify(snapshot.definition, null, 2))}</pre></details><p><a href="snapshot.json">Snapshot</a> · <a href="audit.csv">Audit sample</a></p></body></html>`
}
