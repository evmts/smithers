import { execFileSync } from "node:child_process"
import { createPrivateKey, X509Certificate } from "node:crypto"
import { once } from "node:events"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import * as http from "node:http"
import * as http2 from "node:http2"
import * as https from "node:https"
import * as net from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as tls from "node:tls"
import { createServer, type Logger } from "vite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  type Certificate,
  certificate,
  DEV_HTTPS_PORT,
  DEV_URL,
  devHttps,
  downstreamHeaders,
  hostOf,
  makeCertificate,
  portFor,
  type Run,
  runProgram,
  serve,
  upstreamHeaders,
} from "./https.ts"

const missing = (file: string) => Object.assign(new Error(`spawnSync ${file} ENOENT`), { code: "ENOENT" })

/** This machine without mkcert: openssl makes the certificate. */
const opensslOnly: Run = (file, args) => {
  if (file === "mkcert") throw missing(file)
  execFileSync(file, args, { stdio: "ignore" })
}

const scratch = mkdtempSync(join(tmpdir(), "dev-https-"))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))
let made = 0
const directory = () => join(scratch, `certificate-${made++}`)

let cert: Certificate
beforeAll(async () => {
  cert = await certificate(directory(), { run: opensslOnly })
})

describe("makeCertificate", () => {
  it("uses mkcert when it is installed, for the loopback names", async () => {
    const calls: Array<[string, ReadonlyArray<string>]> = []
    expect(await makeCertificate("c.pem", "k.pem", (file, args) => void calls.push([file, args]))).toBe("mkcert")
    expect(calls).toEqual([["mkcert", ["-cert-file", "c.pem", "-key-file", "k.pem", "localhost", "127.0.0.1", "::1"]]])
  })

  it("falls back to a self-signed openssl certificate for localhost, 127.0.0.1 and ::1", async () => {
    const dir = directory()
    mkdirSync(dir)
    const files = { cert: join(dir, "localhost.pem"), key: join(dir, "localhost-key.pem") }
    expect(await makeCertificate(files.cert, files.key, opensslOnly)).toBe("openssl")
    const made = new X509Certificate(readFileSync(files.cert))
    expect(made.subjectAltName).toBe("DNS:localhost, IP Address:127.0.0.1, IP Address:0:0:0:0:0:0:0:1")
    expect(made.checkPrivateKey(createPrivateKey(readFileSync(files.key)))).toBe(true)
  })

  it("fails as mkcert failed when mkcert is there but can't make one", async () => {
    const failed = new Error("mkcert exited 1")
    await expect(makeCertificate("c.pem", "k.pem", async () => {
      throw failed
    })).rejects.toThrow(failed)
  })
})


describe("startup regressions", () => {
  it("keeps the event loop responsive while a certificate program runs", async () => {
    let answered = false
    const responder = http.createServer((_request, response) => {
      answered = true
      response.end()
    })
    responder.listen(0, "127.0.0.1")
    await once(responder, "listening")
    const { port } = responder.address() as net.AddressInfo
    try {
      await runProgram(process.execPath, ["-e", `require("node:http").get("http://127.0.0.1:${port}", (response) => response.resume())`])
      expect(answered).toBe(true)
    } finally {
      await new Promise<void>((resolve) => responder.close(() => resolve()))
    }
  })

  it("waits for pending HTTPS startup when closed", async () => {
    const certificates = directory()
    await certificate(certificates, { run: opensslOnly, env: {} })
    const plugin = devHttps(certificates, { port: 0 })
    let closing: Promise<void> | undefined
    const server = await createServer({
      configFile: false,
      root: scratch,
      logLevel: "silent",
      plugins: [plugin, { name: "close-during-startup", configureServer: (vite) => {
        vite.httpServer!.once("listening", () => {
          closing = (plugin.closeBundle as () => Promise<void>)()
        })
      } }],
      server: { host: "127.0.0.1", port: 0, ws: false, watch: null },
    })
    try {
      await server.listen()
      await closing
      // Wait for closed handles to leave Node's resource list; only Vite may remain.
      await expect.poll(() => process.getActiveResourcesInfo().filter((name) => name === "TCPServerWrap").length).toBe(1)
    } finally {
      await server.close()
      await (plugin.closeBundle as () => Promise<void>)()
    }
  })
})

