/*
 * The launcher's two reads (mvp.md M-45, §6.16): the repositories a visitor
 * can explore, and Smithers' own update news.
 *
 * The catalog read is the existing public one (GET /api/public/repos) whose
 * rows join the repositories collection exactly as `/owner/repo` already
 * joins them, so "explore" offers real repositories and nothing invented. A
 * refused catalog says so; it never shows an empty shelf.
 *
 * The news is what changed in Smithers, dated, from ONE real published
 * source.
 *
 * The source is the project's published GitHub releases, read from a fixed
 * endpoint with no credentials: no cookie, no account, no repository, no
 * token, and the same answer signed in or signed out. Every entry's date,
 * title and link come from that answer; nothing here writes an entry,
 * derives one from a version number, or adds marketing prose, so a source
 * that cannot be read has NO entries to show and says so — an empty frame
 * would tell a reader there were no updates, which the read never proved.
 *
 * The read is bounded (one page, at most UPDATES_SHOWN entries, each field
 * capped) and cached for the app's lifetime: the launcher mounts and
 * remounts freely, and only an explicit Retry re-reads.
 *
 * Root owns activating a source for a deployment. `endpoint` is the seam's
 * one knob so that activation is a configuration change, not a code change.
 */

/** The published releases of Smithers: the project's own canonical public feed. */
export const SMITHERS_RELEASES_ENDPOINT = "https://api.github.com/repos/smithersai/smithers/releases?per_page=10"
/** How many dated entries the launcher shows, newest first. */
export const UPDATES_SHOWN = 5
/** Bounds on one entry, so a hostile or broken source cannot flood the page. */
const TITLE_MAX = 200
/** Bounds on the whole answer: a page far larger than UPDATES_SHOWN is still read, never all of it. */
const ROWS_MAX = 50

/** One dated Smithers update, every field from the source. */
export interface SmithersUpdate {
  /** The source's own identity for the entry (its page URL). */
  readonly id: string
  /** The release's own title, or its tag when it published no title. */
  readonly title: string
  /** The source's publication timestamp, ISO 8601. */
  readonly date: string
  /** The entry's page at the original source. */
  readonly url: string
}

/**
 * What the news read answered. `unreadable` is the honest absence: the
 * source refused, could not be reached, or answered something this app
 * cannot read. It is never reported as "no updates".
 */
export type SmithersUpdatesAnswer =
  | { readonly kind: "read"; readonly updates: ReadonlyArray<SmithersUpdate> }
  | { readonly kind: "unreadable" }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const text = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.trim() !== "" && value.length <= max ? value.trim() : null

/** Only `https://github.com/...`: the published feed's own pages, never a link a body invented elsewhere. */
const sourceUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname === "github.com" ? url.toString() : null
  } catch { return null }
}

const published = (value: unknown): string | null => {
  const raw = text(value, 64)
  if (raw === null) return null
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

/**
 * The published entries of one releases page, newest first, bounded.
 * A draft, an unpublished entry, and a row without a date, a title or its
 * own page are left out — each of those is an entry this app would have had
 * to invent. A body that is not a list of rows is unreadable, not empty.
 */
export const smithersUpdatesOf = (body: unknown): ReadonlyArray<SmithersUpdate> | null => {
  if (!Array.isArray(body)) return null
  const updates: Array<SmithersUpdate> = []
  for (const row of body.slice(0, ROWS_MAX)) {
    if (!isRecord(row) || row.draft === true) continue
    const date = published(row.published_at)
    const url = sourceUrl(row.html_url)
    const title = text(row.name, TITLE_MAX) ?? text(row.tag_name, TITLE_MAX)
    if (date === null || url === null || title === null) continue
    updates.push({ id: url, title, date, url })
  }
  return updates
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, UPDATES_SHOWN)
}

/** What the explore shelf read answered; `unreadable` is never an empty shelf. */
export type LauncherCatalogAnswer = { readonly kind: "read" } | { readonly kind: "unreadable" }

export interface LauncherSnapshots {
  /** Undefined until the first read answers. */
  readonly get: () => { readonly updates: SmithersUpdatesAnswer | undefined; readonly catalog: LauncherCatalogAnswer | undefined }
  readonly subscribe: (listener: () => void) => () => void
}

