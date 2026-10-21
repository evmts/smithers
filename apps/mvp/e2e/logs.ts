import { expect } from "@playwright/test"
import { open, readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { baseURL, guard, target } from "./target"

// ChatApi's records, for the e2e tests that read what it recorded (docs/observability.md): its own, the remote flows'
// its `FlowExecution` objects ran, and the browser's and the engine worker's OTLP records it relayed (`otlp.signal`).
// Locally `alchemy dev` writes each Worker's log under `.alchemy/log/dev_<user>/<Worker>/`. A deployment's come from a
// Cloudflare tail on ChatApi's script (`CloudflareTail`), which needs `CLOUDFLARE_API_TOKEN` (Workers Tail read) and
// `CLOUDFLARE_ACCOUNT_ID`. A test that reads them declares `requires("localLogs")`, or reads them only where
// `partly("localLogs")` says it can (e2e/target.ts).

const LOG_ROOT = fileURLToPath(new URL("../.alchemy/log", import.meta.url))

export type LogRecord = { message?: unknown; level?: string; annotations?: Record<string, unknown>; [key: string]: unknown }
export type Line = { worker: string; file: string; text: string; record?: LogRecord }

/** A tail's log message as a record: the structured logger's JSON line, parsed, or the object it logged. */
export const recordOf = (message: unknown): LogRecord | undefined => {
  let parsed: unknown = message
  if (typeof message === "string") {
    try {
      parsed = JSON.parse(message)
    } catch {
      return undefined
    }
  }
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as LogRecord : undefined
}

/** The ChatApi script a deployment's tail opens on: `E2E_CHATAPI_SCRIPT`, else the one named for `E2E_STAGE` (prod). */
const SCRIPT_PREFIX = (stage: string) => `smithers-mvp-chatapi-${stage}-`

/**
 * A Cloudflare tail on a deployment's ChatApi script, one per test process: the records it has streamed since it
 * opened, in arrival order. Opened on first use and deleted when the process ends or `close` is called. Prints and
 * keeps no token, header or request body: only each log line's own text.
 */
export class CloudflareTail {
  private static opened: Promise<CloudflareTail> | undefined
  readonly lines: Array<Line> = []

  private constructor(
    private readonly api: string,
    private readonly headers: Record<string, string>,
    private readonly id: string,
    private readonly socket: WebSocket,
  ) {}

  /** The process's tail, opened now if it isn't. */
  static shared(env: NodeJS.ProcessEnv = process.env): Promise<CloudflareTail> {
    CloudflareTail.opened ??= CloudflareTail.open(env)
    return CloudflareTail.opened
  }

  private static async open(env: NodeJS.ProcessEnv): Promise<CloudflareTail> {
    const token = env.CLOUDFLARE_API_TOKEN ?? ""
    const account = env.CLOUDFLARE_ACCOUNT_ID ?? ""
    if (token === "" || account === "") throw new Error("A deployment's logs need CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID")
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" }
    const scripts = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts`
    const script = env.E2E_CHATAPI_SCRIPT ?? await CloudflareTail.script(scripts, headers, env.E2E_STAGE ?? "prod")
    const api = `${scripts}/${script}/tails`
    const created = await (await fetch(api, { method: "POST", headers, body: "{}" })).json() as {
      success: boolean
      errors?: Array<{ code: number }>
      result?: { id: string; url: string }
    }
    if (!created.success || created.result === undefined) {
      throw new Error(`Cloudflare refused a tail on ${script}: ${JSON.stringify(created.errors?.map((error) => error.code))}`)
    }
    const socket = new WebSocket(created.result.url, "trace-v1")
    const tail = new CloudflareTail(api, headers, created.result.id, socket)
    socket.addEventListener("message", (event) => void tail.receive(event.data))
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true })
      socket.addEventListener("error", () => reject(new Error(`The tail on ${script} didn't connect`)), { once: true })
    })
    socket.send(JSON.stringify({ filters: [], debug: false }))
    process.once("beforeExit", () => void tail.close())
    await tail.streaming(new URL("/api/repos/app/x/about", baseURL))
    return tail
  }

  /**
   * Waits until the tail streams: a new tail starts sending a moment after it connects, and a record written before
   * then is lost. Reads `probe` (a refused read that writes nothing and logs its `repo.about` line) every 2 seconds
   * until a line arrives, for at most 30 seconds.
   */
  private async streaming(probe: URL) {
    for (let tries = 0; tries < 15 && this.lines.length === 0; tries++) {
      // The next line, or two seconds without one.
      const arrived = new Promise<void>((resolve) => {
        this.arrivals.push(resolve)
        AbortSignal.timeout(2_000).addEventListener("abort", () => resolve(), { once: true })
      })
      await fetch(probe).then((response) => response.body?.cancel(), () => undefined)
      await arrived
    }
  }

  /** Who waits for the next line. */
  private readonly arrivals: Array<() => void> = []

  /** The one script whose name starts with the stage's ChatApi prefix; only the scripts' ids are read. */
  private static async script(scripts: string, headers: Record<string, string>, stage: string): Promise<string> {
    const listed = await (await fetch(scripts, { headers })).json() as { result?: Array<{ id: string }> }
    const ids = (listed.result ?? []).map((script) => script.id).filter((id) => id.startsWith(SCRIPT_PREFIX(stage)))
    if (ids.length !== 1) throw new Error(`Expected one ChatApi script for stage ${stage}, found ${ids.length}; set E2E_CHATAPI_SCRIPT`)
    return ids[0]!
  }

  /** One tail event: each of its log lines, its JSON parsed when it is JSON. */
  private async receive(data: unknown) {
    const text = typeof data === "string" ? data : Buffer.from(await (data as Blob).arrayBuffer()).toString("utf8")
    let event: { logs?: Array<{ message?: Array<unknown> }> }
    try {
      event = JSON.parse(text)
    } catch {
      return
    }
    for (const log of event.logs ?? []) {
      for (const message of log.message ?? []) {
        const record = recordOf(message)
        const text = typeof message === "string" ? message : JSON.stringify(message)
        this.lines.push({ worker: "ChatApi", file: "tail", text, ...(record === undefined ? {} : { record }) })
        for (const resolve of this.arrivals.splice(0)) resolve()
      }
    }
  }

  /** Deletes the tail; the process's next `shared` opens another. */
  async close() {
    if (CloudflareTail.opened === undefined) return
    CloudflareTail.opened = undefined
    this.socket.close()
    await fetch(`${this.api}/${this.id}`, { method: "DELETE", headers: this.headers }).catch(() => undefined)
  }
}

