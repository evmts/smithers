// One explicitly bound local project. Credentials never enter the browser.
import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { json, jsonError, readJson } from "./routes"

export interface LocalWorkflowGateway {
  readonly url: string
  readonly repo: string
  readonly workspaceId: string
  /** Serve's session operator token, kept on this server only. */
  readonly operatorToken: string
  readonly root: string
  readonly gatewayId: string
}

const mounts: Readonly<Record<string, string>> = {
  Plan: "/rpc", Run: "/rpc", Cancel: "/rpc", Resume: "/rpc",
  Steer: "/rpc", Signal: "/rpc", List: "/rpc",
  "Projection.Snapshot": "/projections", "Approval.Submit": "/projections",
  "Run.Fork": "/projections", "Run.Verify": "/projections"
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}

const gatewayOrigin = (url: string): URL => {
  // Check the original authority too: URL normalizes decimal/hex/octal IPv4.
  if (!/^http:\/\/(?:127\.0\.0\.1|\[::1\])(?::[0-9]+)?\/?$/.test(url)) {
    throw new Error("Local gateway requires a loopback literal HTTP origin.")
  }
  return new URL(url)
}

export const connectLocalGateway = async (options: {
  readonly url: string
  readonly tokenFile: string
  readonly root: string
  readonly repo: string
}): Promise<LocalWorkflowGateway> => {
  const base = gatewayOrigin(options.url)
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repo)) throw new Error("Invalid local repository binding.")
  let operatorToken: string
  try {
    operatorToken = (await readFile(options.tokenFile, "utf8")).trim()
    if (!operatorToken || /[\s\x00-\x1f\x7f]/.test(operatorToken)) throw new Error("invalid")
  } catch {
    throw new Error("Cannot read the local gateway token file.")
  }
  const root = resolve(options.root)
  let health: Record<string, unknown>
  try {
    const response = await fetch(new URL("/health", base), { redirect: "error", signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error("unhealthy")
    health = record(await response.json())
  } catch {
    throw new Error("Local gateway is unreachable; start smthrs serve first.")
  }
  const workspaceId = createHash("sha256").update(root).digest("hex").slice(0, 16)
  if (health.workspaceHash !== workspaceId || health.protocolVersion !== "1" || typeof health.gatewayId !== "string" || !health.gatewayId) {
    throw new Error("Local gateway health does not match this workspace or protocol.")
  }
  return { url: base.origin, repo: options.repo, workspaceId, gatewayId: health.gatewayId, root, operatorToken }
}

export const createLocalWorkflowRelay = (
  config: LocalWorkflowGateway,
  timeoutMs: number,
  fetchGateway: (url: URL, init: RequestInit) => Promise<Response> = fetch
) => {
  const base = gatewayOrigin(config.url)
  if (base.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(base.hostname) ||
    base.username || base.password || base.pathname !== "/" || base.search || base.hash ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.repo) || !config.workspaceId) {
    throw new Error("Local gateway requires a loopback HTTP origin, repository and workspace binding.")
  }
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return jsonError("method_not_allowed", "Use POST.")
    const parsed = await readJson(request, 1024 * 1024)
    if ("error" in parsed) return parsed.error
    const body = record(parsed.body)
    const path = new URL(request.url).pathname
    if (body.repo !== config.repo || ((path !== "/api/workflow/provision" || body.workspaceId !== undefined) && body.workspaceId !== config.workspaceId)) {
      return jsonError("invalid_request", "This request names a different local workspace.")
    }
    if (path === "/api/workflow/provision") return json({ status: "ready", workspaceId: config.workspaceId, gatewayId: config.gatewayId })
    if (path !== "/api/workflow/rpc") return jsonError("not_found", "Not available in local mode.")
    const mount = typeof body.procedure === "string" && Object.hasOwn(mounts, body.procedure) ? mounts[body.procedure] : undefined
    if (mount === undefined || !("payload" in body)) return jsonError("invalid_request", "Unsupported local gateway call.")
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)])
    try {
      const upstream = await fetchGateway(new URL(mount, base), {
        method: "POST", redirect: "error", signal,
        headers: {
          "content-type": "application/json",
          ...(config.operatorToken === undefined ? {} : { authorization: `Bearer ${config.operatorToken}` })
        },
        body: JSON.stringify({ _tag: "Request", id: 1, tag: body.procedure, payload: body.payload, headers: [] }) + "\n"
      })
      if (!upstream.ok) {
        await upstream.body?.cancel()
        return json({ status: "error", code: "local_gateway_ingress", message: "The local gateway refused the request.", origin: "local" }, upstream.status)
      }
      // Unary RPC only. Streaming subscriptions need a separate socket adapter.
      const frames: unknown[] = (await upstream.text()).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
      const frame = frames.map(record).find((item) => item._tag === "Exit" && String(item.requestId) === "1")
      const exit = record(frame?.exit)
      if (exit._tag === "Success") return json({ ok: true, payload: exit.value })
      if (exit._tag === "Failure") {
        // Preserve the typed cause; the existing browser seam classifies it.
        return json({ ok: false, error: { message: "The local gateway refused the call.", detail: exit.cause } })
      }
      return jsonError("internal", "The local gateway returned an unreadable RPC result.")
    } catch {
      return json({ status: "error", code: "local_gateway_unreachable", message: "The local gateway did not answer.", origin: "local" }, 502)
    }
  }
}

/** Minimal local inventory: no cloud workspace or person is fabricated. */
export const localGatewayApi = async (config: LocalWorkflowGateway, request: Request): Promise<Response> => {
  const path = new URL(request.url).pathname
  if (request.method === "GET") {
    if (path === "/api/user") return json({ id: 0, username: "local-operator", display_name: "Local operator", is_admin: false })
    if (["/api/user/repos", "/api/user/orgs", "/api/user/workspaces"].includes(path)) return json([])
    if (path === "/api/conversations/main/view-state") return json({})
    const prefix = `/api/repos/${config.repo}`
    if (path === `${prefix}/contents/.smithers/factory.json`) {
      try {
        const content = await readFile(resolve(config.root, ".smithers/factory.json"), "utf8")
        return json({ content, encoding: "utf-8" })
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === "ENOENT"
          ? jsonError("not_found", "No flow catalog in this workspace.")
          : jsonError("internal", "The local flow catalog could not be read.")
      }
    }
    if (path === `${prefix}/home`) return json({ kind: "none" })
  }
  return json({ message: "Not available in local mode." }, 409)
}