describe("runProgram", () => {
  it("runs a program to its end, and fails on a missing one with ENOENT, which makeCertificate falls back on", async () => {
    const file = join(scratch, "ran")
    await runProgram("touch", [file])
    expect(readFileSync(file, "utf8")).toBe("")
    await expect(runProgram("smithers-no-such-program", [])).rejects.toThrow(expect.objectContaining({ code: "ENOENT" }))
    await expect(runProgram("false", [])).rejects.toThrow(expect.objectContaining({ code: 1 }))
  })
})

describe("certificate", () => {
  it("makes one into the directory the first time, then reads it back without making another", async () => {
    const dir = directory()
    const runs: Array<string> = []
    const run: Run = (file, args) => {
      runs.push(file)
      opensslOnly(file, args)
    }
    const first = await certificate(dir, { env: {}, run })
    expect(runs).toEqual(["mkcert", "openssl"])
    expect(first.cert.equals(readFileSync(join(dir, "cert.pem")))).toBe(true)
    expect(first.key.equals(readFileSync(join(dir, "key.pem")))).toBe(true)
    const again = await certificate(dir, { env: {}, run })
    expect(runs).toHaveLength(2)
    expect(again.cert.equals(first.cert)).toBe(true)
  })

  it("makes a new one when the one there expires within a day", async () => {
    const dir = directory()
    const first = await certificate(dir, { env: {}, run: opensslOnly })
    const expires = new X509Certificate(first.cert).validToDate
    const kept = await certificate(dir, { env: {}, now: new Date(expires.getTime() - 2 * 86_400_000), run: opensslOnly })
    expect(kept.cert.equals(first.cert)).toBe(true)
    const renewed = await certificate(dir, { env: {}, now: new Date(expires.getTime() - 3_600_000), run: opensslOnly })
    expect(renewed.cert.equals(first.cert)).toBe(false)
  })

  it("makes one when only the certificate or only the key is there", async () => {
    const dir = directory()
    await certificate(dir, { env: {}, run: opensslOnly })
    rmSync(join(dir, "key.pem"))
    const runs: Array<string> = []
    await certificate(dir, { env: {}, run: (file, args) => (runs.push(file), opensslOnly(file, args)) })
    expect(runs).toEqual(["mkcert", "openssl"])
  })

  it("reads DEV_HTTPS_CERT and DEV_HTTPS_KEY when both are set, and makes nothing", async () => {
    const certFile = join(scratch, "named-cert.pem")
    const keyFile = join(scratch, "named-key.pem")
    writeFileSync(certFile, cert.cert)
    writeFileSync(keyFile, cert.key)
    const never: Run = () => expect.fail("nothing is made")
    const named = await certificate(join(scratch, "unused"), { env: { DEV_HTTPS_CERT: certFile, DEV_HTTPS_KEY: keyFile }, run: never })
    expect(named.cert.equals(cert.cert)).toBe(true)
    expect(named.key.equals(cert.key)).toBe(true)
  })

  it("ignores DEV_HTTPS_CERT without DEV_HTTPS_KEY", async () => {
    const dir = directory()
    const runs: Array<string> = []
    await certificate(dir, { env: { DEV_HTTPS_CERT: "/nowhere.pem" }, run: (file, args) => (runs.push(file), opensslOnly(file, args)) })
    expect(runs).toEqual(["mkcert", "openssl"])
  })

  it("reads the process's environment and clock by default", async () => {
    const dir = directory()
    const made = await certificate(dir, { env: {}, run: opensslOnly })
    expect((await certificate(dir)).cert.equals(made.cert)).toBe(true)
  })
})