// The lines each Worker's log gains from now on. Locally files that already exist are read from their current end,
// and files `alchemy dev` starts after a reload are read whole; in a deployment, the tail's lines after `start`.
export class LogTail {
  private constructor(
    private readonly offsets: Map<string, number>,
    private readonly tail?: { readonly source: CloudflareTail; readonly from: number },
  ) {}

  private static async files() {
    const files: Array<{ worker: string; path: string }> = []
    const users = (await readdir(LOG_ROOT, { withFileTypes: true }).catch(() => [])).filter((entry) => entry.isDirectory() && entry.name.startsWith("dev_"))
    for (const user of users) {
      for (const worker of await readdir(join(LOG_ROOT, user.name), { withFileTypes: true })) {
        if (!worker.isDirectory()) continue
        const dir = join(LOG_ROOT, user.name, worker.name)
        for (const file of await readdir(dir)) if (file.endsWith(".log")) files.push({ worker: worker.name, path: join(dir, file) })
      }
    }
    return files
  }

  static async start() {
    guard("localLogs")
    if (target === "deployment") {
      const source = await CloudflareTail.shared()
      return new LogTail(new Map(), { source, from: source.lines.length })
    }
    const offsets = new Map<string, number>()
    for (const { path } of await LogTail.files()) offsets.set(path, (await stat(path)).size)
    expect([...offsets.keys()].some((path) => path.includes("/ChatApi/")), `alchemy dev writes ChatApi's log under ${LOG_ROOT}`).toBe(true)
    return new LogTail(offsets)
  }

  async lines(): Promise<Array<Line>> {
    if (this.tail !== undefined) return this.tail.source.lines.slice(this.tail.from)
    const lines: Array<Line> = []
    for (const { worker, path } of await LogTail.files()) {
      const from = this.offsets.get(path) ?? 0
      const handle = await open(path, "r")
      try {
        const { size } = await handle.stat()
        if (size <= from) continue
        const buffer = Buffer.alloc(size - from)
        await handle.read(buffer, 0, buffer.length, from)
        for (const text of buffer.toString("utf8").split("\n")) {
          if (text.trim() === "") continue
          let record: LogRecord | undefined
          try {
            record = JSON.parse(text) as LogRecord
          } catch {
            record = undefined
          }
          lines.push({ worker, file: path, text, record })
        }
      } finally {
        await handle.close()
      }
    }
    return lines
  }

  /** Deletes a deployment's tail now rather than when the process ends; locally, nothing. */
  async dispose() {
    await this.tail?.source.close()
  }

  // ChatApi's JSON records: its own, and the browser's it relayed (they carry `otlp.signal`).
  async records() {
    const records = (await this.lines()).filter((line) => line.worker === "ChatApi" && line.record !== undefined).map((line) => line.record!)
    const relayed = (record: LogRecord) => record.annotations?.["otlp.signal"] !== undefined
    return { own: records.filter((record) => !relayed(record)), browser: records.filter(relayed) }
  }
}

// A record's trace id, wherever its logger put it: top level or annotations, as trace_id, traceId or trace.id.
export const traceIdOf = (record: LogRecord | undefined): string | undefined => {
  if (record === undefined) return undefined
  for (const fields of [record, record.annotations ?? {}]) {
    for (const [key, value] of Object.entries(fields)) {
      if (/^trace(_|\.)?id$/i.test(key) && typeof value === "string") return value
    }
  }
  return undefined
}

export const field = (record: LogRecord, name: string) => record.annotations?.[name]
