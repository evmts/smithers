import { defaultWorld } from "./worlds/default"
import { readRoutes } from "./routes/reads"
import type { FixtureExchange } from "./route"
import { matchRoute } from "./route"
import { RepositoryReadErrorSchema } from "@smthrs/rpc/RepositoryRead"
import { configureApplicationFetch } from "../src/mainview/runtime/ApplicationTransport"
import { configureLiveSocket } from "../src/mainview/runtime/LiveChannel"

/** Sentinel checked by the production bundle exclusion gate. */
export const SPEC_SENTINEL = "SMITHERS_SPEC_TRANSPORT_ONLY_4267"
export const spec = {
  sentinel: SPEC_SENTINEL,
  requests: [] as string[],
  exchanges: [] as FixtureExchange[],
  failures: [] as string[],
  violations: [] as string[],
  sockets: [] as string[],
  world: defaultWorld(new URLSearchParams(location.search), location.origin),
  assertClean() {
    if (this.failures.length || this.violations.length) throw new Error([...this.failures, ...this.violations].join("\n"))
  }
}
declare global { interface Window { __spec: typeof spec } }
window.__spec = spec
document.addEventListener("securitypolicyviolation", event => spec.violations.push(event.blockedURI))

const fail = (method: string, path: string): Response => {
  const message = `Fixture failure: ${method} ${path}`
  spec.failures.push(message)
  const show = () => {
    let output = document.getElementById("spec-fixture-failure")
    if (!output) {
      output = document.createElement("pre")
      output.id = "spec-fixture-failure"
      output.setAttribute("role", "alert")
      document.body.append(output)
    }
    output.textContent = spec.failures.join("\n")
  }
  if (document.body) show()
  else document.addEventListener("DOMContentLoaded", show, { once: true })
  return Response.json({ error: { code: "fixture_missing", message } }, { status: 599 })
}
const assetFetch = globalThis.fetch.bind(globalThis)
const fixtureFetch: import("@smthrs/rpc/NativeAgent").FetchLike = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href)
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase()
  spec.requests.push(`${method} ${url.pathname}`)
  if (url.origin === location.origin && !url.pathname.startsWith("/api/") && url.pathname !== "/live") {
    if (method === "GET" && (url.pathname.startsWith("/assets/") || url.pathname === "/favicon.svg")) return assetFetch(input, init)
  }
  if (url.origin === location.origin) {
    for (const route of readRoutes) {
      if (route.method !== method) continue
      const params = matchRoute(route.path, url.pathname)
      if (params === undefined) continue
      if (spec.world.variants.net === "slow" && !route.control) await new Promise(resolve => setTimeout(resolve, 750))
      if (spec.world.variants.net === "error" && !route.control) {
        const body = RepositoryReadErrorSchema.parse({ message: `Fixture read failed: ${method} ${url.pathname}` })
        spec.exchanges.push({ method, url: url.href, status: 503, body })
        return Response.json(body, { status: 503 })
      }
      let exchange: { method: string; url: string; status: number; body: unknown } | undefined
      try {
        const response = route.handle({ url, params }, spec.world)
        exchange = { method, url: url.href, status: response.status ?? 200, body: response.body }
        spec.exchanges.push(exchange)
        const body = route.schema.parse(response.body)
        if (route.transition) spec.world = route.transition({ url, params }, spec.world)
        return Response.json(body, { status: response.status ?? 200 })
      } catch {
        if (exchange) exchange.status = 599
        return fail(method, url.pathname)
      }
    }
  }
  return fail(method, url.origin === location.origin ? url.pathname : url.href)
}
class FixtureSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  readyState = 0
  binaryType = "arraybuffer"
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  constructor(url: string | URL = "/api/live") {
    super()
    spec.sockets.push(String(url))
    const target = new URL(url, location.href)
    const origin = target.origin.replace(/^ws/, "http")
    if (origin !== location.origin || target.pathname !== "/api/live") { fail("WS", target.pathname); this.readyState = 3; return }
    queueMicrotask(() => { this.readyState = 1; this.onopen?.() })
  }
  send(data: string | Uint8Array) {
    if (typeof data !== "string") return
    const frame = JSON.parse(data) as { t: string; id: number }
    if (frame.t === "sub") queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ t: "err", id: frame.id, code: "unsupported" }) }))
  }
  close() { this.readyState = 3 }
}
configureApplicationFetch(fixtureFetch)
configureLiveSocket(() => new FixtureSocket())
globalThis.fetch = Object.assign(fixtureFetch, { preconnect: assetFetch.preconnect })
globalThis.WebSocket = FixtureSocket as unknown as typeof WebSocket
