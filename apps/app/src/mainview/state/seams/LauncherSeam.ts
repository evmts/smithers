import { AppEntry } from "@smthrs/rpc"
import { FrontDoor, chooseJourney, DEFAULT_CHOICE } from "@smthrs/rpc/FrontDoor"
import type { Facts, JourneyChoice, Known } from "@smthrs/rpc/FrontDoor"
import type { ApplicationTargetDocument } from "@smthrs/rpc/ApplicationTarget"
import bundledRules from "../../../../../../.smithers/front-door.json"

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
  readonly get: () => { readonly updates: SmithersUpdatesAnswer | undefined; readonly catalog: LauncherCatalogAnswer | undefined; readonly frontDoor?: FrontDoorAnswer }
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
  readonly frontDoor?: FrontDoorOptions
}

/**
 * The launcher seam. The first subscriber starts both reads; each `retry`
 * re-reads after a refusal, which is the only act an honest absent state
 * offers.
 */
export function createLauncherSeam(options: LauncherSeamOptions = {}) {
  const endpoint = options.endpoint ?? SMITHERS_RELEASES_ENDPOINT
  const door = createVisitDoor(options.frontDoor, options.fetch)
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
  let snapshot: { readonly updates: SmithersUpdatesAnswer | undefined; readonly catalog: LauncherCatalogAnswer | undefined; readonly frontDoor?: FrontDoorAnswer } =
    { updates: undefined, catalog: undefined }
  door.listen(() => notify())
  const snapshots: LauncherSnapshots = {
    get: () => {
      const frontDoor = door.get()
      if (snapshot.updates !== answer || snapshot.catalog !== catalog || snapshot.frontDoor !== frontDoor) snapshot = { updates: answer, catalog, frontDoor }
      return snapshot
    },
    subscribe: (listener) => {
      listeners.add(listener)
      door.start()
      once()
      onceCatalog()
      return () => { listeners.delete(listener) }
    }
  }
  return { snapshots, retry, retryCatalog, accountChanged: door.accountChanged, shown: door.shown, acted: door.acted,
    dispose: () => { disposed = true; door.dispose(); listeners.clear() } }
}
export type LauncherSeam = ReturnType<typeof createLauncherSeam>

/** The sole browser cache holds public rules, never arrival or account facts. */
export const FRONT_DOOR_CACHE_KEY = "smithers.front-door.rules.v1"
export const FRONT_DOOR_TTL = 10 * 60 * 1000
export const FRONT_DOOR_WAIT = 400

const SOURCE_HOSTS = {
  "effeck.dev": "effeck", "effeck.smithers.sh": "effeck",
  "smithers.smithers.sh": "smithers-site", "github.com": "github",
  "www.google.com": "search", "google.com": "search", "www.bing.com": "search",
  "bing.com": "search", "duckduckgo.com": "search", "x.com": "social", "t.co": "social"
} as const
const SOURCE_TAGS = { ...SOURCE_HOSTS, effeck: "effeck", github: "github", install: "install", "smithers-site": "smithers-site" } as const

