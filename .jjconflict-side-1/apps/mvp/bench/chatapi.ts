// Electric's `messages` shape through ChatApi's proxy, over plain HTTP from Node (docs/features/chat.md#contract): the
// bench's view of the server, beside the browsers' view of the app. Node never asks: nothing would answer a question it
// posted, so the pages ask (docs/benchmarks.md#method).
//
// Times are epoch milliseconds with sub-millisecond precision (`performance.timeOrigin + performance.now()`), the
// same clock the pages report on, since everything runs on one machine.

/** Now, comparable with a page's `performance.timeOrigin + performance.now()`. */
export const now = () => performance.timeOrigin + performance.now()

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** A `messages` row as Electric sends it: snake_case columns, every value a JSON value. */
export type Row = {
  id: string
  role?: string
  text?: string
  status?: string
  question_id?: string | null
  failure?: string | null
  [column: string]: unknown
}

/** One message of Electric's shape log: a change to a row, or a control message such as `up-to-date`. */
export type ShapeMessage = {
  key?: string
  value?: Partial<Row>
  headers: { operation?: "insert" | "update" | "delete"; control?: string }
}

/**
 * Applies a shape response to `rows`, keyed by `id`: an insert sets a row, an update merges the columns it carries
 * (Electric sends the primary key and the changed columns), a delete removes it. Returns the ids it changed, and
 * whether the response ended up to date.
 */
export const apply = (rows: Map<string, Row>, messages: ReadonlyArray<ShapeMessage>) => {
  const changed = new Set<string>()
  let upToDate = false
  for (const message of messages) {
    if (message.headers.control === "up-to-date") upToDate = true
    const id = message.value?.id
    if (message.key === undefined || id === undefined) continue
    const operation = message.headers.operation
    if (operation === "delete") rows.delete(id)
    else if (operation === "insert") rows.set(id, { ...message.value, id })
    else if (operation === "update") rows.set(id, { ...rows.get(id), ...message.value, id })
    else continue
    changed.add(id)
  }
  return { changed, upToDate }
}

const shapeUrl = (baseUrl: string, params: Record<string, string | undefined>) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, value)
  return `${baseUrl}/api/shapes/messages?${search}`
}

export type InitialSync = {
  /** From the first request to the response that ended up to date. */
  ms: number
  rows: Map<string, Row>
  /** Row changes replayed: Electric's log holds every insert and update since the shape began, not just one per row. */
  operations: number
  requests: number
  /** JSON bytes received, after any content decoding. */
  bytes: number
}

/**
 * What a new device does first: requests the shape from `offset=-1`, with no handle, and follows Electric's
 * `electric-offset` and `electric-handle` until a response ends with `up-to-date`. Not live: it ends there.
 */
export const initialSync = async (baseUrl: string, timeoutMs = 30_000): Promise<InitialSync> => {
  const rows = new Map<string, Row>()
  const startedAt = now()
  const deadline = startedAt + timeoutMs
  let offset = "-1"
  let handle: string | undefined
  let requests = 0
  let operations = 0
  let bytes = 0
  for (;;) {
    if (now() > deadline) throw new Error(`the shape wasn't up to date after ${timeoutMs} ms and ${requests} requests`)
    const response = await fetch(shapeUrl(baseUrl, { offset, handle }), { signal: AbortSignal.timeout(timeoutMs) })
    requests++
    if (!response.ok) throw new Error(`GET /api/shapes/messages answered ${response.status} at offset ${offset}`)
    const body = await response.text()
    bytes += Buffer.byteLength(body)
    const messages = JSON.parse(body) as Array<ShapeMessage>
    operations += messages.filter((message) => message.key !== undefined).length
    handle = response.headers.get("electric-handle") ?? handle
    offset = response.headers.get("electric-offset") ?? offset
    if (apply(rows, messages).upToDate) return { ms: now() - startedAt, rows, operations, requests, bytes }
  }
}

/** When this follower first saw a row, its first text, and its settling (`status` no longer `streaming`). 0: not yet. */
export type Timeline = { seenAt: number; firstTextAt: number; settledAt: number }

/**
 * A device that only listens: follows the shape live from `offset=now`, so it holds only rows written after it
 * started, and records when each row, and each change to it, reached it.
 */
