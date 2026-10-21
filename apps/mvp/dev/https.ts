/**
 * HTTPS and HTTP/2 in front of the dev server, so local development speaks the protocol production does
 * (docs/infrastructure.md#https-and-http2).
 *
 * `alchemy dev` serves the app over plain HTTP/1.1 at http://localhost:1337, where a browser opens at most six
 * connections to one origin. Each Electric shape a tab follows waits in a long poll on one of them, and a tab follows
 * more than six, so the rest queue: a change waited up to a long poll or two (about 40 s) to reach another device.
 * Cloudflare serves the deployed app over HTTP/2 and HTTP/3, which carry every request on one connection. This plugin
 * serves the same dev server at https://localhost:1443 over HTTP/2.
 *
 * Each request goes on to Vite's own address over HTTP/1.1, with `x-forwarded-proto: https` and `x-forwarded-host`,
 * so the Workers see the URL the browser asked for. A WebSocket comes over HTTP/1.1 (this server offers HTTP/2's
 * extended CONNECT to nobody, so a browser opens a connection of its own for each socket) and is piped as bytes.
 */
import { execFileSync } from "node:child_process"
import { X509Certificate } from "node:crypto"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import * as http from "node:http"
import * as http2 from "node:http2"
import * as net from "node:net"
import { join } from "node:path"
import type { Duplex } from "node:stream"
import type { Plugin } from "vite"

/** Where the dev server is served over HTTPS and HTTP/2 unless `DEV_HTTPS_PORT` says otherwise. */
export const DEV_HTTPS_PORT = 1443

/** The app's dev URL over HTTPS and HTTP/2: what the end-to-end tests open unless `BASE_URL` names another. */
export const DEV_URL = `https://localhost:${DEV_HTTPS_PORT}`

/** A certificate and its private key, PEM-encoded. */
export interface Certificate {
  readonly cert: Buffer
  readonly key: Buffer
}

/** Runs a program to completion, throwing if it can't start or fails. `execFileSync` unless a test injects one. */
export type Run = (file: string, args: ReadonlyArray<string>) => void

/** The runner `makeCertificate` uses unless given another: a missing program fails with the code `ENOENT`. */
export const runProgram: Run = (file, args) => {
  execFileSync(file, args, { stdio: "ignore" })
}

/**
 * Makes a certificate for this machine's loopback names into `certFile` and `keyFile`, and says which tool made it:
 * mkcert, whose certificates browsers trust once `mkcert -install` added its CA to the system's store, or else
 * openssl, whose self-signed certificate a browser trusts only when told to.
 */
export const makeCertificate = (certFile: string, keyFile: string, run: Run = runProgram): "mkcert" | "openssl" => {
  try {
    run("mkcert", ["-cert-file", certFile, "-key-file", keyFile, "localhost", "127.0.0.1", "::1"])
    return "mkcert"
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  run("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "825", "-subj", "/CN=localhost",
    "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1",
    "-keyout", keyFile, "-out", certFile,
  ])
  return "openssl"
}

/** Whether `cert` is still valid a day after `now`. */
const fresh = (cert: Buffer, now: Date) => new X509Certificate(cert).validToDate.getTime() > now.getTime() + 86_400_000

/**
 * The dev certificate: the files `DEV_HTTPS_CERT` and `DEV_HTTPS_KEY` name when both are set, else `cert.pem` and
 * `key.pem` in `directory`, made (`makeCertificate`) when they are missing or expire within a day.
 */
export const certificate = (
  directory: string,
  options: { readonly env?: NodeJS.ProcessEnv; readonly now?: Date; readonly run?: Run } = {},
): Certificate => {
  const env = options.env ?? process.env
  if (env.DEV_HTTPS_CERT && env.DEV_HTTPS_KEY) {
    return { cert: readFileSync(env.DEV_HTTPS_CERT), key: readFileSync(env.DEV_HTTPS_KEY) }
  }
  const certFile = join(directory, "cert.pem")
  const keyFile = join(directory, "key.pem")
  if (!existsSync(certFile) || !existsSync(keyFile) || !fresh(readFileSync(certFile), options.now ?? new Date())) {
    mkdirSync(directory, { recursive: true })
    makeCertificate(certFile, keyFile, options.run)
  }
  return { cert: readFileSync(certFile), key: readFileSync(keyFile) }
}

/** Hop-by-hop headers, which belong to one connection and never go on, and HTTP/2 forbids. */
const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-connection", "transfer-encoding", "upgrade", "te", "http2-settings"])

/**
 * The headers a request goes on with: the browser's, without HTTP/2's pseudo-headers and the hop-by-hop ones
 * (kept for a WebSocket's handshake, which needs `Connection` and `Upgrade`), with the Host it asked for (HTTP/2's
 * `:authority`) and the `x-forwarded-proto` and `x-forwarded-host` that make it the Workers' `request.url`.
 */
