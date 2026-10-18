import { configureApplicationFetch } from "../src/mainview/runtime/ApplicationTransport"
import { configureLiveSocket } from "../src/mainview/runtime/LiveChannel"

/** Sentinel checked by the production bundle exclusion gate. */
export const SPEC_SENTINEL = "SMITHERS_SPEC_TRANSPORT_ONLY_4267"
export const spec = {
  sentinel: SPEC_SENTINEL,
  requests: [] as string[],
  failures: [] as string[],
  violations: [] as string[],
  sockets: [] as string[]
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
    queueMicrotask(() => { this.readyState = 1; this.onopen?.() })
  }
  send(_data: string | Uint8Array) {}
  close() { this.readyState = 3 }
}
configureApplicationFetch(fixtureFetch)
configureLiveSocket(() => new FixtureSocket())
globalThis.fetch = Object.assign(fixtureFetch, { preconnect: assetFetch.preconnect })
globalThis.WebSocket = FixtureSocket as unknown as typeof WebSocket
