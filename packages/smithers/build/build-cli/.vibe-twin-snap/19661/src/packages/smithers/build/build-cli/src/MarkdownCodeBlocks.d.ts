/**
 * Fenced code-block extraction for the `Markdown.CodeBlocks` lane.
 *
 * A page's fences become the files the compiler judges. The fence's info
 * string carries two Expressive Code metas the lane honours:
 *
 * - `title="<path>"` names the file the fence is or extends. Every fence on
 *   one page with the same title concatenates, in document order, into one
 *   scratch file at that relative path, so a tutorial that grows
 *   `greeting.ts` across three fences compiles as one module and a sibling
 *   fence's `import "./greeting.ts"` resolves. A directory-qualified title
 *   (`src/greeting.ts`) lands at that path under the scratch directory.
 * - `fragment` marks a fence that is not a compilable unit on its own (the
 *   middle of a function, an edit to an earlier declaration). The lane skips
 *   it and counts it in the report.
 *
 * An untitled fence without `fragment` compiles standalone as `block-N.ts`,
 * where `N` is the fence's index among the page's matching fences.
 *
 * @since 0.1.0
 */
/** One scratch file the lane writes and hands to the compiler.
 *
 * @category models
 * @since 0.1.0
 */
export interface ExtractedFile {
    readonly path: string;
    readonly content: string;
}
/** The files a page yields plus the counts the lane reports.
 *
 * @category models
 * @since 0.1.0
 */
export interface Extracted {
    readonly files: ReadonlyArray<ExtractedFile>;
    /** Every matching fence, fragments included. */
    readonly blocks: number;
    /** Untitled fences compiled as `block-N.ts`. */
    readonly standalone: number;
    /** Distinct titled files. */
    readonly titled: number;
    /** Fences skipped by `fragment`. */
    readonly fragments: number;
}
/** The fence metas the lane reads off the info string.
 *
 * @category models
 * @since 0.1.0
 */
export interface FenceMeta {
    readonly title: string | undefined;
    readonly fragment: boolean;
}
/** Parses the info-string remainder after the language: `title="x" fragment`.
 *
 * @category utils
 * @since 0.1.0
 */
export declare const parseMeta: (meta: string) => FenceMeta;
/** Extracts the fences of `languages` from `markdown` into scratch files.
 *
 * Files come back in first-appearance order. A titled file's content is the
 * fences' bodies joined by one blank line; a standalone file's content is the
 * fence body. Throws on a title that escapes the scratch directory or that
 * takes a standalone block's `block-N.ts` name. A page with CRLF line endings
 * reads as if it had LF endings, and the files come back with LF endings.
 *
 * @category utils
 * @since 0.1.0
 */
export declare const extract: (markdown: string, languages: ReadonlyArray<string>) => Extracted;