export const upstreamHeaders = (headers: http.IncomingHttpHeaders, upgrade = false): http.OutgoingHttpHeaders => {
  const out: http.OutgoingHttpHeaders = {}
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || name.startsWith(":") || name === "host" || (!upgrade && HOP_BY_HOP.has(name))) continue
    out[name] = value
  }
  const authority = (headers[":authority"] as string | undefined) ?? headers.host
  if (authority !== undefined) {
    out.host = authority
    out["x-forwarded-host"] = authority
  }
  out["x-forwarded-proto"] = "https"
  return out
}

/** The headers a response goes back with: the dev server's, without the hop-by-hop ones. */
export const downstreamHeaders = (headers: http.IncomingHttpHeaders): http.OutgoingHttpHeaders =>
  Object.fromEntries(Object.entries(headers).filter(([name, value]) => value !== undefined && !HOP_BY_HOP.has(name)))

/** The front: where it serves, and how to stop it. */
export interface Front {
  readonly url: URL
  /** Stops listening and drops every connection, long polls and WebSockets included. */
  readonly close: () => Promise<void>
}

export interface ServeOptions {
  /** The port to serve on, on every host in `hosts`; 0 picks a free one. */
  readonly port: number
  /** The dev server, which speaks plain HTTP/1.1. */
  readonly upstream: URL
  readonly certificate: Certificate
  /** The addresses to listen on; an address this machine lacks, such as `::1` without IPv6, is skipped. */
  readonly hosts?: ReadonlyArray<string>
  /**
   * The most connections to the dev server at once for requests other than Electric's long polls (default 64). A
   * browser sends a page's thousands of module requests at once over HTTP/2; unbounded, they arrive as a burst of
   * connections larger than the dev server's accept queue, and those it can't accept in time fail (`ETIMEDOUT`).
   * Long polls aren't bounded: each waits up to 20 s for a change, so a bound would queue them as HTTP/1.1 did.
   */
  readonly maxConnections?: number
  /** Told each request the dev server never answered, which the browser gets as a 502: its method, path and error. */
  readonly onUnanswered?: (unanswered: { readonly method: string; readonly path: string; readonly code: string }) => void
  /**
   * Answers a request at the front instead of the dev server when it returns true, as e2e/builds.ts serves an older
   * build's files on the same origin as the dev server's API. Unset, every request goes on.
   */
  readonly answer?: (request: http2.Http2ServerRequest, response: http2.Http2ServerResponse) => boolean
}

/** Serves `upstream` over HTTPS: HTTP/2 to browsers that speak it, HTTP/1.1 to the rest and to WebSockets. */
export const serve = async (options: ServeOptions): Promise<Front> => {
  const upstream = { host: options.upstream.hostname.replace(/^\[|\]$/g, ""), port: Number(options.upstream.port) }
  // Connections to the dev server are kept alive and reused: a page load is thousands of module requests, and a new
  // connection for each left as many ports in TIME_WAIT for 30 s, so a test that loads a few pages ran out of ports.
  // Without a `timeout`, Node's agent ignores the server's `Keep-Alive: timeout=5` hint and keeps an idle connection
  // until the server closes it, and a request can take it at that moment and fail. With one, the agent lets an idle
  // connection go a second before the hint says the server will.
  const agent = new http.Agent({ keepAlive: true, timeout: 60_000, maxSockets: options.maxConnections ?? 64 })
  const longPolls = new http.Agent({ keepAlive: true, timeout: 60_000 })
  const sockets = new Set<net.Socket>()

  const forward = (request: http2.Http2ServerRequest, response: http2.Http2ServerResponse) => {
    if (options.answer?.(request, response) === true) return
    const live = new URL(request.url, "https://localhost").searchParams.get("live") === "true"
    const outgoing = http.request({
      ...upstream,
      agent: live ? longPolls : agent,
      method: request.method,
      path: request.url,
      headers: upstreamHeaders(request.headers),
    })
    // The answer ended, or the browser hung up: nothing is left to forward.
    let settled = false
    outgoing.on("response", (answer) => {
      response.writeHead(answer.statusCode as number, downstreamHeaders(answer.headers))
      answer.pipe(response)
      answer.on("end", () => {
        settled = true
      })
      // A body the dev server cut short fails for the browser too (HTTP/2 resets the stream), never left open.
      answer.on("error", (error) => response.destroy(error))
    })
    // Before an answer only: the dev server isn't there, or the browser hung up.
    outgoing.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) return
      const code = String(error.code)
      options.onUnanswered?.({ method: request.method, path: new URL(request.url, "https://localhost").pathname, code })
      response.writeHead(502, { "content-type": "text/plain" })
      response.end(`The dev server didn't answer: ${code}.`)
    })
    // A browser that hung up, such as a closed tab's long poll, ends its request at the dev server too.
    response.on("close", () => {
      if (settled) return
      settled = true
      outgoing.destroy()
    })
    request.pipe(outgoing)
  }

  const tunnel = (request: http.IncomingMessage, socket: Duplex, head: Buffer) => {
    const outgoing = net.connect(upstream)
    const end = () => {
      socket.destroy()
      outgoing.destroy()
    }
    socket.on("error", end).on("close", end)
    outgoing.on("error", end).on("close", end)
    outgoing.once("connect", () => {
      const lines = [`${request.method} ${request.url} HTTP/1.1`]
      for (const [name, value] of Object.entries(upstreamHeaders(request.headers, true))) {
        for (const each of [value].flat()) lines.push(`${name}: ${each}`)
      }
      outgoing.write(`${lines.join("\r\n")}\r\n\r\n`)
      outgoing.write(head)
      socket.pipe(outgoing).pipe(socket)
    })
  }

  const listen = (host: string, port: number) =>
    new Promise<http2.Http2SecureServer | undefined>((resolve, reject) => {
      // Vite's own HTTP/2 server allows as much: a dev page loads hundreds of modules at once.
      const server = http2.createSecureServer({ ...options.certificate, allowHTTP1: true, maxSessionMemory: 1000 })
      server.on("request", forward)
      server.on("upgrade", tunnel)
      server.on("connection", (socket: net.Socket) => {
        sockets.add(socket)
        socket.once("close", () => sockets.delete(socket))
      })
      server.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRNOTAVAIL") resolve(undefined)
        else reject(error)
      })
      server.listen(port, host, () => resolve(server))
    })

  const servers: Array<http2.Http2SecureServer> = []
  const close = async () => {
    for (const socket of sockets) socket.destroy()
    agent.destroy()
    longPolls.destroy()
    await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
  }
  let port = options.port
  try {
    for (const host of options.hosts ?? ["127.0.0.1", "::1"]) {
      const server = await listen(host, port)
      if (server === undefined) continue
      servers.push(server)
      // Every host serves the port the first one got.
      port = (server.address() as net.AddressInfo).port
    }
    if (servers.length === 0) throw new Error("none of its addresses is on this machine")
  } catch (error) {
    await close()
    throw error
  }
  return { url: new URL(`https://localhost:${port}`), close }
}