describe("headers", () => {
  it("sends a request on with HTTP/2's authority as its Host, saying it came over HTTPS", () => {
    expect(
      upstreamHeaders({
        ":method": "GET",
        ":path": "/api/shapes/messages?live=true",
        ":scheme": "https",
        ":authority": "localhost:1443",
        cookie: "a=1; b=2",
        "accept-encoding": "gzip",
        te: "trailers",
        absent: undefined,
      }),
    ).toEqual({
      cookie: "a=1; b=2",
      "accept-encoding": "gzip",
      host: "localhost:1443",
      "x-forwarded-host": "localhost:1443",
      "x-forwarded-proto": "https",
    })
  })

  it("keeps HTTP/1.1's Host, and drops its hop-by-hop headers", () => {
    expect(upstreamHeaders({ host: "localhost:1443", connection: "keep-alive", "keep-alive": "timeout=5", accept: "*/*" })).toEqual({
      accept: "*/*",
      host: "localhost:1443",
      "x-forwarded-host": "localhost:1443",
      "x-forwarded-proto": "https",
    })
  })

  it("keeps Connection and Upgrade for a WebSocket's handshake", () => {
    expect(upstreamHeaders({ host: "localhost:1443", connection: "Upgrade", upgrade: "websocket", "sec-websocket-version": "13" }, true)).toEqual({
      connection: "Upgrade",
      upgrade: "websocket",
      "sec-websocket-version": "13",
      host: "localhost:1443",
      "x-forwarded-host": "localhost:1443",
      "x-forwarded-proto": "https",
    })
  })

  it("forwards no Host when the request named none", () => {
    expect(upstreamHeaders({})).toEqual({ "x-forwarded-proto": "https" })
  })

  it("answers without the dev server's hop-by-hop headers, which HTTP/2 forbids", () => {
    expect(
      downstreamHeaders({
        "content-type": "application/json",
        "set-cookie": ["a=1", "b=2"],
        connection: "keep-alive",
        "keep-alive": "timeout=5",
        "transfer-encoding": "chunked",
        absent: undefined,
      }),
    ).toEqual({ "content-type": "application/json", "set-cookie": ["a=1", "b=2"] })
  })
})

describe("hostOf", () => {
  it("brackets an IPv6 address", () => {
    expect(hostOf({ address: "::1", family: "IPv6", port: 5190 })).toBe("[::1]:5190")
    expect(hostOf({ address: "127.0.0.1", family: "IPv4", port: 5190 })).toBe("127.0.0.1:5190")
  })
})

describe("portFor", () => {
  const under = (stage: string) => JSON.stringify({ stack: { stage }, alchemyContext: {} })

  it("serves the default alchemy dev, stage dev_$USER, on 1443", () => {
    expect(portFor({ USER: "williamcory", ALCHEMY_RPC_SERVER_ENVIRONMENT: under("dev_williamcory") })).toBe(1443)
    expect(portFor({ USERNAME: "first.last", ALCHEMY_RPC_SERVER_ENVIRONMENT: under("dev_first-last") })).toBe(1443)
    expect(portFor({ ALCHEMY_RPC_SERVER_ENVIRONMENT: under("dev_unknown") })).toBe(1443)
  })

  it("serves on 1443 outside alchemy dev, or when its environment doesn't say the stage", () => {
    expect(portFor({})).toBe(1443)
    expect(portFor({ ALCHEMY_RPC_SERVER_ENVIRONMENT: "not json" })).toBe(1443)
    expect(portFor({ ALCHEMY_RPC_SERVER_ENVIRONMENT: JSON.stringify({ stack: { stage: 7 } }) })).toBe(1443)
  })

  it("serves on DEV_HTTPS_PORT when it is set, on any stage", () => {
    expect(portFor({ DEV_HTTPS_PORT: "1444", USER: "williamcory", ALCHEMY_RPC_SERVER_ENVIRONMENT: under("live_williamcory") })).toBe(1444)
  })

  it("fails on another stage without DEV_HTTPS_PORT, instead of taking 1443 from the default dev server", () => {
    expect(() => portFor({ USER: "williamcory", ALCHEMY_RPC_SERVER_ENVIRONMENT: under("live_williamcory") })).toThrow(
      "alchemy dev stage live_williamcory isn't the default dev_williamcory: set DEV_HTTPS_PORT to a port of its own, not 1443",
    )
  })
})

describe("the dev URL", () => {
  it("is https://localhost:1443", () => {
    expect(DEV_HTTPS_PORT).toBe(1443)
    expect(DEV_URL).toBe("https://localhost:1443")
  })
})