/** Exactly what the news read needs: a URL and a request init, nothing of the app's own transport. */
export type PublicFetch = (input: string, init?: RequestInit) => Promise<Response>

export interface LauncherSeamOptions {
  /** The window's own fetch, for the public news source. The read carries no credentials by construction. */
  readonly fetch?: PublicFetch
  readonly endpoint?: string
  /** Join the public catalog's rows to the repositories collection, as `/owner/repo` does. Absent on a host with no catalog. */
  readonly loadCatalog?: () => Promise<boolean>
}

/**
 * The launcher seam. The first subscriber starts both reads; each `retry`
 * re-reads after a refusal, which is the only act an honest absent state
 * offers.
 */
export function createLauncherSeam(options: LauncherSeamOptions = {}) {
  const endpoint = options.endpoint ?? SMITHERS_RELEASES_ENDPOINT
  const listeners = new Set<() => void>()
  let answer: SmithersUpdatesAnswer | undefined
  let catalog: LauncherCatalogAnswer | undefined
  let reading: Promise<void> | undefined
  let readingCatalog: Promise<void> | undefined
  let disposed = false
  const notify = (): void => { for (const listener of listeners) listener() }
  const publish = (next: SmithersUpdatesAnswer): void => {
    answer = next
    notify()
  }
  const read = async (): Promise<void> => {
    const request = options.fetch ?? (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined)
    if (disposed || request === undefined) return
    try {
      const response = await request(endpoint, {
        /* Public read. No cookie, no Authorization, no account, no repository. */
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: { accept: "application/vnd.github+json" }
      })
      if (disposed) return
      if (!response.ok) { publish({ kind: "unreadable" }); return }
      const updates = smithersUpdatesOf(await response.json().catch(() => null))
      if (disposed) return
      // A read that answered a list IS authoritative, even when the list is empty.
      publish(updates === null ? { kind: "unreadable" } : { kind: "read", updates })
    } catch {
      // A refused or dropped request: its thrown text is never copy.
      if (!disposed) publish({ kind: "unreadable" })
    }
  }
  const once = (): void => {
    if (disposed || reading !== undefined || answer !== undefined) return
    reading = read().finally(() => { reading = undefined })
  }
  const retry = async (): Promise<void> => {
    if (disposed || reading !== undefined) return reading
    answer = undefined
    reading = read().finally(() => { reading = undefined })
    return reading
  }
  const readCatalog = async (): Promise<void> => {
    if (disposed || options.loadCatalog === undefined) return
    const read = await options.loadCatalog().catch(() => false)
    if (disposed) return
    catalog = read ? { kind: "read" } : { kind: "unreadable" }
    notify()
  }
  const onceCatalog = (): void => {
    if (disposed || readingCatalog !== undefined || catalog !== undefined) return
    readingCatalog = readCatalog().finally(() => { readingCatalog = undefined })
  }
  const retryCatalog = async (): Promise<void> => {
    if (disposed || readingCatalog !== undefined) return readingCatalog
    catalog = undefined
    readingCatalog = readCatalog().finally(() => { readingCatalog = undefined })
    return readingCatalog
  }
  /*
   * One stable object per answer: `useSyncExternalStore` compares snapshots
   * by identity, so a mutated one is a published read nobody repaints.
   */
  let snapshot: { readonly updates: SmithersUpdatesAnswer | undefined; readonly catalog: LauncherCatalogAnswer | undefined } =
    { updates: undefined, catalog: undefined }
  const snapshots: LauncherSnapshots = {
    get: () => {
      if (snapshot.updates !== answer || snapshot.catalog !== catalog) snapshot = { updates: answer, catalog }
      return snapshot
    },
    subscribe: (listener) => {
      listeners.add(listener)
      once()
      onceCatalog()
      return () => { listeners.delete(listener) }
    }
  }
  return { snapshots, retry, retryCatalog, dispose: () => { disposed = true; listeners.clear() } }
}
export type LauncherSeam = ReturnType<typeof createLauncherSeam>