/** Where a server listens, as a URL's host: an IPv6 address in brackets. */
export const hostOf = (address: net.AddressInfo) =>
  address.family === "IPv6" ? `[${address.address}]:${address.port}` : `${address.address}:${address.port}`

/** `alchemy dev`'s stage, from the environment it gives Vite, if it says. */
const stageOf = (env: NodeJS.ProcessEnv): string | undefined => {
  try {
    const stage: unknown = JSON.parse(env.ALCHEMY_RPC_SERVER_ENVIRONMENT ?? "").stack?.stage
    return typeof stage === "string" ? stage : undefined
  } catch {
    return undefined
  }
}

/**
 * The port to serve on: `DEV_HTTPS_PORT` when set, else 1443 for the default `alchemy dev`, whose stage is
 * `dev_$USER`. Any other stage, such as a second dev server for live tests, must set `DEV_HTTPS_PORT`, and fails
 * without it: on 1443 it would take the dev URL from the default dev server whenever that one restarts.
 */
export const portFor = (env: NodeJS.ProcessEnv): number => {
  if (env.DEV_HTTPS_PORT !== undefined) return Number(env.DEV_HTTPS_PORT)
  const stage = stageOf(env)
  // As alchemy names the default stage: `dev_` and the user, with the characters a stage can't hold as `-`.
  const user = (env.USER ?? env.USERNAME ?? "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "unknown"
  if (stage === undefined || stage === `dev_${user}`) return DEV_HTTPS_PORT
  throw new Error(
    `alchemy dev stage ${stage} isn't the default dev_${user}: set DEV_HTTPS_PORT to a port of its own, not ${DEV_HTTPS_PORT}`,
  )
}

/**
 * The Vite plugin: under the dev server only, once Vite listens, serves it at https://localhost:<port> with the dev
 * certificate in `directory` (`certificate`). `port` defaults to `portFor(env)`, so a dev server on a stage other
 * than the default fails to start until it names its port. A front that can't start, such as on a port another
 * program holds, is a warning: http://localhost:1337 works without it.
 */
export const devHttps = (directory: string, options: { readonly port?: number; readonly env?: NodeJS.ProcessEnv } = {}): Plugin => {
  const env = options.env ?? process.env
  let front: Front | undefined
  return {
    name: "smithers-dev-https",
    apply: "serve",
    configureServer: (server) => {
      const vite = server.httpServer
      // Middleware mode: whoever owns the server owns its protocol.
      if (vite === null) return
      const port = options.port ?? portFor(env)
      vite.once("listening", () => {
        const upstream = new URL(`http://${hostOf(vite.address() as net.AddressInfo)}`)
        Promise.resolve()
          .then(() =>
            serve({
              port,
              upstream,
              certificate: certificate(directory),
              onUnanswered: ({ method, path, code }) =>
                server.config.logger.warn(`HTTPS and HTTP/2: ${method} ${path} got no answer from Vite: ${code}`),
            })
          )
          .then(
            (started) => {
              front = started
              server.config.logger.info(`  ➜  HTTPS and HTTP/2: ${started.url.href}`)
            },
            (error: Error) => server.config.logger.warn(`HTTPS and HTTP/2 didn't start on :${port}: ${error.message}`),
          )
      })
    },
    closeBundle: async () => {
      const closing = front
      front = undefined
      await closing?.close()
    },
  }
}
