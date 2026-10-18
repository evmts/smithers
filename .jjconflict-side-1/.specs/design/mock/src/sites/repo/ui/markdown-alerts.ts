export type AlertKind = "NOTE" | "TIP" | "IMPORTANT" | "WARNING" | "CAUTION"

/** GitHub alerts are quoted blocks; fenced examples retain their literal source. */
export const markdownAlerts = (source: string, render: (kind: AlertKind, body: string) => string): string => {
  const lines = source.split("\n"), output: string[] = []
  let fence: { marker: string; size: number } | undefined
  for (let i = 0; i < lines.length; i++) {
    const marker = lines[i].match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (marker) {
      if (!fence) fence = { marker: marker[1][0], size: marker[1].length }
      else if (marker[1][0] === fence.marker && marker[1].length >= fence.size && !marker[2].trim()) fence = undefined
      output.push(lines[i]); continue
    }
    const alert = !fence && lines[i].match(/^ {0,3}>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:[ \t]+(.*))?\s*$/)
    if (!alert) { output.push(lines[i]); continue }
    const body = alert[2] ? [alert[2]] : []
    while (i + 1 < lines.length && /^ {0,3}>/.test(lines[i + 1])) body.push(lines[++i].replace(/^ {0,3}>[ \t]?/, ""))
    output.push(render(alert[1] as AlertKind, body.join("\n")))
  }
  return output.join("\n")
}
