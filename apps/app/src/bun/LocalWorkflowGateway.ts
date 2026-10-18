// L7 spike only. One explicitly bound local project; no provisioning or discovery.
import { json, jsonError, readJson } from "./routes"

export interface LocalWorkflowGateway {
  readonly url: string
  readonly repo: string
  readonly workspaceId: string
  /** Serve's session operator token, kept on this server only. */
  readonly operatorToken?: string
}

const mounts: Readonly<Record<string, string>> = {
  Plan: "/rpc", Run: "/rpc", Cancel: "/rpc", Resume: "/rpc",
  Steer: "/rpc", Signal: "/rpc", List: "/rpc",
  "Projection.Snapshot": "/projections", "Approval.Submit": "/projections",
  "Run.Fork": "/projections", "Run.Verify": "/projections"
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}

export const localGatewayFromEnvironment = (
  env: Readonly<Record<string, string | undefined>>
): LocalWorkflowGateway | undefined => {
  if (env.SMITHERS_LOCAL_GATEWAY_URL === undefined) return undefined
  return {
    url: env.SMITHERS_LOCAL_GATEWAY_URL,
    repo: env.SMITHERS_LOCAL_GATEWAY_REPO ?? "",
    workspaceId: env.SMITHERS_LOCAL_GATEWAY_WORKSPACE_ID ?? "",
    ...(env.SMITHERS_LOCAL_GATEWAY_OPERATOR_TOKEN === undefined ? {} : { operatorToken: env.SMITHERS_LOCAL_GATEWAY_OPERATOR_TOKEN })
  }
}

export const createLocalWorkflowRelay = (
  config: LocalWorkflowGateway,
  timeoutMs: number,
  fetchGateway: (url: URL, init: RequestInit) => Promise<Response> = fetch
) => {
  const base = new URL(config.url)
  if (base.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(base.hostname) ||
    base.username || base.password || base.pathname !== "/" || base.search || base.hash ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.repo) || !config.workspaceId) {
    throw new Error("Local gateway requires a loopback HTTP origin, repository and workspace binding.")
  }
  return async (request: Request): Promise<Response> => {
    if (new URL(request.url).pathname !== "/api/workflow/rpc") {
      return jsonError("not_implemented", "Local workspace provisioning is not configured.")
    }
    if (request.method !== "POST") return jsonError("method_not_allowed", "Use POST.")
    const parsed = await readJson(request, 1024 * 1024)
    if ("error" in parsed) return parsed.error
    const body = record(parsed.body)
    if (body.repo !== config.repo || body.workspaceId !== config.workspaceId) {
      return jsonError("invalid_request", "This request names a different local workspace.")
    }
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
