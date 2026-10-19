import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { runRequest } from "./Boundary"
import { DEFAULT_UPSTREAM_TIMEOUT_MS, discardBody, fetchWithDeadline, GIT_UPSTREAM_TIMEOUT_MS, TransportLive, transportFrom } from "./Http"
import type { Transport, TransportShape } from "./Http"
import { catalogDocumentPath, DEFAULT_APP_DOCUMENT_PATH, isFramePath, isRepositoryPath, repositoryRedirectPath, repositorySubjectRoot } from "./appDocument"
import { withIsolationHeaders } from "./Responses"

// Storage identities survive the authority change. These classes have no product
// handlers, alarm work, or deletion path. The state is retained unmigrated (cutover/activation.json).
export { AccountModelVault, ClientErrorLog, GatewaySessionRegistry, RecommendLog, TurnCancelRegistry, TurnRateLimiter } from "./retainedDurableObjects"

export interface EdgeEnv {
  readonly SMITHERS_BACKEND_ORIGIN?: string
  readonly ASSETS: { readonly fetch: (request: Request) => Promise<Response> }
}

class EdgeAssets extends Context.Service<EdgeAssets, TransportShape>()("smithers-edge/Assets") {}

/** The site assets binding as the edge's asset transport. */
export const edgeAssets = (assets: EdgeEnv["ASSETS"]): Layer.Layer<EdgeAssets> =>
  Layer.succeed(EdgeAssets, transportFrom(input => assets.fetch(input instanceof Request ? input : new Request(input))))

/*
 * Git's smart HTTP, which the backend serves at the root rather than under
 * /api (`git clone https://smithers.sh/<owner>/<repo>.git`, #4299): discovery
 * and the two pack exchanges, nothing else. Owner and repository use the
 * backend's own name rule (packages/backend/internal/services/repo.go), and the
 * backend answers only the `.git` spelling, so a `.git`-less form, a third
 * segment, another ending or another method stays the site's.
 */
const GIT_TRANSPORT = /^\/[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*\.git\/(info\/refs|git-upload-pack|git-receive-pack)$/

const isGitTransport = (method: string, url: URL): boolean => {
  const ending = GIT_TRANSPORT.exec(url.pathname)?.[1]
  if (ending === "info/refs") {
    const service = url.searchParams.get("service")
    return method === "GET" && (service === "git-upload-pack" || service === "git-receive-pack")
  }
  return ending !== undefined && method === "POST"
}

const refusal = (status: number, code: string): Response => Response.json({ status: "error", code }, { status })

/** A deployment origin, never a caller-selected proxy destination. */
const backendOrigin = (raw: string | undefined, incoming: URL): string | undefined => {
  if (!raw?.trim()) return undefined
  try {
    const target = new URL(raw)
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)
    if ((target.protocol !== "https:" && !(local && target.protocol === "http:")) || target.username || target.password ||
      target.pathname !== "/" || target.search || target.hash || target.origin === incoming.origin) return undefined
    return target.origin
  } catch { return undefined }
}

const proxy = (request: Request, url: URL, origin: string, route: "api" | "git"): Effect.Effect<Response, never, Transport> => {
  const upstream = new URL(origin)
  // Assign fields rather than resolve an arbitrary path: // cannot change host.
  upstream.pathname = url.pathname
  upstream.search = url.search
  const headers = new Headers(request.headers)
  for (const name of [...headers.keys()]) {
    if (name.startsWith("x-user-") || name.startsWith("x-smithers-user-") || name.startsWith("x-forwarded-") ||
      ["host", "forwarded", "x-real-ip", "x-smithers-service-token", "x-smithers-token-id"].includes(name)) headers.delete(name)
  }
  // Git authenticates with Basic auth or a token alone; the backend reads no
  // session on these routes, and a browser's cookie has no business there.
  if (route === "git") headers.delete("cookie")
  headers.set("x-forwarded-host", url.host)
  headers.set("x-forwarded-proto", url.protocol.slice(0, -1))
  const clientIP = request.headers.get("cf-connecting-ip")
  if (clientIP && /^[a-fA-F0-9:.]+$/.test(clientIP)) headers.set("x-forwarded-for", clientIP)
  const forwarded = new Request(upstream, request)
  // The shared host owns authentication, CSRF, capabilities and errors. Do not
  // mint a bearer, interpret a body, follow OAuth redirects, or rebuild a 101.
  return fetchWithDeadline("shared backend", forwarded, { headers }, route === "git" ? GIT_UPSTREAM_TIMEOUT_MS : DEFAULT_UPSTREAM_TIMEOUT_MS).pipe(
    Effect.catch(failure => Effect.succeed(refusal(failure._tag === "UpstreamTimeout" ? 504 : 502,
      failure._tag === "UpstreamTimeout" ? "upstream_timeout" : "upstream_unreachable")))
  )
}

