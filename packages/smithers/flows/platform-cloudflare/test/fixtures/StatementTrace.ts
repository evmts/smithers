/**
 * A TCP proxy in front of Postgres that records every statement a client
 * sends (the text of each simple `Query` and each extended-protocol `Parse`)
 * and counts round trips (each `Sync` or simple `Query` waits for the
 * server). A suite reads what one stretch of work cost the database.
 */
import * as Effect from "effect/Effect"
import type * as Scope from "effect/Scope"
import { type AddressInfo, createServer, Socket } from "node:net"

export interface Trace {
  /** The proxy's URL: `url` with the proxy's host and port. */
  readonly url: string
  /** Each statement's first 160 characters, with when it was sent, in order. */
  readonly statements: Array<{ readonly at: number; readonly sql: string }>
  /** Round trips so far. */
  readonly roundTrips: () => number
}

export const proxy = (url: string): Effect.Effect<Trace, never, Scope.Scope> =>
  Effect.gen(function*() {
    const target = new URL(url)
    const statements: Array<{ readonly at: number; readonly sql: string }> = []
    let trips = 0
    const sockets = new Set<Socket>()
    const server = createServer((client) => {
      const upstream = new Socket()
      sockets.add(client)
      sockets.add(upstream)
      let buffer = Buffer.alloc(0)
      let started = false
      client.on("data", (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk])
        for (;;) {
          if (!started) {
            if (buffer.length < 4) break
            const length = buffer.readInt32BE(0)
            if (buffer.length < length) break
            buffer = buffer.subarray(length)
            started = true
            continue
          }
          if (buffer.length < 5) break
          const type = String.fromCharCode(buffer[0]!)
          const length = buffer.readInt32BE(1)
          if (buffer.length < 1 + length) break
          const body = buffer.subarray(5, 1 + length)
          if (type === "Q") {
            trips++
            statements.push({ at: Date.now(), sql: body.toString("utf8").replace(/\0.*$/s, "").slice(0, 160) })
          } else if (type === "P") {
            const nameEnd = body.indexOf(0)
            const sql = body.subarray(nameEnd + 1).toString("utf8").replace(/\0.*$/s, "")
            statements.push({ at: Date.now(), sql: sql.replace(/\s+/g, " ").slice(0, 160) })
          } else if (type === "S") {
            trips++
          }
          buffer = buffer.subarray(1 + length)
        }
        upstream.write(chunk)
      })
      upstream.on("data", (chunk) => client.write(chunk))
      const end = () => {
        client.destroy()
        upstream.destroy()
      }
      client.on("close", end)
      upstream.on("close", end)
      client.on("error", end)
      upstream.on("error", end)
      upstream.connect(Number(target.port || 5432), target.hostname)
    })
    yield* Effect.callback<void>((resume) => {
      server.listen(0, "127.0.0.1", () => resume(Effect.void))
    })
    yield* Effect.addFinalizer(() =>
      Effect.callback<void>((resume) => {
        for (const socket of sockets) socket.destroy()
        server.close(() => resume(Effect.void))
      })
    )
    const address = server.address() as AddressInfo
    const proxied = new URL(url)
    proxied.hostname = "127.0.0.1"
    proxied.port = String(address.port)
    return { url: proxied.toString(), statements, roundTrips: () => trips }
  })
