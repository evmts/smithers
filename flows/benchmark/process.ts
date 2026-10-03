import { spawn } from "node:child_process"
import { appendFile } from "node:fs/promises"
import type { Readable } from "node:stream"
import { StringDecoder } from "node:string_decoder"

/** Retain a possible secret prefix until its following chunk arrives, including encoded forms. */
function redactor(secrets: ReadonlyArray<string>) {
  const patterns = [
    ...new Set(
      secrets.filter(Boolean).flatMap((secret) => {
        const json = JSON.stringify(secret).slice(1, -1)
        return [
          secret,
          json,
          json.replace(
            /[\u0080-\uffff]/g,
            (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
          ),
          encodeURIComponent(secret),
          Buffer.from(secret).toString("base64")
        ]
      })
    )
  ].sort((a, b) => b.length - a.length)
  const keep = Math.max(0, ...patterns.map((pattern) => pattern.length - 1))
  let pending = ""
  const decoder = new StringDecoder("utf8")
  return (chunk?: Buffer): string => {
    pending += chunk === undefined ? decoder.end() : decoder.write(chunk)
    let boundary = chunk === undefined ? pending.length : Math.max(0, pending.length - keep)
    // UTF-8 decoding gives complete characters; the retained suffix must not split a surrogate pair again.
    if (
      boundary > 0 && /[\ud800-\udbff]/.test(pending[boundary - 1]!) && /[\udc00-\udfff]/.test(pending[boundary] ?? "")
    ) boundary--
    let cursor = 0
    let emitted = ""
    while (cursor < boundary) {
      let position = pending.length
      let length = 0
      for (const pattern of patterns) {
        const found = pending.indexOf(pattern, cursor)
        if (found >= 0 && found < position) {
          position = found
          length = pattern.length
        }
      }
      if (position >= boundary) {
        emitted += pending.slice(cursor, boundary)
        cursor = boundary
        break
      }
      emitted += pending.slice(cursor, position) + "[REDACTED]"
      cursor = position + length
    }
    pending = pending.slice(cursor)
    return emitted
  }
}

/** Redact a complete diagnostic with the same encoded-secret rules as streamed process output. */
export function redactDiagnostic(value: string, secrets: ReadonlyArray<string>): string {
  const redact = redactor(secrets)
  return redact(Buffer.from(value)) + redact()
}

/** Operator-owned argv only. Credentials travel in env; child diagnostics never enter thrown errors. */
export async function command(argv: ReadonlyArray<string>, options: {
  cwd?: string
  env?: NodeJS.ProcessEnv
  signal?: AbortSignal
  log?: string
  secrets?: ReadonlyArray<string>
  allowed?: ReadonlyArray<number>
} = {}): Promise<string> {
  if (!argv.length || !argv[0]) throw new Error("Process command is empty")
  if (options.signal?.aborted) throw new Error("operation cancelled")
  const child = spawn(argv[0], argv.slice(1), {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32"
  })
  const kill = (signal: NodeJS.Signals) => {
    if (child.pid === undefined) return
    try {
      if (process.platform === "win32") child.kill(signal)
      else process.kill(-child.pid, signal)
    } catch { /* The process group may have already exited. */ }
  }
  let killTimer: ReturnType<typeof setTimeout> | undefined
  const abort = () => {
    kill("SIGTERM")
    killTimer ??= setTimeout(() => kill("SIGKILL"), 250)
    killTimer.unref()
  }
  options.signal?.addEventListener("abort", abort, { once: true })
  if (options.signal?.aborted) abort()
  const completed = new Promise<number>((resolve, reject) => {
    child.once("error", () => reject(new Error(`${argv[0]} could not start`)))
    child.once("close", (code) => resolve(code ?? 128))
  })
  let stdout = "", bytes = 0
  const redactLog = redactor(options.secrets ?? [])
  let logging = Promise.resolve()
  const logText = (text: string, final = false) => {
    const safe = final ? redactLog() : redactLog(Buffer.from(text))
    if (options.log !== undefined && safe) logging = logging.then(() => appendFile(options.log!, safe, { mode: 0o600 }))
    return logging
  }
  const drain = async (stream: Readable, capture: boolean) => {
    const redact = redactor(options.secrets ?? [])
    const emit = async (text: string) => {
      if (options.log !== undefined && text) await logText(text)
      if (capture && stdout.length < 1024 * 1024) stdout += text.slice(0, 1024 * 1024 - stdout.length)
    }
    for await (const chunk of stream) {
      bytes += (chunk as Buffer).length
      await emit(redact(chunk as Buffer))
    }
    await emit(redact())
  }
  try {
    const [code] = await Promise.all([completed, drain(child.stdout, true), drain(child.stderr, false)])
    await logText("", true)
    if (options.signal?.aborted) throw new Error("operation cancelled")
    if (!(options.allowed ?? [0]).includes(code)) throw new Error(`${argv[0]} exited ${code}`)
    if (bytes >= 1024 * 1024 && options.log === undefined) throw new Error(`${argv[0]} output exceeded 1 MiB`)
    return stdout.trim()
  } finally {
    options.signal?.removeEventListener("abort", abort)
    if (killTimer !== undefined) clearTimeout(killTimer)
    // Also remove descendants that outlive an aborted or failed parent, even when they close stdio.
    if (options.signal?.aborted || child.exitCode === null) kill("SIGKILL")
  }
}
