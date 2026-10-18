import { file, tree } from "../../fixtures"
import type { FileBlob, Symbol as CodeSymbol } from "../../fixtures/types"

export type DocsHover = CodeSymbol & {
  /** UTF-16 offsets in the docs code block, suitable for String.slice. */
  start: number
  end: number
  /** Line in the code block; sourceLine is the symbol's line in the source file. */
  line: number
  source: string
  sourceLine: number
}

export type Identifier = { name: string; start: number; end: number; line: number }

/** Ignore comments and quoted text so example strings never become symbol controls. */
export const codeIdentifiers = (code: string): Identifier[] => {
  const tokens = /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[A-Za-z_$][\w$]*/g
  const identifiers: Identifier[] = []
  let line = 1
  let cursor = 0
  for (const match of code.matchAll(tokens)) {
    const start = match.index!
    line += code.slice(cursor, start).split("\n").length - 1
    if (/^[A-Za-z_$]/.test(match[0])) identifiers.push({ name: match[0], start, end: start + match[0].length, line })
    line += match[0].split("\n").length - 1
    cursor = start + match[0].length
  }
  return identifiers
}

const vocabulary = (code: string) => new Set(codeIdentifiers(code).map(token => token.name))

/** Match by name against this repo's .vibe files, using the code's vocabulary to disambiguate.
 * No fixture is captured at module load: switching repositories always selects the new symbols.
 * Optional blobs let the same resolver be used by a snippet compiler or a behavioral check.
 */
export const docsCodeHovers = (code: string, blobs?: readonly FileBlob[]): DocsHover[] => {
  const sources = blobs ?? tree.filter(entry => entry.kind === "file" && entry.path.endsWith(".vibe"))
    .map(entry => file(entry.path)).filter((blob): blob is FileBlob => Boolean(blob))
  const tokens = codeIdentifiers(code)
  const names = new Set(tokens.map(token => token.name))
  const ranked = sources.filter(blob => blob.path.endsWith(".vibe") && blob.symbols?.length).map(blob => {
    const words = vocabulary(blob.content)
    const shared = [...names].filter(name => words.has(name)).length
    const union = new Set([...names, ...words]).size || 1
    return { blob, score: shared / union + (blob.content.includes(code.trim()) && code.trim() ? 2 : 0) }
  }).sort((a, b) => b.score - a.score || a.blob.path.localeCompare(b.blob.path))
  const symbols = new Map<string, { symbol: CodeSymbol; blob: FileBlob }>()
  for (const { blob } of ranked) {
    for (const symbol of blob.symbols ?? []) {
      if (names.has(symbol.name) && !symbols.has(symbol.name)) symbols.set(symbol.name, { symbol, blob })
    }
  }
  return tokens.flatMap(token => {
    const candidate = symbols.get(token.name)
    if (!candidate) return []
    const { symbol, blob } = candidate
    return [{ ...symbol, ...token, source: blob.path, sourceLine: symbol.line,
      definition: symbol.definition ?? { path: blob.path, line: symbol.line } }]
  })
}