interface ArrivalInput {
  readonly href: string
  readonly referrer: string
  readonly replaceUrl?: (url: string) => void
}
/** Read this visit once. Keep only allowlisted hosts; strip every UTM without touching other URL state. */
export function captureArrival(input: ArrivalInput): Pick<Facts, "source" | "sourceHost" | "medium" | "campaign"> {
  const url = new URL(input.href)
  const returned = AppEntry.shouldResumeApp(url.search) || url.searchParams.has("installation_id") || url.searchParams.has("setup_action")
  const source = url.searchParams.get("utm_source")
  const medium = url.searchParams.get("utm_medium")?.slice(0, 32)
  const campaign = url.searchParams.get("utm_campaign")?.slice(0, 64)
  let host = ""
  try { host = new URL(input.referrer).hostname.toLowerCase() } catch { /* Direct visit. */ }
  const knownHost = Object.hasOwn(SOURCE_HOSTS, host)
  const referrerSource = knownHost ? SOURCE_HOSTS[host as keyof typeof SOURCE_HOSTS] : host === "" ? "direct" : "other"
  const tagged = source === null ? undefined : Object.hasOwn(SOURCE_TAGS, source.toLowerCase())
    ? SOURCE_TAGS[source.toLowerCase() as keyof typeof SOURCE_TAGS] : "other"
  const utms = [...url.searchParams.keys()].filter(key => key.toLowerCase().startsWith("utm_"))
  for (const key of utms) url.searchParams.delete(key)
  if (utms.length > 0) input.replaceUrl?.(url.pathname + url.search + url.hash)
  if (returned) return { source: "direct" }
  return {
    source: tagged ?? referrerSource,
    ...(source === null && knownHost ? { sourceHost: host } : {}),
    ...(medium ? { medium } : {}), ...(campaign ? { campaign } : {})
  }
}
export interface FrontDoorAccount {
  /** Account generation, not sent or stored. Changes invalidate every previously derived fact. */
  readonly settled?: boolean
  readonly owner: string
  readonly facts: Pick<Facts, "signedIn" | "ownRepos" | "coveredNotImported" | "activeRuns" | "modelConnections">
}
export interface FrontDoorAnswer {
  readonly choice: JourneyChoice
  readonly pending: boolean
  readonly reserve: boolean
}
export interface FrontDoorCount {
  readonly journey: string
  readonly source: Facts["source"]
  readonly arm: Facts["arm"]
  readonly step: "shown" | "acted"
}
export interface FrontDoorOptions extends ArrivalInput {
  readonly reference: NonNullable<ApplicationTargetDocument["frontDoor"]>
  readonly baseUrl?: string
  readonly account: () => FrontDoorAccount
  readonly storage?: Pick<Storage, "getItem" | "setItem">
  readonly doNotTrack?: string | null
  readonly globalPrivacyControl?: boolean
  readonly random?: () => number
  readonly now?: () => number
  readonly snapshot?: unknown
  readonly readRules?: (url: string, init: RequestInit) => Promise<Response>
  /** pl-fd2 owns delivery. The production default is a no-op. */
  readonly sendCount?: (event: FrontDoorCount) => void
}
export const unknownDoorCount: Known<number> = { state: "unknown" }

const parseRules = (value: unknown): FrontDoor | undefined => {
  const parsed = FrontDoor.safeParse(value)
  return parsed.success ? parsed.data : undefined
}
/** Contents responses use the repository's existing UTF-8/base64 envelope. Raw JSON is useful for immutable snapshots. */
const rulesResponse = async (response: Response): Promise<FrontDoor | undefined> => {
  if (!response.ok) return undefined
  const body: unknown = await response.json()
  const raw = parseRules(body)
  if (raw) return raw
  if (!isRecord(body) || typeof body.content !== "string" || body.content.length > 256 * 1024) return undefined
  let content = body.content
  if (body.encoding === "base64") {
    content = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(content.replace(/\s/g, "")), c => c.charCodeAt(0)))
  } else if (body.encoding !== "utf-8" && body.encoding !== "utf8") return undefined
  return parseRules(JSON.parse(content))
}