/** A dev server that records what reaches it and answers as each test tells it. */
const upstreamServer = async () => {
  type Seen = { method?: string; url?: string; headers: http.IncomingHttpHeaders; body: string; closed: Promise<void> }
  const seen: Array<Seen> = []
  const waiting: Array<() => void> = []
  let answer: (request: http.IncomingMessage, response: http.ServerResponse) => void = (_request, response) => response.end("ok")
  const server = http.createServer((request, response) => {
    const chunks: Array<Buffer> = []
    const entry: Seen = { method: request.method, url: request.url, headers: request.headers, body: "", closed: once(response, "close").then(() => undefined) }
    seen.push(entry)
    request.on("data", (chunk: Buffer) => chunks.push(chunk))
    request.on("end", () => {
      entry.body = Buffer.concat(chunks).toString()
      answer(request, response)
    })
    for (const wake of waiting.splice(0)) wake()
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  return {
    server,
    seen,
    url: new URL(`http://${hostOf(server.address() as net.AddressInfo)}`),
    answer: (next: typeof answer) => {
      answer = next
    },
    /** Resolves once `count` requests have reached the dev server. */
    reached: (count: number) =>
      new Promise<void>((resolve) => {
        const check = () => (seen.length >= count ? resolve() : waiting.push(check))
        check()
      }),
  }
}

/** One HTTP/2 request on `session`: its status, headers and body, or the stream's error. */
const request = (session: http2.ClientHttp2Session, headers: http2.OutgoingHttpHeaders, body?: string) =>
  new Promise<{ status: number; headers: http2.IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const stream = session.request(headers)
    let answered: http2.IncomingHttpHeaders = {}
    const chunks: Array<Buffer> = []
    stream.on("response", (received) => {
      answered = received
    })
    stream.on("data", (chunk: Buffer) => chunks.push(chunk))
    stream.on("error", reject)
    // A stream reset before its end failed, whatever arrived before the reset.
    stream.on("close", () =>
      stream.rstCode === http2.constants.NGHTTP2_NO_ERROR
        ? resolve({ status: Number(answered[":status"]), headers: answered, body: Buffer.concat(chunks).toString() })
        : reject(new Error(`reset with code ${stream.rstCode}`)))
    stream.end(body)
  })

describe("serve", () => {
  let dev: Awaited<ReturnType<typeof upstreamServer>>
  let front: Awaited<ReturnType<typeof serve>>
  let session: http2.ClientHttp2Session

  beforeAll(async () => {
    dev = await upstreamServer()
    front = await serve({ port: 0, upstream: dev.url, certificate: cert, hosts: ["127.0.0.1"] })
    session = http2.connect(`https://127.0.0.1:${front.url.port}`, { ca: cert.cert, servername: "localhost" })
  })
  afterAll(async () => {
    session.close()
    await front.close()
    dev.server.close()
  })

  it("answers over HTTP/2 with the dev server's answer, and the Workers see the URL the browser asked for", async () => {
    dev.answer((_request, response) => {
      response.setHeader("set-cookie", ["a=1", "b=2"])
      response.setHeader("content-type", "text/plain")
      response.end("hello")
    })
    const before = dev.seen.length
    const answered = await request(session, { ":path": "/api/auth/session?x=1", ":authority": "localhost:1443", cookie: "s=1" })
    expect(answered).toMatchObject({ status: 200, body: "hello" })
    expect(answered.headers["set-cookie"]).toEqual(["a=1", "b=2"])
    expect(answered.headers.connection).toBeUndefined()
    const reached = dev.seen[before]!
    expect(reached).toMatchObject({ method: "GET", url: "/api/auth/session?x=1" })
    expect(reached.headers).toMatchObject({
      host: "localhost:1443",
      "x-forwarded-host": "localhost:1443",
      "x-forwarded-proto": "https",
      cookie: "s=1",
    })
  })

  it("reuses a connection to the dev server, and lets it go before the dev server closes it as idle", async () => {
    const idle = await upstreamServer()
    // Node's server says `Keep-Alive: timeout=3` and closes an idle connection after 3 s.
    idle.server.keepAliveTimeout = 3_000
    const front = await serve({ port: 0, upstream: idle.url, certificate: cert, hosts: ["127.0.0.1"] })
    const client = http2.connect(`https://127.0.0.1:${front.url.port}`, { ca: cert.cert, servername: "localhost" })
    const connections: Array<net.Socket> = []
    idle.server.on("connection", (socket: net.Socket) => void connections.push(socket))
    // One after another: the second goes on the first's connection, as a page's thousands of module requests do.
    expect((await request(client, { ":path": "/one" })).body).toBe("ok")
    expect((await request(client, { ":path": "/two" })).body).toBe("ok")
    expect(connections).toHaveLength(1)
    // Idle, the front closes it a second before the dev server would, so no request is sent on a closing connection.
    const answered = Date.now()
    await once(connections[0]!, "close")
    expect(Date.now() - answered).toBeLessThan(2_500)
    expect((await request(client, { ":path": "/three" })).body).toBe("ok")
    expect(connections).toHaveLength(2)
    client.close()
    await front.close()
    idle.server.close()
  })

  it("answers at the front a request its `answer` takes, and sends every other on", async () => {
    const answering = await serve({
      port: 0,
      upstream: dev.url,
      certificate: cert,
      hosts: ["127.0.0.1"],
      answer: (incoming, response) => {
        if (incoming.url !== "/front") return false
        response.end("from the front")
        return true
      },
    })
    const client = http2.connect(`https://127.0.0.1:${answering.url.port}`, { ca: cert.cert, servername: "localhost" })
    dev.answer((_request, response) => response.end("from the dev server"))
    const before = dev.seen.length
    expect((await request(client, { ":path": "/front" })).body).toBe("from the front")
    expect(dev.seen.length).toBe(before)
    expect((await request(client, { ":path": "/api/x" })).body).toBe("from the dev server")
    client.close()
    await answering.close()
  })

  it("carries a request's body on", async () => {
    dev.answer((incoming, response) => response.end(`${incoming.method}`))
    const before = dev.seen.length
    const answered = await request(session, { ":method": "POST", ":path": "/api/questions", "content-type": "application/json" }, '{"text":"hi"}')
    expect(answered).toMatchObject({ status: 200, body: "POST" })
    expect(dev.seen[before]!.body).toBe('{"text":"hi"}')
  })

  it("holds more than six long polls at once on one connection, as HTTP/2 in production does", async () => {
    const held: Array<http.ServerResponse> = []
    dev.answer((_request, response) => void held.push(response))
    const before = dev.seen.length
    const polls = Array.from({ length: 12 }, (_, at) => request(session, { ":path": `/api/shapes/s${at}?live=true` }))
    // All twelve are at the dev server at once: none waits for another to come back.
    await dev.reached(before + 12)
    await expect.poll(() => held.length).toBe(12)
    for (const response of held) response.end("[]")
    expect((await Promise.all(polls)).map((poll) => poll.body)).toEqual(Array(12).fill("[]"))
  })

  it("holds at most maxConnections other requests at the dev server at once, and queues the rest", async () => {
    const bounded = await upstreamServer()
    const held: Array<http.ServerResponse> = []
    bounded.answer((_request, response) => void held.push(response))
    const front = await serve({ port: 0, upstream: bounded.url, certificate: cert, hosts: ["127.0.0.1"], maxConnections: 3 })
    const client = http2.connect(`https://127.0.0.1:${front.url.port}`, { ca: cert.cert, servername: "localhost" })
    const modules = Array.from({ length: 5 }, (_, at) => request(client, { ":path": `/src/module-${at}.ts` }))
    await bounded.reached(3)
    // The other two wait at the front for a connection; long polls don't.
    const polls = Array.from({ length: 4 }, (_, at) => request(client, { ":path": `/api/shapes/s${at}?live=true` }))
    await bounded.reached(7)
    expect(bounded.seen.filter((seen) => seen.url!.startsWith("/src/")).length).toBe(3)
    for (const response of held.splice(0)) response.end("done")
    await expect.poll(() => held.length).toBe(2)
    for (const response of held.splice(0)) response.end("done")
    expect((await Promise.all([...modules, ...polls])).map((answer) => answer.body)).toEqual(Array(9).fill("done"))
    client.close()
    await front.close()
    bounded.server.close()
  })

  it("serves HTTP/1.1 to a client that doesn't speak HTTP/2", async () => {
    dev.answer((_request, response) => response.end("one"))
    const answered = await new Promise<{ status?: number; body: string; version: string }>((resolve, reject) => {
      https
        .get({ host: "127.0.0.1", port: front.url.port, path: "/app", ca: cert.cert, servername: "localhost", headers: { host: "localhost:1443" } }, (response) => {
          const chunks: Array<Buffer> = []
          response.on("data", (chunk: Buffer) => chunks.push(chunk))
          response.on("end", () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString(), version: response.httpVersion }))
        })
        .on("error", reject)
    })
    expect(answered).toEqual({ status: 200, body: "one", version: "1.1" })
    expect(dev.seen.at(-1)!.headers).toMatchObject({ host: "localhost:1443", "x-forwarded-proto": "https" })
  })

  it("ends a request at the dev server when the browser hangs up on it, as a closed tab's long poll", async () => {
    dev.answer(() => undefined)
    const before = dev.seen.length
    const stream = session.request({ ":path": "/api/shapes/runs?live=true" })
    stream.end()
    await dev.reached(before + 1)
    stream.close(http2.constants.NGHTTP2_CANCEL)
    await dev.seen[before]!.closed
  })

  it("cuts a body short for the browser when the dev server cut it short", async () => {
    dev.answer((_request, response) => {
      response.writeHead(200, { "content-length": "100" })
      response.write("[{", () => response.socket!.destroy())
    })
    await expect(request(session, { ":path": "/api/shapes/cut" })).rejects.toThrow()
  })

  it("answers 502 when the dev server isn't there, and says which request it never answered", async () => {
    const unanswered: Array<unknown> = []
    const gone = await serve({
      port: 0,
      upstream: new URL("http://127.0.0.1:9"),
      certificate: cert,
      hosts: ["127.0.0.1"],
      onUnanswered: (request) => unanswered.push(request),
    })
    const client = http2.connect(`https://127.0.0.1:${gone.url.port}`, { ca: cert.cert, servername: "localhost" })
    expect(await request(client, { ":path": "/src/boot.ts?t=1" })).toMatchObject({
      status: 502,
      body: "The dev server didn't answer: ECONNREFUSED.",
    })
    expect(unanswered).toEqual([{ method: "GET", path: "/src/boot.ts", code: "ECONNREFUSED" }])
    client.close()
    await gone.close()
  })

  it("answers 502 without telling anyone when nobody asked to be told", async () => {
    const gone = await serve({ port: 0, upstream: new URL("http://127.0.0.1:9"), certificate: cert, hosts: ["127.0.0.1"] })
    const client = http2.connect(`https://127.0.0.1:${gone.url.port}`, { ca: cert.cert, servername: "localhost" })
    expect(await request(client, { ":path": "/app" })).toMatchObject({ status: 502 })
    client.close()
    await gone.close()
  })

  it("pipes a WebSocket's handshake and bytes both ways over HTTP/1.1", async () => {
    const upgraded = new Promise<{ head: string; first: string }>((resolve) => {
      dev.server.once("upgrade", (incoming: http.IncomingMessage, socket: net.Socket, head: Buffer) => {
        const lines = [`${incoming.method} ${incoming.url}`, `host=${incoming.headers.host}`, `proto=${incoming.headers["x-forwarded-proto"]}`]
        socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\nfrom-dev")
        const first = (data: Buffer) => resolve({ head: lines.join(" "), first: data.toString() })
        if (head.length > 0) first(head)
        else socket.once("data", first)
      })
    })
    const socket = tls.connect({ host: "127.0.0.1", port: Number(front.url.port), ca: cert.cert, servername: "localhost", ALPNProtocols: ["http/1.1"] })
    await once(socket, "secureConnect")
    socket.write(
      "GET /api/branches/b/room HTTP/1.1\r\nHost: localhost:1443\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n" +
        "Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\nfrom-browser",
    )
    const received: Array<string> = []
    socket.on("data", (data: Buffer) => received.push(data.toString()))
    expect(await upgraded).toEqual({ head: "GET /api/branches/b/room host=localhost:1443 proto=https", first: "from-browser" })
    await expect.poll(() => received.join("")).toContain("from-dev")
    socket.destroy()
  })

  it("closes a WebSocket whose dev server isn't there", async () => {
    const gone = await serve({ port: 0, upstream: new URL("http://127.0.0.1:9"), certificate: cert, hosts: ["127.0.0.1"] })
    const socket = tls.connect({ host: "127.0.0.1", port: Number(gone.url.port), ca: cert.cert, servername: "localhost", ALPNProtocols: ["http/1.1"] })
    await once(socket, "secureConnect")
    socket.write("GET /socket HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n")
    await once(socket, "close")
    await gone.close()
  })

  it("drops open connections when it closes, long polls included", async () => {
    const closing = await serve({ port: 0, upstream: dev.url, certificate: cert, hosts: ["127.0.0.1"] })
    const client = http2.connect(`https://127.0.0.1:${closing.url.port}`, { ca: cert.cert, servername: "localhost" })
    // The front drops the connection under it: the session may see the reset.
    client.on("error", () => undefined)
    dev.answer(() => undefined)
    const before = dev.seen.length
    const poll = request(client, { ":path": "/api/shapes/messages?live=true" })
    await dev.reached(before + 1)
    await closing.close()
    await expect(poll).rejects.toThrow()
    client.destroy()
    await expect(new Promise((resolve, reject) => net.connect(Number(closing.url.port), "127.0.0.1").on("connect", resolve).on("error", reject))).rejects.toThrow(/ECONNREFUSED/)
  })
})

