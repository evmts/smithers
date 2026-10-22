export function quantile(values: number[], p: number) {
  if (!values.length) return null
  const sorted = [...values].sort((a,b)=>a-b), rank = (sorted.length-1)*p
  const lo = Math.floor(rank), hi = Math.ceil(rank)
  return sorted[lo] + (sorted[hi]-sorted[lo])*(rank-lo)
}
export function summarize(rows: any[], seconds: number) {
  const successes = rows.filter(r=>r.success), errors429 = rows.filter(r=>r.status===429).length
  const distribution = (key: string) => Object.fromEntries([.5,.95,.99].map(p=>[`p${p*100}`, quantile(successes.map(r=>r[key]).filter(Number.isFinite),p)]))
  return { seconds, requests: rows.length, requestsPerSecond: rows.length/seconds, successes: successes.length, errors429, otherErrors: rows.length-successes.length-errors429, errorFraction: rows.length ? 1-successes.length/rows.length : 0, ttftMs: distribution('ttftMs'), totalMs: distribution('totalMs'), outputTokensPerSecond: successes.reduce((n,r)=>n+r.outputTokens,0)/seconds, decodeTokensPerSecondP50: quantile(successes.filter(r=>Number.isFinite(r.ttftMs) && r.ttftMs >= 0 && Number.isFinite(r.totalMs) && r.totalMs>r.ttftMs).map(r=>r.outputTokens/((r.totalMs-r.ttftMs)/1000)),.5), estimatedUsd: rows.reduce((n,r)=>n+r.estimatedUsd,0) }
}