const asset = (request: Request): Effect.Effect<Response, never, EdgeAssets> =>
  EdgeAssets.use(assets => assets.fetch("assets", request)).pipe(Effect.catch(() => Effect.succeed(refusal(502, "assets_unreachable"))))

const documentHeaders = (url: URL, response: Response): Response => {
  if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) return response
  const headers = new Headers(response.headers)
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
  headers.set("X-Content-Type-Options", "nosniff")
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  if (url.hostname === "canary.smithers.sh") headers.set("X-Robots-Tag", "noindex")
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export const handleEdgeRequest = (request: Request, configuredOrigin: string | undefined): Effect.Effect<Response, never, Transport | EdgeAssets> =>
  Effect.gen(function* () {
    const url = new URL(request.url)
    const visitor = yield* Effect.try(() => JSON.parse(request.headers.get("cf-visitor") ?? "null") as unknown).pipe(Effect.catch(() => Effect.succeed(undefined)))
    if ((typeof visitor === "object" && visitor !== null && "scheme" in visitor && visitor.scheme === "http") || url.hostname === "www.smithers.sh") {
      url.protocol = "https:"
      if (url.hostname === "www.smithers.sh") url.hostname = "smithers.sh"
      return Response.redirect(url.toString(), 301)
    }
    const route = url.pathname === "/api" || url.pathname.startsWith("/api/") ? "api"
      : isGitTransport(request.method, url) ? "git" : undefined
    if (route !== undefined) {
      const origin = backendOrigin(configuredOrigin, url)
      return origin === undefined ? refusal(503, "backend_not_configured") : yield* proxy(request, url, origin, route)
    }
    /*
     * A GitHub-shaped subject below a repository root is that repository's
     * page: the same prerendered document, reached by the path the reader
     * followed. EVERY repository root the build prerenders is routed this way,
     * including the curated coming-soon ones: a catalog row is not an
     * admission fence, and a maintainer whose GitHub App installation has just
     * landed must reach the app's own import path rather than a compiled
     * marketing page (mvp.md M-46). What the repository actually is — bound,
     * readable, importable, installed — stays the backend's and the app's
     * answer, which is reached only by serving the app.
     */
    const redirect = repositoryRedirectPath(url.pathname)
    if (redirect !== undefined) {
      url.pathname = redirect
      return Response.redirect(url.toString(), 301)
    }
    const subjectRoot = repositorySubjectRoot(url.pathname)
    const catalog = catalogDocumentPath(subjectRoot ?? url.pathname)
    if (catalog !== undefined) {
      /*
       * GitHub's OWNER and REPOSITORY names are case-insensitive, and the
       * canonical page is the lowercase one. Nothing below them is: a ref and
       * a file path are both case-sensitive, so only the repository root is
       * normalized and the subject the reader asked for is kept byte for
       * byte. Lower-casing the whole path answered
       * `/owner/repo/blob/main/README.md` with a redirect to `readme.md`,
       * which is a different file on every case-sensitive checkout.
       */
      const normalized = subjectRoot ?? url.pathname
      if (normalized !== normalized.toLowerCase()) {
        url.pathname = subjectRoot === undefined
          ? catalog
          : `${subjectRoot.toLowerCase()}${url.pathname.slice(subjectRoot.length)}`
        return Response.redirect(url.toString(), 301)
      }
      return documentHeaders(url, withIsolationHeaders(yield* asset(new Request(new URL(catalog, url), request))))
    }
    if (isFramePath(url.pathname)) {
      return documentHeaders(url, withIsolationHeaders(yield* asset(new Request(new URL(DEFAULT_APP_DOCUMENT_PATH, url), request))))
    }
    const icon = url.pathname === "/favicon.ico" ? "/favicon.png" : url.pathname === "/apple-touch-icon.png" ? "/icon.png" : undefined
    if (icon !== undefined) return yield* asset(new Request(new URL(icon, url), request))
    const response = yield* asset(request)
    if (response.status === 404 && (isRepositoryPath(url.pathname) || subjectRoot !== undefined) &&
      (request.method === "GET" || request.method === "HEAD")) {
      yield* discardBody(response)
      return documentHeaders(url, withIsolationHeaders(yield* asset(new Request(new URL(DEFAULT_APP_DOCUMENT_PATH, url), request))))
    }
    return documentHeaders(url, response)
  })

export default {
  fetch: (request: Request, env: EdgeEnv): Promise<Response> => runRequest(
    handleEdgeRequest(request, env.SMITHERS_BACKEND_ORIGIN).pipe(Effect.provide(Layer.mergeAll(TransportLive, edgeAssets(env.ASSETS)))),
    request.signal
  )
}
