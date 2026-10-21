// A local stand-in for the alert providers (docs/features/spend-alerts.md#channels): one HTTP server on loopback that
// answers Resend's `POST /emails` and the Bot API's `POST /bot<token>/sendMessage` as they do, and keeps every request
// it took. Tests and the end-to-end spec point `@smthrs/notifications`' `Channels` at it as the providers' URL: a real
// dependency at the HTTP boundary, with no real send.
import { createServer, type IncomingHttpHeaders } from "node:http"
import type { AddressInfo } from "node:net"

/** One request the providers took: which provider, its path, headers and JSON body. */
export interface Received {
  readonly provider: "email" | "telegram" | "unknown"
  readonly path: string
  readonly headers: IncomingHttpHeaders
  readonly body: Record<string, unknown>
}

/** An answer a test queues for the next request: a status and a JSON body, and headers. */
export interface Answer {
  readonly status: number
  readonly json?: unknown
  readonly headers?: Readonly<Record<string, string>>
}

/** The answer each provider gives when no test queued one: an email id, or a Telegram message id. */
const accepted = (provider: Received["provider"], count: number): Answer =>
  provider === "email"
    ? { status: 200, json: { id: `email-${count}` } }
    : provider === "telegram"
    ? { status: 200, json: { ok: true, result: { message_id: count } } }
    : { status: 404, json: { ok: false, description: "Not Found" } }

/**
 * Starts the providers on `port` (any free one when 0) and resolves once they listen: their `url`, every request they
 * took, `answer` to queue the next answers, and `close`.
 */
export const startAlertProviders = async (port = 0) => {
  const received: Array<Received> = []
  const queued: Array<Answer> = []
  const server = createServer((request, response) => {
    let raw = ""
    request.setEncoding("utf8")
    request.on("data", (chunk: string) => (raw += chunk))
    request.on("end", () => {
      const path = request.url ?? ""
      const provider = path === "/emails" ? "email" : /^\/bot[^/]+\/sendMessage$/u.test(path) ? "telegram" : "unknown"
      received.push({ provider, path, headers: request.headers, body: raw === "" ? {} : JSON.parse(raw) })
      const answer = queued.shift() ?? accepted(provider, received.length)
      response.writeHead(answer.status, { "content-type": "application/json", ...answer.headers })
      response.end(JSON.stringify(answer.json ?? {}))
    })
  })
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    received,
    answer: (...answers: ReadonlyArray<Answer>) => void queued.push(...answers),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

/** The running providers. */
export type AlertProviders = Awaited<ReturnType<typeof startAlertProviders>>
