/**
 * A repository's own home: the blocks `.smithers/home.json` declares, read
 * where the home is shown.
 *
 * A home is data, never code. Each block is one of a closed set of kinds,
 * every string in it is bounded, and a string carrying an HTML tag is
 * refused, so a page draws a home from these values and runs nothing the
 * repository wrote. A button a block names runs only when a person presses
 * it.
 *
 * {@link read} is the reader a page uses: it takes the file's text and
 * answers the blocks to draw, skipping a kind it doesn't know so a newer
 * declaration still shows on an older page, or says the file is invalid.
 * `@smthrs/targets` writes the same document from `.smithers/FACTORY.ts`
 * (`Smithers.Factory.Home`); `test/HomeTargets.test.ts` holds the two
 * together.
 *
 * @since 0.1.0
 */

import * as Result from "effect/Result"
import * as Schema from "effect/Schema"

/**
 * The file a repository declares its home in, at its default branch's head.
 *
 * @category constants
 * @since 0.1.0
 */
export const path = ".smithers/home.json"

/**
 * Maximum length of one block's title or one link's label.
 *
 * @category constants
 * @since 0.1.0
 */
export const maximumTitleLength = 120

/**
 * Maximum length of one text block.
 *
 * @category constants
 * @since 0.1.0
 */
export const maximumTextLength = 4096

/**
 * Maximum length of one link URL.
 *
 * @category constants
 * @since 0.1.0
 */
export const maximumUrlLength = 2048

/**
 * Maximum number of blocks one home declares, unknown kinds included.
 *
 * @category constants
 * @since 0.1.0
 */
export const maximumBlocks = 32

/**
 * The shape of raw HTML in a string: a tag, a closing tag, a comment, or a
 * processing instruction opener. Prose that mentions `a < b` does not match;
 * `<b>bold</b>` and `<!-- note -->` do.
 *
 * @category constants
 * @since 0.1.0
 */
export const htmlPattern = /<\/?[A-Za-z!?]/

const noHtml = Schema.makeFilter<string>(
  (text) => htmlPattern.test(text) ? "must not contain HTML; blocks are declared values, never markup" : true
)

/**
 * A one-line title or label: non-empty, bounded, one line, no HTML.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Title = Schema.NonEmptyString.check(
  Schema.isMaxLength(maximumTitleLength),
  Schema.isPattern(/^[^\r\n]*$/),
  noHtml
)

/**
 * A paragraph of plain text: non-empty, bounded, no HTML.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Prose = Schema.NonEmptyString.check(Schema.isMaxLength(maximumTextLength), noHtml)

/**
 * A link target: an absolute `http` or `https` URL.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Url = Schema.NonEmptyString.check(
  Schema.isMaxLength(maximumUrlLength),
  Schema.isPattern(/^https?:\/\/[^\s<>"']+$/i)
)

/**
 * A relative path that cannot escape the repository.
 *
 * @category schemas
 * @since 0.1.0
 */
