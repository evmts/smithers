/** Authenticated collection continuation and bounded response reads.
 * @since 1.0.0
 */

/**
 * Existing CLI page/row bounds and CloudSession response byte bound.
 * @category constants
 * @since 1.0.0
 */
export const paginationLimits = { pages: 100, items: 10_000, bytes: 4 * 1024 * 1024 } as const

/**
 * Cursor metadata never grants authority to change an authenticated request destination.
 * @category pagination
 * @since 1.0.0
 */
export const paginationCursor = (
  headers: Headers,
  current: URL,
  options: { readonly preserveQuery?: boolean; readonly invalid?: () => Error } = {}
): string => {
  const invalid = options.invalid ?? (() => new Error("API returned invalid pagination"))
  const link = headers.get("link") || ""
  const entries: Array<string> = []
  let start = 0, quoted = false, angle = false, escaped = false
  for (let index = 0; index < link.length; index++) {
    const char = link[index]
    if (escaped) escaped = false
    else if (quoted && char === "\\") escaped = true
    else if (!angle && char === "\"") quoted = !quoted
    else if (!quoted && char === "<") angle = true
    else if (!quoted && char === ">") angle = false
    else if (!quoted && !angle && char === ",") {
      entries.push(link.slice(start, index))
      start = index + 1
    }
  }
  if (quoted || angle || escaped) throw invalid()
  if (link) entries.push(link.slice(start))
  let next: string | undefined
  for (const entry of entries) {
    const parsed = /^\s*<([^<>]+)>\s*(.*)$/.exec(entry)
    if (!parsed) throw invalid()
    const rel = /(?:^|;)\s*rel\s*=\s*(?:"([^"]*)"|([^;\s]+))/i.exec(parsed[2]!)
    if (!(rel?.[1] ?? rel?.[2] ?? "").split(/\s+/).includes("next")) continue
    if (next !== undefined) throw invalid()
    let url: URL
    try {
      url = new URL(parsed[1]!, current)
    } catch {
      throw invalid()
    }
    if (
      url.origin !== current.origin || url.pathname !== current.pathname || url.username || url.password || url.hash ||
      url.searchParams.getAll("cursor").length !== 1
    ) throw invalid()
    if (options.preserveQuery) {
      const query = (value: URL) =>
        [...value.searchParams].filter(([key]) => key !== "cursor")
          .map(([key, value]) => JSON.stringify([key, value])).sort()
      if (JSON.stringify(query(url)) !== JSON.stringify(query(current))) throw invalid()
    }
    next = url.searchParams.get("cursor")!
    if (!next) throw invalid()
  }
  // X-Next-Cursor is percent-encoded so a path cursor keeps its edge whitespace.
  const header = headers.get("x-next-cursor")
  let legacy: string | null = null
  if (header !== null) {
    try {
      legacy = decodeURIComponent(header)
    } catch {
      throw invalid()
    }
  }
  if (next !== undefined && legacy !== null && legacy !== next) throw invalid()
  const cursor = next ?? legacy ?? ""
  // C0/DEL control characters never belong in a cursor; spaces may, as in a path.
  const control = [...cursor].some((char) => char <= "\u001f" || char === "\u007f")
  if (cursor.length > 4096 || control) throw invalid()
  return cursor
}

/**
 * Read a page within the remaining collection byte budget, cancelling an oversized body.
 * @category pagination
 * @since 1.0.0
 */
export const pageText = async (
  response: Response,
  limit: number,
  oversized: () => Error = () => new Error("API collection exceeds the response limit"),
  options: { readonly preserveBOM?: boolean } = {}
): Promise<{ readonly text: string; readonly bytes: number }> => {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    await response.body?.cancel().catch(() => {})
    throw oversized()
  }
  const reader = response.body?.getReader()
  if (reader === undefined) return { text: "", bytes: 0 }
  const decoder = new TextDecoder("utf-8", { ignoreBOM: options.preserveBOM ?? false })
  let text = ""
  let bytes = 0
  let complete = false
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) {
        complete = true
        break
      }
      bytes += chunk.value.byteLength
      if (bytes > limit) throw oversized()
      text += decoder.decode(chunk.value, { stream: true })
    }
    return { text: text + decoder.decode(), bytes }
  } finally {
    if (!complete) await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