describe("serve's addresses", () => {
  it("listens on both loopback addresses by default, on the port the first one got", async () => {
    const front = await serve({ port: 0, upstream: new URL("http://127.0.0.1:9"), certificate: cert })
    expect(Number(front.url.port)).toBeGreaterThan(0)
    expect(front.url.hostname).toBe("localhost")
    await front.close()
  })

  it("skips an address this machine doesn't have", async () => {
    const front = await serve({ port: 0, upstream: new URL("http://127.0.0.1:9"), certificate: cert, hosts: ["192.0.2.1", "127.0.0.1"] })
    expect(Number(front.url.port)).toBeGreaterThan(0)
    await front.close()
  })

  it("fails when it has none of its addresses", async () => {
    await expect(serve({ port: 0, upstream: new URL("http://127.0.0.1:9"), certificate: cert, hosts: ["192.0.2.1"] })).rejects.toThrow(
      "none of its addresses is on this machine",
    )
  })

  it("fails on a port another program holds, and lets go of what it took", async () => {
    const holder = net.createServer().listen(0, "127.0.0.1")
    await once(holder, "listening")
    const port = (holder.address() as net.AddressInfo).port
    await expect(serve({ port, upstream: new URL("http://127.0.0.1:9"), certificate: cert, hosts: ["::1", "127.0.0.1"] })).rejects.toThrow(/EADDRINUSE/)
    holder.close()
    await once(holder, "close")
    // The first address it took is free again.
    const again = await serve({ port, upstream: new URL("http://127.0.0.1:9"), certificate: cert, hosts: ["127.0.0.1"] })
    await again.close()
  })
})

