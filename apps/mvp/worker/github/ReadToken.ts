import { GitHub } from "@smthrs/integrations"
import { Clock, Config, Effect, Option, Redacted, Ref, Semaphore } from "effect"
import type { HttpClient } from "effect/http"
import { codeOf } from "../ErrorCode.ts"
import * as GitHubConfig from "./Config.ts"

// What GitHub REST reads of public repositories go out as (docs/features/repo.md#configuration): the clone's size call
// (worker/RepoUpstream.ts) and a repository's About (worker/RepoAbout.ts). GitHub allows an unauthenticated caller 60
// calls an hour per IP address, and a Worker shares Cloudflare's addresses with every other Worker, so in production
// those reads were refused within minutes (2026-10-21). In order:
//
// - `GITHUB_TOKEN`, when set and not blank: a bot's token, as before.
// - the GitHub App, when this deployment has one: an installation token for the deployment's own repository
//   (`GITHUB_REPOSITORY`) with `metadata: read` only. It reads any public repository at the installation's limit, 5,000
//   calls an hour or more, and holds nothing beyond that one repository's metadata. It is minted on first use and kept
//   until 5 minutes before it expires.
// - neither: anonymous.
//
// Concurrent reads through the same token provider share one cache check and mint.
//
// An App token that can't be minted now leaves that read anonymous and logs `github.read_token` with GitHub's code; the
// next read mints again.

/** The token one read goes out with, or none: anonymous. */
export type ReadToken = Effect.Effect<Option.Option<Redacted.Redacted<string>>>

/** How long before its expiry a held installation token is replaced. */
export const REFRESH_BEFORE_MS = 5 * 60 * 1000

/** Always `token`: a configured token, or none. */
export const fixed = (token: Option.Option<Redacted.Redacted<string>>): ReadToken => Effect.succeed(token)

/**
 * The App's installation token for `repository`, minted with `metadata: read` and narrowed to that repository, held in
 * this isolate until `REFRESH_BEFORE_MS` before it expires. One permit covers the check and mint so concurrent first
 * reads use the same token instead of spending multiple installation-token requests.
 */
export const fromApp = (app: GitHub.AppAuth.AppAuth, repository: { readonly owner: string; readonly name: string }) =>
  Effect.gen(function* () {
    const held = yield* Ref.make(Option.none<GitHub.AppAuth.InstallationToken>())
    const gate = yield* Semaphore.make(1)
    const mint = Effect.gen(function* () {
      const installation = yield* app.installation(repository.owner, repository.name)
      const minted = yield* app.installationToken({
        installationId: installation.id,
        repositories: [repository.name],
        permissions: { metadata: "read" },
      })
      yield* Ref.set(held, Option.some(minted))
      return Option.some(minted.token)
    }).pipe(
      Effect.catch((error) =>
        Effect.as(
          Effect.logWarning("github.read_token").pipe(Effect.annotateLogs({ outcome: "anonymous", errorCode: codeOf(error) })),
          Option.none<Redacted.Redacted<string>>(),
        )
      ),
    )
    const token: ReadToken = Effect.gen(function* () {
      const current = yield* Ref.get(held)
      const now = yield* Clock.currentTimeMillis
      if (Option.isSome(current) && current.value.expiresAt - now > REFRESH_BEFORE_MS) return Option.some(current.value.token)
      return yield* mint
    }).pipe(Semaphore.withPermits(gate, 1))
    return token
  })

/**
 * The deployment's read token from its configuration: `GITHUB_TOKEN` when set and not blank, else the App's
 * (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_REPOSITORY`, `GITHUB_API_URL`) over the `HttpClient` in context,
 * else none. An App configuration that doesn't read, or a key that doesn't import, is none too; `github.config` logs
 * them where the git loop starts.
 */
export const fromConfig = Effect.gen(function* () {
  const configured = Option.filter(
    yield* Config.option(Config.Redacted("GITHUB_TOKEN")),
    (value) => Redacted.value(value).trim() !== "",
  )
  if (Option.isSome(configured)) return fixed(configured)
  // An App configuration that doesn't read (a malformed `GITHUB_API_URL`) fails where the git loop reads it; here it
  // leaves reads anonymous.
  const github = yield* GitHubConfig.configured.pipe(Effect.orElseSucceed(() => Option.none<GitHubConfig.GitHubApp>()))
  if (Option.isNone(github)) return fixed(Option.none())
  const { appId, privateKey, apiBaseUrl, repository } = github.value
  const app = yield* GitHub.AppAuth.make({ appId, privateKey, apiBaseUrl }).pipe(Effect.option)
  if (Option.isNone(app)) return fixed(Option.none())
  return yield* fromApp(app.value, repository)
}) satisfies Effect.Effect<ReadToken, Config.ConfigError, HttpClient.HttpClient>