export const RepositoryPath = Schema.NonEmptyString.check(
  Schema.isMaxLength(1024),
  Schema.makeFilter<string>((value) =>
    value.startsWith("/") || value.includes("\\") ||
      value.split("/").some((part) => part === "" || part === "." || part === "..") ||
      /[%:?#]/.test(value) || [...value].some((character) => character.charCodeAt(0) < 0x20)
      ? "must be a relative in-repository path" :
      true
  )
)

/**
 * A flow's name as a home names it: a slash command or a repository flow.
 *
 * @category schemas
 * @since 0.1.0
 */
export const FlowName = Schema.NonEmptyString.check(Schema.isPattern(/^[a-z0-9_-]+(?:[./][a-z0-9_-]+)*$/))

/**
 * A paragraph of plain text under an optional title.
 *
 * @category schemas
 * @since 0.1.0
 */
export const TextBlock = Schema.Struct({
  type: Schema.Literal("text"),
  title: Schema.optional(Title),
  text: Prose
})

/**
 * A list of links under an optional title: each a label and the URL it opens.
 *
 * @category schemas
 * @since 0.1.0
 */
export const LinksBlock = Schema.Struct({
  type: Schema.Literal("links"),
  title: Schema.optional(Title),
  links: Schema.NonEmptyArray(Schema.Struct({ label: Title, url: Url }))
})

/**
 * The repository's flows, which the page lists from its own catalog: the
 * block carries no rows.
 *
 * @category schemas
 * @since 0.1.0
 */
export const FlowsBlock = Schema.Struct({
  type: Schema.Literal("flows"),
  title: Schema.optional(Title)
})

/**
 * A prompt: a heading over the way to ask, and the flow that takes the
 * question, if not the conversation itself.
 *
 * @category schemas
 * @since 0.1.0
 */
export const PromptBlock = Schema.Struct({
  type: Schema.Literal("prompt"),
  flow: Schema.optional(FlowName),
  title: Schema.optional(Title),
  placeholder: Schema.optional(Title)
})

/**
 * The pictures an app block may wear: what the flow's result looks like.
 *
 * @category schemas
 * @since 0.1.0
 */
export const AppPicture = Schema.Literals(["issue", "review", "wiki", "schedule"])

/**
 * An app: one flow's button, with a title and a picture. A page shows it only
 * when it has that flow.
 *
 * @category schemas
 * @since 0.1.0
 */
export const AppBlock = Schema.Struct({
  type: Schema.Literal("app"),
  flow: FlowName,
  title: Title,
  picture: AppPicture
})

/**
 * A Markdown file of the repository, read at the home's own commit.
 *
 * @category schemas
 * @since 0.1.0
 */
export const MarkdownBlock = Schema.Struct({
  type: Schema.Literal("markdown"),
  path: RepositoryPath,
  title: Schema.optional(Title)
})

/**
 * The repository's live stack of changes, which the page reads itself: the
 * block carries no rows.
 *
 * @category schemas
 * @since 0.1.0
 */
export const StackBlock = Schema.Struct({
  type: Schema.Literal("stack"),
  title: Schema.optional(Title)
})

/**
 * The view a repository flow declares, drawn in this place.
 *
 * @category schemas
 * @since 0.1.0
 */
export const ViewBlock = Schema.Struct({
  type: Schema.Literal("view"),
  flow: FlowName
})

/**
 * One declared block.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Block = Schema.Union([
  TextBlock,
  LinksBlock,
  FlowsBlock,
  PromptBlock,
  MarkdownBlock,
  StackBlock,
  AppBlock,
  ViewBlock
])

/**
 * One declared block.
 *
 * @category models
 * @since 0.1.0
 */
export type Block = typeof Block.Type

/**
 * The kinds of block this reader knows, by their `type`.
 *
 * @category constants
 * @since 0.1.0
 */
export const kinds: ReadonlyArray<Block["type"]> = [
  "text",
  "links",
  "flows",
  "prompt",
  "markdown",
  "stack",
  "app",
  "view"
]

/**
 * Why a file is not a home:
 *
 * - `json`: the text is not JSON;
 * - `shape`: it is not an object with a `blocks` array;
 * - `blocks`: it declares more than {@link maximumBlocks} blocks;
 * - `block`: a block of a known kind breaks its bounds, such as a title over
 *   {@link maximumTitleLength} characters, HTML in a string or a link that
 *   isn't `http` or `https`.
 *
 * @category models
 * @since 0.1.0
 */
export type Invalid = "json" | "shape" | "blocks" | "block"

/**
 * What {@link read} answers: the blocks to draw, in order, and how many it
 * skipped because their kind is unknown; or why the file is not a home. A
 * home may declare no blocks at all.
 *
 * @category models
 * @since 0.1.0
 */
export type Read =
  | { readonly _tag: "Declared"; readonly blocks: ReadonlyArray<Block>; readonly skipped: number }
  | { readonly _tag: "Invalid"; readonly reason: Invalid }

const known = new Set<unknown>(kinds)
const decodeBlock = Schema.decodeUnknownResult(Block)

/** A block that names a kind as a string this reader doesn't know: a newer declaration's. */
const unknownKind = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null) return false
  const type: unknown = (value as { readonly type?: unknown }).type
  return typeof type === "string" && !known.has(type)
}

/**
 * Reads `.smithers/home.json`'s text: the blocks it declares, or why it is
 * not a home. A block of a kind this reader doesn't know is skipped and
 * counted; any other block that breaks its schema makes the whole file
 * invalid, so a page never draws half of a home. The answer carries no text
 * from the file but the blocks themselves.
 *
 * @example
 * ```ts
 * import { Home } from "@smthrs/views"
 *
 * const home = Home.read('{"blocks":[{"type":"text","text":"Hello."},{"type":"chart"}]}')
 * // { _tag: "Declared", blocks: [{ type: "text", text: "Hello." }], skipped: 1 }
 * ```
 *
 * @category reading
 * @since 0.1.0
 */
export const read = (text: string): Read => {
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    return { _tag: "Invalid", reason: "json" }
  }
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    return { _tag: "Invalid", reason: "shape" }
  }
  const entries: unknown = (document as { readonly blocks?: unknown }).blocks
  if (!Array.isArray(entries)) return { _tag: "Invalid", reason: "shape" }
  if (entries.length > maximumBlocks) return { _tag: "Invalid", reason: "blocks" }
  const blocks: Array<Block> = []
  let skipped = 0
  for (const entry of entries) {
    if (unknownKind(entry)) {
      skipped++
      continue
    }
    const decoded = decodeBlock(entry)
    if (Result.isFailure(decoded)) return { _tag: "Invalid", reason: "block" }
    blocks.push(decoded.success)
  }
  return { _tag: "Declared", blocks, skipped }
}