describe("devHttps", () => {
  const logger = () => {
    const infos: Array<string> = []
    const warnings: Array<string> = []
    const said: Array<() => void> = []
    const say = (into: Array<string>) => (message: string) => {
      into.push(message)
      for (const wake of said.splice(0)) wake()
    }
    const customLogger: Logger = {
      info: say(infos),
      warn: say(warnings),
      warnOnce: say(warnings),
      error: say(warnings),
      clearScreen: () => undefined,
      hasErrorLogged: () => false,
      hasWarned: false,
    }
    const until = (check: () => boolean) =>
      new Promise<void>((resolve) => {
        const test = () => (check() ? resolve() : said.push(test))
        test()
      })
    return { customLogger, infos, warnings, until }
  }

  const root = () => {
    const dir = mkdtempSync(join(scratch, "root-"))
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>dev</title><p>dev page</p>")
    return dir
  }

  it("serves the dev server over HTTP/2 once it listens, and stops with it", async () => {
    const log = logger()
    const certificates = directory()
    await certificate(certificates, { run: opensslOnly, env: {} })
    const server = await createServer({
      configFile: false,
      root: root(),
      logLevel: "info",
      customLogger: log.customLogger,
      plugins: [devHttps(certificates, { port: 0 })],
      server: { host: "127.0.0.1", port: 0, ws: false, watch: null },
    })
    await server.listen()
    await log.until(() => log.infos.some((line) => line.includes("HTTPS and HTTP/2")))
    const url = new URL(/https:\/\/\S+/.exec(log.infos.find((line) => line.includes("HTTPS and HTTP/2"))!)![0])
    const client = http2.connect(`https://127.0.0.1:${url.port}`, { ca: readFileSync(join(certificates, "cert.pem")), servername: "localhost" })
    const page = await request(client, { ":path": "/", ":authority": `localhost:${url.port}` })
    expect(page.status).toBe(200)
    expect(page.body).toContain("dev page")
    // Vite stops listening: a request it never answers is a 502, and the dev server's log says which.
    server.httpServer!.close()
    expect(await request(client, { ":path": "/src/main.tsx?t=2" })).toMatchObject({ status: 502 })
    expect(log.warnings).toContainEqual("HTTPS and HTTP/2: GET /src/main.tsx got no answer from Vite: ECONNREFUSED")
    client.close()
    await server.close()
    await expect(new Promise((resolve, reject) => net.connect(Number(url.port), "127.0.0.1").on("connect", resolve).on("error", reject))).rejects.toThrow(/ECONNREFUSED/)
  })

  it("warns, and leaves the dev server up, when its port is taken", async () => {
    const holder = net.createServer().listen(0, "127.0.0.1")
    await once(holder, "listening")
    const port = (holder.address() as net.AddressInfo).port
    const log = logger()
    const certificates = directory()
    await certificate(certificates, { run: opensslOnly, env: {} })
    const server = await createServer({
      configFile: false,
      root: root(),
      customLogger: log.customLogger,
      plugins: [devHttps(certificates, { port })],
      server: { host: "127.0.0.1", port: 0, ws: false, watch: null },
    })
    await server.listen()
    const refused = new RegExp(`^HTTPS and HTTP/2 didn't start on :${port}: .*EADDRINUSE`)
    await log.until(() => log.warnings.some((line) => refused.test(line)))
    expect(log.infos.some((line) => line.includes("HTTPS and HTTP/2"))).toBe(false)
    expect((await fetch(`http://${hostOf(server.httpServer!.address() as net.AddressInfo)}/`)).status).toBe(200)
    await server.close()
    holder.close()
  })

  it("leaves a server in middleware mode alone", async () => {
    const server = await createServer({
      configFile: false,
      root: root(),
      logLevel: "silent",
      plugins: [devHttps(directory(), { port: 0 })],
      server: { middlewareMode: true, ws: false, watch: null },
    })
    expect(server.httpServer).toBeNull()
    await server.close()
  })

  it("stops a dev server on another stage from starting until it names its port", async () => {
    const env = { USER: "williamcory", ALCHEMY_RPC_SERVER_ENVIRONMENT: JSON.stringify({ stack: { stage: "live_williamcory" } }) }
    await expect(createServer({
      configFile: false,
      root: root(),
      logLevel: "silent",
      plugins: [devHttps(directory(), { env })],
      server: { host: "127.0.0.1", port: 0, ws: false, watch: null },
    })).rejects.toThrow("set DEV_HTTPS_PORT to a port of its own")
  })

  it("serves only under the dev server, on DEV_HTTPS_PORT or 1443", async () => {
    const plugin = devHttps(directory())
    expect(plugin.apply).toBe("serve")
    // Closing before it served anything closes nothing.
    await (plugin.closeBundle as () => Promise<void>)()
  })
})
