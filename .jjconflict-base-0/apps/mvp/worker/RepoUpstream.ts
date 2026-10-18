import { GitRemote } from "@smthrs/effect-code-storage"
import { GitHub } from "@smthrs/integrations"
import { Clock, Config, Context, Effect, Layer, Option, Redacted, Schema } from "effect"
import type { HttpClient } from "effect/http"
import type { Size } from "./Repos.ts"

// What `repo/Inspect` asks GitHub before a clone (decision 0006 "Capacity and spend"): the repository's HEAD over git's
// smart HTTP, which needs no key and spends no REST quota, and its size from the REST API, the only place GitHub says
// it. A test provides a scripted `RepoUpstream` for GitHub's refusals; the live test uses this one.

/** GitHub couldn't answer the size call. `retryAfterMillis` is the wait it asked for, which the step honors. */
export class UpstreamUnavailable extends Schema.TaggedError<UpstreamUnavailable>()(
  "@smthrs/mvp/repo/UpstreamUnavailable",
  { retryAfterMillis: Schema.optional(Schema.Number) },
) {}

/** What GitHub said of a repository's size: its bytes, rate limited until `retryAt`, or no such repository. */
export type Sized = Size | { readonly missing: true }

/** How long to wait for the size when GitHub rate limits without naming its reset. */
export const DEFAULT_RATE_LIMIT_WAIT_MS = 60 * 60 * 1000

export class RepoUpstream extends Context.Service<
  RepoUpstream,
  {
    /** The repository's HEAD: its commit and default branch. */
    readonly head: (owner: string, name: string) => Effect.Effect<GitRemote.Head, GitRemote.GitRemoteError>
    /** The repository's size, which GitHub reports in KiB and computes hourly. */
    readonly size: (owner: string, name: string) => Effect.Effect<Sized, UpstreamUnavailable>
  }
>()("@smthrs/mvp/repo/RepoUpstream") {
  /**
   * GitHub over the `HttpClient` in context: git's smart HTTP for HEAD, and `GET /repos/<owner>/<name>` for the size,
   * with `token` (a GitHub App or bot token, 5,000 calls an hour) when set, else unauthenticated (60 an hour per IP).
   */
  static readonly layer = (options: { readonly token: Option.Option<Redacted.Redacted<string>> }) =>
    Layer.effect(
      RepoUpstream,
      Effect.gen(function* () {
        const http = yield* Effect.context<HttpClient.HttpClient>()
        const token = Option.map(options.token, Redacted.value)
        // An explicit, empty environment: no ambient GITHUB_TOKEN chooses the account.
        const github = yield* GitHub.GitHubClient.make(Option.isSome(token) ? { token: token.value } : {}, {}).pipe(
          Effect.orDie,
        )
        return RepoUpstream.of({
          head: (owner, name) =>
            GitRemote.head(`https://github.com/${owner}/${name}.git`).pipe(Effect.provideContext(http)),
          size: (owner, name) =>
            github.request("GET", `/repos/${GitHub.Repository.repositoryPath(owner, name)}`, undefined, {
              schema: Schema.Struct({ size: Schema.Number }),
            }).pipe(
              Effect.map(({ size }): Sized => ({ bytes: Math.max(0, size) * 1024 })),
              Effect.catch((error) => {
                // Every IntegrationError carries details: its reason at least.
                const details = error.details as Readonly<Record<string, unknown>>
                if (details["rateLimited"] === true) {
                  // GitHub's reset when it named one; a secondary limit names only a wait, often capped, so an hour.
                  const reset = details["rateLimitResetAt"]
                  return typeof reset === "number"
                    ? Effect.succeed<Sized>({ retryAt: reset })
                    : Effect.map(Clock.currentTimeMillis, (now): Sized => ({ retryAt: now + DEFAULT_RATE_LIMIT_WAIT_MS }))
                }
                if (details["status"] === 404) return Effect.succeed<Sized>({ missing: true })
                return Effect.fail(
                  new UpstreamUnavailable(
                    typeof details["retryAfterMillis"] === "number"
                      ? { retryAfterMillis: details["retryAfterMillis"] }
                      : {},
                  ),
                )
              }),
            ),
        })
      }),
    )

  /** `layer` with the token from `GITHUB_TOKEN`, a redacted, optional Effect `Config`. */
  static readonly layerConfig = Layer.unwrap(
    Effect.map(Config.option(Config.Redacted("GITHUB_TOKEN")), (token) => RepoUpstream.layer({ token })),
  )
}
