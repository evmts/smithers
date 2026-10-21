// A separate process keeps the deliberately poisoned global dispatcher out of
// other tests. Every byte stays on loopback; trust only this ephemeral CA.
import { createSecureServer } from "node:http2"
import { createServer, connect } from "node:net"
import { setDefaultCACertificates } from "node:tls"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Exit, Scope } from "effect"
import { providerFetch } from "../../src/EgressHttpClient.ts"

const directory = mkdtempSync(join(tmpdir(), "provider-fatal-tls-"))
const scope = Effect.runSync(Scope.make())
const sockets = new Set()
let origin, proxy
try {
  execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-days", "1",
    "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
    "-keyout", join(directory, "key"), "-out", join(directory, "cert")], { stdio: "ignore" })
  const cert = readFileSync(join(directory, "cert"))
  setDefaultCACertificates([cert.toString()])
  origin = createSecureServer({ key: readFileSync(join(directory, "key")), cert, allowHTTP1: true })
  origin.on("sessionError", () => {})
  origin.on("stream", stream => {
    stream.on("error", () => {})
    stream.respond({ ":status": 200 }); stream.end("ok")
  })
  origin.on("request", (request, response) => { if (request.httpVersionMajor === 1) response.end("ok") })
  await new Promise(resolve => origin.listen(0, "127.0.0.1", resolve))
  let corrupt = false
  proxy = createServer(client => {
    const upstream = connect(origin.address().port, "127.0.0.1")
    sockets.add(client); sockets.add(upstream)
    client.on("error", () => {}); upstream.on("error", () => {})
    client.on("close", () => { sockets.delete(client); upstream.destroy() })
    upstream.on("close", () => { sockets.delete(upstream); client.destroy() })
    client.pipe(upstream)
    upstream.on("data", bytes => {
      if (corrupt) { corrupt = false; bytes = Buffer.from(bytes); bytes[bytes.length - 1] ^= 1 }
      client.write(bytes)
    })
  })
  await new Promise(resolve => proxy.listen(0, "127.0.0.1", resolve))
  const fetch = process.argv[2] === "native" ? globalThis.fetch : await Effect.runPromise(
    Scope.provide(scope)(providerFetch({ HTTP_PROXY: "", HTTPS_PROXY: "", NO_PROXY: "" }, { connect: { ca: cert } }))
  )
  const codes = []
  for (let i = 0; i < 6; i++) {
    if (i === 1) corrupt = true
    try { codes.push(await (await fetch(`https://127.0.0.1:${proxy.address().port}`, { signal: AbortSignal.timeout(2000) })).text()) }
    catch (error) { codes.push(error.cause?.code ?? error.name) }
  }
  process.stdout.write(JSON.stringify({ undici: process.versions.undici, codes }) + "\n")
} finally {
  await Effect.runPromise(Scope.close(scope, Exit.void))
  for (const socket of sockets) socket.destroy()
  if (proxy) await new Promise(resolve => proxy.close(resolve))
  if (origin) await new Promise(resolve => origin.close(resolve))
  rmSync(directory, { recursive: true, force: true })
}
