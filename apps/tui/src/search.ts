/**
 * `text:` in the Ctrl+K palette: ripgrep over the working directory in the
 * background. Literal unless a regex is given, capped, and cancellable. A
 * failure is a typed outcome for the caller to show; there is no fallback.
 * The spawn and process-group kill follow `shell.ts`.
 */
import { spawn } from "node:child_process"

export interface Hit {
  readonly path: string
  readonly line: number
  readonly text: string
}

export type Outcome =
  | { readonly _tag: "done"; readonly hits: ReadonlyArray<Hit>; readonly truncated: boolean }
  | { readonly _tag: "failed"; readonly reason: "missing-rg" | "bad-pattern" | "rg-error"; readonly message: string }
  | { readonly _tag: "cancelled" }

/** The most hits one search returns. */
export const limit = 200

/** The most characters of a matched line kept; rg ignores `--max-columns` with `--json`. */
const maxColumns = 200

const spawnFailure = (error: unknown): Outcome =>
  error instanceof Error && "code" in error && error.code === "ENOENT"
    ? { _tag: "failed", reason: "missing-rg", message: "rg not found" }
    : { _tag: "failed", reason: "rg-error", message: error instanceof Error ? error.message : String(error) }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** rg's `text`, or its base64 `bytes` when the value is not valid UTF-8; `exact` refuses a lossy decode. */
const decode = (data: unknown, exact: boolean): string | undefined => {
  if (!isRecord(data)) return undefined
  if ("text" in data) return typeof data.text === "string" ? data.text : undefined
  if (typeof data.bytes !== "string") return undefined
  const bytes = Buffer.from(data.bytes, "base64")
  const text = bytes.toString("utf8")
  return exact && !Buffer.from(text, "utf8").equals(bytes) ? undefined : text
}

/**
 * One `rg --json` line as a hit, or undefined for any other message. The path
 * is exact, so a hit's mention names its file; a path that is not UTF-8 cannot
 * be named and is skipped. Line text is decoded lossily for display.
 */
export const parse = (line: string): Hit | undefined => {
  let message: unknown
  try {
    message = JSON.parse(line)
  } catch {
    return undefined
  }
  if (!isRecord(message) || message.type !== "match" || !isRecord(message.data)) return undefined
  const data = message.data
  if (typeof data.line_number !== "number" || !Number.isInteger(data.line_number)) return undefined
  const path = decode(data.path, true)
  const text = decode(data.lines, false)
  if (path === undefined || text === undefined) return undefined
  return {
    path: path.replace(/^\.\//, ""),
    line: data.line_number,
    text: text.replace(/\r?\n$/, "").slice(0, maxColumns)
  }
}

export const run = (options: {
  readonly cwd: string
  readonly query: string
  /** `text:/re/`: search this pattern as a regex instead of `query` as a literal. */
  readonly regex?: string
  readonly limit?: number
  /** The rg binary; tests pass a missing or slow one. */
  readonly command?: string
}): { readonly done: Promise<Outcome>; readonly cancel: () => void } => {
  const cap = options.limit ?? limit
  const args = [
    "--json",
    "--smart-case",
    ...(options.regex === undefined ? ["-F"] : []),
    "-e",
    options.regex ?? options.query,
    "--",
    "."
  ]
  let child
  try {
    child = spawn(options.command ?? "rg", args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true
    })
  } catch (error) {
    return { done: Promise.resolve(spawnFailure(error)), cancel: () => {} }
  }
  const hits: Array<Hit> = []
  let pending = ""
  let stderr = ""
  let settled = false
  let resolve: (outcome: Outcome) => void = () => {}
  const done = new Promise<Outcome>((settle) => {
    resolve = settle
  })
  const kill = () => {
    try {
      process.kill(-child.pid!, "SIGTERM")
    } catch {
      child.kill("SIGTERM")
    }
  }
  const finish = (outcome: Outcome) => {
    if (settled) return
    settled = true
    resolve(outcome)
  }
  const take = (line: string) => {
    const hit = parse(line)
    if (hit !== undefined) hits.push(hit)
  }
  child.stdout.setEncoding("utf8")
  child.stdout.on("data", (chunk: string) => {
    if (settled) return
    pending += chunk
    const lines = pending.split("\n")
    pending = lines.pop()!
    for (const line of lines) {
      take(line)
      if (hits.length >= cap) {
        finish({ _tag: "done", hits, truncated: true })
        kill()
        return
      }
    }
  })
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk
  })
  child.on("error", (error) => finish(spawnFailure(error)))
  child.on("close", (code) => {
    if (settled) return
    if (pending !== "") take(pending)
    if (code === 0 || code === 1) return finish({ _tag: "done", hits, truncated: false })
    const first = stderr.split("\n").find((line) => line.trim() !== "") ?? `rg exited with ${code}`
    finish(
      stderr.includes("regex parse error")
        ? { _tag: "failed", reason: "bad-pattern", message: (/^error: (.*)$/m.exec(stderr)?.[1] ?? first).trim() }
        : { _tag: "failed", reason: "rg-error", message: first }
    )
  })
  return {
    done,
    cancel: () => {
      if (settled) return
      finish({ _tag: "cancelled" })
      kill()
    }
  }
}
