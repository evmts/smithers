import { expect } from "@playwright/test"
import { open, readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// The local Workers' logs, for the e2e tests that read what ChatApi recorded (docs/observability.md). Locally
// `alchemy dev` writes each Worker's log under `.alchemy/log/dev_<user>/<Worker>/`, and ChatApi's log also holds the
// browser's and the engine worker's OTLP records it relayed (`otlp.signal`). A deployment's logs are in Workers Logs,
// which these helpers can't read, so a test that uses them runs locally only (`local`).

const baseURL = process.env.BASE_URL ?? "http://localhost:1337"

/** Whether the tests run against the local `alchemy dev`, whose logs these helpers read. */
export const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(baseURL)

/** Why a log-reading test skips against a deployment. */
export const remoteReason = `BASE_URL ${baseURL} is a deployment: its logs are in Workers Logs, not in local .alchemy/log files`

const LOG_ROOT = fileURLToPath(new URL("../.alchemy/log", import.meta.url))

export type LogRecord = { message?: unknown; level?: string; annotations?: Record<string, unknown>; [key: string]: unknown }
export type Line = { worker: string; file: string; text: string; record?: LogRecord }

// The lines each Worker's local log gains from now on: files that already exist are read from their current end,
// and files `alchemy dev` starts after a reload are read whole.
export class LogTail {
  private constructor(private readonly offsets: Map<string, number>) {}

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
    const offsets = new Map<string, number>()
    for (const { path } of await LogTail.files()) offsets.set(path, (await stat(path)).size)
    expect([...offsets.keys()].some((path) => path.includes("/ChatApi/")), `alchemy dev writes ChatApi's log under ${LOG_ROOT}`).toBe(true)
    return new LogTail(offsets)
  }

  async lines(): Promise<Array<Line>> {
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
