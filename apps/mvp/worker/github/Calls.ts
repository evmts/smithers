import { Core, GitHub } from "@smthrs/integrations"
import { Effect, Redacted } from "effect"
import type { HttpClient } from "effect/http"

// How the GitHub flows call GitHub (docs/features/issues.md#calls): one `@smthrs/integrations` client per token, and one
// reading of what a failed call means. The client makes one request per call; the flow engine's retry policy around
// each step is the only retry.

/**
 * What a failed GitHub call means to a step:
 * - `retry`: nothing was done, or a read failed; the step's retry policy tries again, after `retryAfterMillis`;
 * - `unknown`: a write's answer was lost, so GitHub may have applied it; the next attempt looks for its marker first;
 * - `refused`: GitHub answered no, with `status` (401, 403, 404, 410, 422 ...); trying again changes nothing.
 */
export type Classified =
  | { readonly kind: "retry"; readonly retryAfterMillis?: number }
  | { readonly kind: "unknown" }
  | { readonly kind: "refused"; readonly status: number }

const numberOf = (value: unknown): number | undefined => (typeof value === "number" ? value : undefined)

/** Reads a failure from `@smthrs/integrations`: its classification and status, never its message. */
export const classify = (error: unknown): Classified => {
  if (!Core.IntegrationError.isIntegrationError(error)) return { kind: "retry" }
  const details: Readonly<Record<string, unknown>> = { ...error.details }
  if (details["outcomeUnknown"] === true) return { kind: "unknown" }
  if (details["retryable"] === true || details["rateLimited"] === true) {
    const retryAt = typeof details["retryAt"] === "string" ? Date.parse(details["retryAt"]) - Date.now() : undefined
    const wait = numberOf(details["retryAfterMillis"]) ?? (retryAt !== undefined && retryAt > 0 ? retryAt : undefined)
    return wait === undefined ? { kind: "retry" } : { kind: "retry", retryAfterMillis: wait }
  }
  const status = numberOf(details["status"])
  return status === undefined ? { kind: "retry" } : { kind: "refused", status }
}

/** GitHub's status for a failed call, when it answered one: for log lines. */
export const statusOf = (error: unknown): number | undefined =>
  Core.IntegrationError.isIntegrationError(error) ? numberOf(error.details?.["status"]) : undefined

/**
 * Runs `effect` with a GitHub client for `token` on `apiBaseUrl`, over the `HttpClient` in context. The client never
 * reads the ambient environment, so no other token decides who calls.
 */
export const withToken = (token: Redacted.Redacted<string>, apiBaseUrl: string) =>
<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<
  A,
  E,
  Exclude<R, GitHub.GitHubClient.GitHubClient> | HttpClient.HttpClient
> =>
  Effect.flatMap(
    // A malformed base URL is a deployment's defect, caught when the deployment starts (`Config.ts`).
    Effect.orDie(GitHub.GitHubClient.make({ token: Redacted.value(token), apiBaseUrl }, {})),
    (client) => Effect.provideService(effect, GitHub.GitHubClient.GitHubClient, client),
  )
