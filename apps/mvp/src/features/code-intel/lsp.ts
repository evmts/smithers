import { Data, Effect, Schema } from "effect"
import { kindLabel } from "./contract"

// The language server's answers, decoded from the Language Server Protocol's own shapes into what the view draws.
// Whatever answered (the browser's TypeScript worker today, a branch box's server later), the wire is LSP, so these
// decoders are the one place it is read. Positions on the wire are 0-based; everything here returns 1-based lines and
// columns, as the code view counts them.

const Position = Schema.Struct({ line: Schema.Number, character: Schema.Number })
const Range = Schema.Struct({ start: Position, end: Position })
type Range = typeof Range.Type

const MarkedString = Schema.Union([Schema.String, Schema.Struct({ language: Schema.String, value: Schema.String })])
const Hover = Schema.NullOr(
  Schema.Struct({
    contents: Schema.Union([Schema.Struct({ kind: Schema.String, value: Schema.String }), MarkedString, Schema.Array(MarkedString)]),
  }),
)
const Location = Schema.Struct({ uri: Schema.String, range: Range })
const LocationLink = Schema.Struct({ targetUri: Schema.String, targetSelectionRange: Range })
const Locations = Schema.NullOr(Schema.Union([Location, Schema.Array(Schema.Union([Location, LocationLink]))]))
const Report = Schema.Struct({
  items: Schema.Array(
    Schema.Struct({ range: Range, severity: Schema.optional(Schema.Number), message: Schema.String }),
  ),
})

interface DocumentSymbol {
  readonly name: string
  readonly kind: number
  readonly selectionRange: Range
  readonly children?: ReadonlyArray<DocumentSymbol> | undefined
}
const DocumentSymbol: Schema.Codec<DocumentSymbol> = Schema.Struct({
  name: Schema.String,
  kind: Schema.Number,
  selectionRange: Range,
  children: Schema.optional(Schema.Array(Schema.suspend(() => DocumentSymbol))),
})
const DocumentSymbols = Schema.NullOr(Schema.Array(DocumentSymbol))

/** What a hover said: the signature as code, when it led with one, and the documentation as Markdown. */
export interface HoverInfo {
  readonly signature: string | null
  readonly documentation: string
}

/** A place in the repository: its path, 1-based line and column. */
export interface Place {
  readonly path: string
  readonly line: number
  readonly column: number
}

/** A problem in a file, 1-based; `endColumn` is exclusive. */
export interface Problem {
  readonly line: number
  readonly column: number
  readonly endLine: number
  readonly endColumn: number
  readonly severity: "error" | "warning" | "info"
  readonly message: string
}

/** One entry of a file's outline. */
export interface OutlineItem {
  readonly name: string
  readonly kind: string
  readonly line: number
  readonly depth: number
}

/** The language server answered outside the protocol. */
export class Unreadable extends Data.TaggedError("Unreadable") {}

const decode = <A>(schema: Schema.Codec<A>) => (input: unknown) =>
  Schema.decodeUnknownEffect(schema)(input).pipe(Effect.mapError(() => new Unreadable()))

const FENCE = /^```[\w-]*\n([\s\S]*?)\n```\s*/

/** A hover's Markdown: a leading fenced block is the signature, the rest the documentation. */
export const hoverOf = (input: unknown) =>
  Effect.map(decode(Hover)(input), (hover): HoverInfo | null => {
    if (hover === null) return null
    const parts = Array.isArray(hover.contents) ? hover.contents : [hover.contents]
    const markdown = parts
      .map((part) =>
        typeof part === "string" ? part : "kind" in part ? part.value : "```" + part.language + "\n" + part.value + "\n```"
      )
      .join("\n\n")
    const fence = FENCE.exec(markdown)
    return fence === null
      ? { signature: null, documentation: markdown.trim() }
      : { signature: fence[1]!, documentation: markdown.slice(fence[0].length).trim() }
  })

/**
 * Locations in the repository: each `uri` under `root` (the server's `file:` URI of the repository's root, ending in
 * `/`) that names a file `inRepository` knows. Definitions in a server's own library files are left out.
 */
export const placesOf = (input: unknown, root: string, inRepository: (path: string) => boolean) =>
  Effect.flatMap(decode(Locations)(input), (found) => Effect.try({
    try: (): ReadonlyArray<Place> => {
      const list = found === null ? [] : Array.isArray(found) ? found : [found]
      return list.flatMap((entry) => {
        const [uri, range] = "uri" in entry ? [entry.uri, entry.range] : [entry.targetUri, entry.targetSelectionRange]
        if (!uri.startsWith(root)) return []
        const path = uri.slice(root.length).split("/").map(decodeURIComponent).join("/")
        return inRepository(path) ? [{ path, line: range.start.line + 1, column: range.start.character + 1 }] : []
      })
    },
    catch: () => new Unreadable(),
  }))

const SEVERITY: Readonly<Record<number, Problem["severity"]>> = { 1: "error", 2: "warning" }

/** A diagnostic report's problems, in the order the server gave them. */
export const problemsOf = (input: unknown) =>
  Effect.map(decode(Report)(input), (report): ReadonlyArray<Problem> =>
    report.items.map((item) => ({
      line: item.range.start.line + 1,
      column: item.range.start.character + 1,
      endLine: item.range.end.line + 1,
      endColumn: item.range.end.character + 1,
      severity: SEVERITY[item.severity ?? 1] ?? "info",
      message: item.message,
    })))

const flatten = (symbols: ReadonlyArray<DocumentSymbol>, depth: number): Array<OutlineItem> =>
  symbols.flatMap((symbol) => [
    { name: symbol.name, kind: kindLabel(symbol.kind), line: symbol.selectionRange.start.line + 1, depth },
    ...flatten(symbol.children ?? [], depth + 1),
  ])

/** A file's outline, depth first. */
export const outlineOf = (input: unknown) =>
  Effect.map(decode(DocumentSymbols)(input), (symbols): ReadonlyArray<OutlineItem> => flatten(symbols ?? [], 0))