function createVisitDoor(options: FrontDoorOptions | undefined, publicFetch: PublicFetch | undefined) {
  let listener = () => {}
  const notify = () => listener()
  const enabled = options !== undefined && new URL(options.href).pathname === "/"
  // Capture before auth return handlers strip their query parameters.
  const arrival = enabled ? captureArrival(options) : { source: "direct" as const }
  const privateVisit = options?.doNotTrack === "1" || options?.doNotTrack === "yes" || options?.globalPrivacyControl === true
  const draw = (options?.random ?? Math.random)()
  const now = options?.now ?? Date.now
  let owner = options?.account().owner
  let answer: FrontDoorAnswer | undefined = enabled ? { choice: DEFAULT_CHOICE, pending: true, reserve: false } : undefined
  let rules: FrontDoor | undefined
  let started = false, finished = false, disposed = false, shown = false, received = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const abort = new AbortController()
  const fallback = (): FrontDoor | undefined => {
    if (!privateVisit) {
      try {
        const raw = options?.storage?.getItem(FRONT_DOOR_CACHE_KEY)
        const cached: unknown = raw ? JSON.parse(raw) : undefined
        if (isRecord(cached) && typeof cached.at === "number" && now() >= cached.at && now() - cached.at < FRONT_DOOR_TTL) {
          const valid = parseRules(cached.rules)
          if (valid) return valid
        }
      } catch { /* Denied, malformed or unavailable browser cache. */ }
    }
    return parseRules(options?.snapshot === undefined ? bundledRules : options.snapshot)
  }
  const choose = (pending: boolean): void => {
    if (!options || !answer) return
    const account = options.account()
    const facts: Facts = { ...account.facts, ...arrival,
      arm: !account.facts.signedIn && draw < (rules?.holdoutShare ?? 0.1) ? "hold" : "treat" }
    const choice = rules ? chooseJourney(rules, facts) : DEFAULT_CHOICE
    answer = { choice, pending, reserve: (choice.lead.length > 0 || pending && (rules?.journeys.length ?? 0) > 0) }
  }
  const accountChanged = (): void => {
    if (!options || !answer || disposed) return
    const next = options.account().owner
    if (next !== owner) {
      owner = next
      // Clear synchronously. A new account never inherits a lead from this page's earlier identity.
      answer = { choice: DEFAULT_CHOICE, pending: !finished, reserve: false }
      shown = false
      if (!finished) choose(true)
    } else if (!finished) choose(true)
    notify()
  }
  const start = (): void => {
    if (!enabled || !options || started || disposed) return
    started = true
    // A validated snapshot reserves space while the account reads are still unknown.
    rules = parseRules(options.snapshot === undefined ? bundledRules : options.snapshot)
    choose(true)
    const finish = () => {
      if (disposed || finished) return
      finished = true
      clearTimeout(timer)
      choose(false)
      notify()
    }
    timer = setTimeout(() => {
      abort.abort()
      rules = received ? rules : fallback()
      finish()
    }, FRONT_DOOR_WAIT)
    const ref = options.reference
    const path = ref.path.split("/").map(encodeURIComponent).join("/")
    const url = (options.baseUrl ?? "") + "/api/repos/" + ref.repo.split("/").map(encodeURIComponent).join("/") + "/contents/" + path
    const fetch = options.readRules ?? publicFetch ?? globalThis.fetch?.bind(globalThis)
    if (!fetch) { rules = fallback(); finish(); return }
    void fetch(url, { credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", signal: abort.signal })
      .then(rulesResponse).catch(() => undefined).then(valid => {
        if (disposed || finished) return
        received = true
        rules = valid ?? fallback()
        if (valid && !privateVisit) {
          try { options.storage?.setItem(FRONT_DOOR_CACHE_KEY, JSON.stringify({ at: now(), rules: valid })) } catch { /* Optional public cache. */ }
        }
        // Give the existing account reads the rest of the same 400ms window.
        choose(true)
        if (options.account().settled !== false && (!options.account().facts.signedIn || options.account().facts.ownRepos.state === "known") || rules?.journeys.length === 0) finish()
        else notify()
      })
  }
  const send = (step: FrontDoorCount["step"]) => {
    if (!options || privateVisit || !answer || answer.pending || answer.choice.lead.length === 0) return
    const account = options.account()
    options.sendCount?.({ journey: answer.choice.journey, source: arrival.source,
      arm: account.facts.signedIn || draw >= (rules?.holdoutShare ?? 0.1) ? "treat" : "hold", step })
  }
  return {
    listen: (next: () => void) => { listener = next },
    get: () => {
      if (options && owner !== options.account().owner) accountChanged()
      return answer
    },
    start, accountChanged,
    shown: () => { if (!shown && answer && !answer.pending && answer.choice.lead.length > 0) { shown = true; send("shown") } },
    acted: () => send("acted"),
    dispose: () => { disposed = true; clearTimeout(timer); abort.abort() }
  }
}