export class Follower {
  readonly rows = new Map<string, Row>()
  readonly timelines = new Map<string, Timeline>()
  /** Electric answered 409 (`must-refetch`); the follower started again from `offset=now`. */
  refetches = 0
  /** Requests that failed or answered another error; each is retried after a second. */
  errors = 0
  readonly #baseUrl: string
  readonly #abort = new AbortController()
  readonly #waiters = new Set<() => void>()
  #loop: Promise<void> | undefined

  constructor(baseUrl: string) {
    this.#baseUrl = baseUrl
  }

  async #request(params: Record<string, string | undefined>) {
    const response = await fetch(shapeUrl(this.#baseUrl, params), { signal: this.#abort.signal })
    const messages = response.ok ? ((await response.json()) as Array<ShapeMessage>) : (await response.body?.cancel(), [])
    return {
      status: response.status,
      at: now(),
      messages,
      handle: response.headers.get("electric-handle") ?? undefined,
      offset: response.headers.get("electric-offset") ?? undefined,
      cursor: response.headers.get("electric-cursor") ?? undefined,
    }
  }

  /** Joins the shape at `offset=now`; fails when ChatApi's proxy or Electric doesn't answer. */
  async start() {
    const first = await this.#request({ offset: "now" })
    if (first.status !== 200) throw new Error(`GET /api/shapes/messages?offset=now answered ${first.status}`)
    this.#loop = this.#follow(first)
  }

  async #follow(start: { handle?: string; offset?: string; cursor?: string }) {
    let { handle, offset, cursor } = start
    while (!this.#abort.signal.aborted) {
      try {
        const response = await this.#request({ offset, handle, live: "true", cursor })
        if (response.status === 409) {
          this.refetches++
          ;({ handle, offset, cursor } = await this.#request({ offset: "now" }))
          continue
        }
        if (response.status !== 200 && response.status !== 204) throw new Error(`HTTP ${response.status}`)
        this.#receive(response.messages, response.at)
        handle = response.handle ?? handle
        offset = response.offset ?? offset
        cursor = response.cursor ?? cursor
      } catch {
        if (this.#abort.signal.aborted) return
        this.errors++
        await sleep(1_000)
      }
    }
  }

  #receive(messages: ReadonlyArray<ShapeMessage>, at: number) {
    for (const id of apply(this.rows, messages).changed) {
      const timeline = this.timelines.get(id) ?? { seenAt: at, firstTextAt: 0, settledAt: 0 }
      const row = this.rows.get(id)
      if (row?.text && timeline.firstTextAt === 0) timeline.firstTextAt = at
      if (row?.status !== undefined && row.status !== "streaming" && timeline.settledAt === 0) timeline.settledAt = at
      this.timelines.set(id, timeline)
    }
    for (const waiter of this.#waiters) waiter()
  }

  /** Resolves with `read()` once it is defined, checked after every response; rejects after `timeoutMs`. */
  until<T>(read: () => T | undefined, timeoutMs: number, what: string): Promise<T> {
    const value = read()
    if (value !== undefined) return Promise.resolve(value)
    return new Promise((resolve, reject) => {
      const check = () => {
        const value = read()
        if (value === undefined) return
        done()
        resolve(value)
      }
      const timer = setTimeout(() => {
        done()
        reject(new Error(`no ${what} from Electric after ${timeoutMs} ms`))
      }, timeoutMs)
      const done = () => {
        clearTimeout(timer)
        this.#waiters.delete(check)
      }
      this.#waiters.add(check)
    })
  }

  /** The newest question whose text contains `word`. */
  questionWith(word: string): Row | undefined {
    let found: Row | undefined
    for (const row of this.rows.values()) if (row.role === "user" && row.text?.includes(word)) found = row
    return found
  }

  answerTo(questionId: string): Row | undefined {
    for (const row of this.rows.values()) if (row.question_id === questionId) return row
    return undefined
  }

  async stop() {
    this.#abort.abort()
    await this.#loop
  }
}

/** A settled row (`done` or `failed`), or `undefined` while it is missing or still streaming. */
export const settled = (row: Row | undefined) =>
  row?.status !== undefined && row.status !== "streaming" ? row : undefined
