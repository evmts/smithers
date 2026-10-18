/** Presentation only: source blobs and raw/code views retain their metadata. */
export const stripFrontmatter = (source: string) => source.replace(/^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/, "")
