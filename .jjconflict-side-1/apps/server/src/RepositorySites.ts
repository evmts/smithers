import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { fetchWithDeadline, readBoundedJson, Transport } from "./Http"

export interface RepositorySite { readonly repository: string; readonly appPrefix: string; readonly version: string }
export interface RepositorySitesShape {
  readonly resolve: (host: string) => Effect.Effect<RepositorySite | undefined>
  readonly content: (host: string, path: string, request: Request) => Effect.Effect<Response>
}
/** Read-only product ports. No manifest, ownership or certificate authority lives at the edge. */
export class RepositorySites extends Context.Service<RepositorySites, RepositorySitesShape>()("smithers-edge/RepositorySites") {}

export const repositorySitesLayer = (origin: string | undefined): Layer.Layer<RepositorySites, never, Transport> =>
  Layer.effect(RepositorySites, Effect.gen(function* () {
    const transport = yield* Transport
    const get = (path: string, headers?: Headers, method = "GET"): Effect.Effect<Response> => origin === undefined
      ? Effect.succeed(new Response(null, { status: 503 }))
      : fetchWithDeadline("repository site", new Request(new URL(path, origin), { headers, method }), undefined, 10_000).pipe(
        Effect.provideService(Transport, transport), Effect.catch(() => Effect.succeed(new Response(null, { status: 503 })))
      )
    return {
      resolve: (host) => Effect.gen(function* () {
        const response = yield* get(`/api/sites/resolve?host=${encodeURIComponent(host)}`)
        if (!response.ok) return undefined
        const value = yield* readBoundedJson(response, 16_384).pipe(Effect.catch(() => Effect.succeed(undefined)))
        if (typeof value !== "object" || value === null) return undefined
        const row = value as Record<string, unknown>
        if (typeof row.repository !== "string" || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(row.repository) ||
          typeof row.appPrefix !== "string" || (row.appPrefix !== "" && (!/^\/[a-zA-Z0-9_/-]+\/$/.test(row.appPrefix) || row.appPrefix.includes("//"))) ||
          typeof row.version !== "string") return undefined
        return { repository: row.repository, appPrefix: row.appPrefix, version: row.version }
      }),
      content: (host, path, request) => {
        const headers = new Headers()
        headers.set("X-Forwarded-Host", host)
        const etag = request.headers.get("if-none-match")
        if (etag !== null) headers.set("if-none-match", etag)
        return get(`/api/sites/content?host=${encodeURIComponent(host)}&path=${encodeURIComponent(path)}`, headers, request.method)
      }
    } satisfies RepositorySitesShape
  }))
