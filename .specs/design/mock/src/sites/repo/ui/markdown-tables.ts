export type MarkdownTable = { headers: string[]; align: ("left" | "center" | "right" | undefined)[]; rows: string[][] }

const cells = (line: string) => {
  const parts: string[] = []
  let cell = "", slashes = 0
  for (const char of line.trim()) {
    if (char === "|" && slashes % 2 === 0) { parts.push(cell); cell = "" }
    else cell += char
    slashes = char === "\\" ? slashes + 1 : 0
  }
  parts.push(cell)
  if (!parts[0]?.trim()) parts.shift()
  if (!parts.at(-1)?.trim()) parts.pop()
  return parts.map(cell => cell.trim().replace(/\\\|/g, "|"))
}

/** GFM tables are blocks, never fenced examples. Preserve non-table source verbatim. */
export const markdownTables = (source: string, render: (table: MarkdownTable) => string): string => {
  const lines = source.split("\n")
  const out: string[] = []
  let fence: { marker: string; size: number } | undefined
  for (let i = 0; i < lines.length; i++) {
    const marker = lines[i].match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (marker) {
      if (!fence) fence = { marker: marker[1][0], size: marker[1].length }
      else if (marker[1][0] === fence.marker && marker[1].length >= fence.size && !marker[2].trim()) fence = undefined
      out.push(lines[i]); continue
    }
    const headers = cells(lines[i])
    const separators = cells(lines[i + 1] ?? "")
    if (fence || !lines[i].includes("|") || headers.length !== separators.length || !separators.length || !separators.every(cell => /^:?-+:?$/.test(cell))) {
      out.push(lines[i]); continue
    }
    const align = separators.map(cell => cell.startsWith(":") && cell.endsWith(":") ? "center" as const : cell.endsWith(":") ? "right" as const : cell.startsWith(":") ? "left" as const : undefined)
    i++
    const rows: string[][] = []
    while (i + 1 < lines.length && lines[i + 1].trim() && lines[i + 1].includes("|") && !/^\s*(?:#|>|```|~~~)/.test(lines[i + 1])) {
      const row = cells(lines[++i])
      rows.push(headers.map((_, column) => row[column] ?? ""))
    }
    out.push(render({ headers, align, rows }))
  }
  return out.join("\n")
}
