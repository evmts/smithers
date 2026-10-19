// Test-only observation: never stores paths, headers, bodies, or credentials.
import { appendFileSync } from "node:fs"
import { syncBuiltinESMExports } from "node:module"
import http from "node:http"
import https from "node:https"
import net from "node:net"
import tls from "node:tls"
import childProcess from "node:child_process"
import { fileURLToPath } from "node:url"

const file = process.env.SMITHERS_EGRESS_RECORDS
const preload = fileURLToPath(import.meta.url)
const observe = (api, host, port) => {
  host = String(host ?? "localhost").toLowerCase().replace(/^\[|\]$/g, "")
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host) || /^::ffff:127\./.test(host)) return
  appendFileSync(file, JSON.stringify({ api, host, port: String(port ?? "") }) + "\n")
}
const url = (api, value) => {
  const parsed = new URL(typeof value === "string" || value instanceof URL ? value : value.url)
  observe(api, parsed.hostname, parsed.port || (parsed.protocol === "https:" || parsed.protocol === "wss:" ? 443 : 80))
}
const wrap = (object, key, before) => {
  const original = object[key]
  object[key] = function (...args) { before(args); return Reflect.apply(original, this, args) }
}
const socket = (api, args) => {
  // Node's internal normalized connect arguments may arrive as an array.
  if (Array.isArray(args[0])) return socket(api, args[0])
  const first = args[0]
  if (typeof first === "object" && first !== null) {
    if (!first.path && !first.unix) observe(api, first.hostname ?? first.host, first.port)
  } else if (typeof first === "number" || /^\d+$/.test(first)) {
    observe(api, typeof args[1] === "string" ? args[1] : "localhost", first)
  } // Other strings are Unix socket paths.
}
wrap(globalThis, "fetch", args => url("fetch", args[0]))
for (const [module, name, port] of [[http, "http", 80], [https, "https", 443]]) {
  for (const method of ["request", "get"]) wrap(module, method, args => {
    const first = args[0]
    if (typeof first === "string" || first instanceof URL) {
      const parsed = new URL(first)
      const options = typeof args[1] === "object" ? args[1] : {}
      observe(`${name}.${method}`, options.hostname ?? options.host ?? parsed.hostname, options.port ?? (parsed.port || port))
    } else if (!first?.socketPath) observe(`${name}.${method}`, first?.hostname ?? first?.host, first?.port ?? port)
  })
}
for (const method of ["connect", "createConnection"]) wrap(net, method, args => socket(`net.${method}`, args))
wrap(net.Socket.prototype, "connect", args => socket("net.Socket.connect", args))
wrap(tls, "connect", args => socket("tls.connect", args))
if (globalThis.Bun) wrap(Bun, "connect", args => socket("Bun.connect", args))
if (globalThis.WebSocket) {
  const Original = globalThis.WebSocket
  globalThis.WebSocket = new Proxy(Original, { construct(target, args, newTarget) {
    url("WebSocket", args[0])
    return Reflect.construct(target, args, newTarget)
  } })
}
// NODE_OPTIONS is inherited by Node descendants. Inject Bun's preload even
// when the CLI starts a Bun executor rather than the journey launching it.
for (const method of ["spawn", "spawnSync", "execFile", "execFileSync"]) wrap(childProcess, method, args => {
  if (/(^|\/)bun$/.test(String(args[0])) && Array.isArray(args[1])) args[1] = ["--preload", preload, ...args[1]]
})
syncBuiltinESMExports()
