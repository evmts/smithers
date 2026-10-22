import { type Core, GitHub } from "@smthrs/integrations"
import { Home } from "@smthrs/views"
import { Config, Data, Duration, Effect, Option, Redacted, Schema } from "effect"
import type { HttpClient } from "effect/http"
import {
  ABOUT_CONTRIBUTORS,
  ABOUT_ROOT_ENTRIES,
  installUrl,
  MAX_BLOB_BYTES,
  textOf,
} from "../src/features/repo/contract.ts"
import type { About, AboutCommit, AboutEntry } from "../src/features/repo/schema.ts"
import { DEFAULT_API_URL } from "./github/Config.ts"
import * as ReadToken from "./github/ReadToken.ts"

// What GitHub says of a repository (docs/features/repo.md#about): its description, topics, languages, latest release,
// contributors, counts, last commit, top folder, README and own home. The repository page shows it from the first visit,
// before anyone clones the repository, so the page is never empty. One read is eleven GitHub calls made at once, then
// the home at the newest commit they named; RepoApi keeps
// the answer in the immutable cache under the hour it was read in, so a repository costs GitHub's quota once an hour.
// Only the repository itself must answer: a part GitHub refuses is left out, unless GitHub is rate limiting, when the
// whole read fails and nothing is cached.

/** Why the about read couldn't answer: GitHub has no such public repository, or it couldn't answer now. */
export class AboutRefused extends Data.TaggedError("AboutRefused")<{
  readonly code: "not_found" | "unavailable"
  readonly retryAfterMillis?: number
}> {}

/** How the about read reaches GitHub, and where the Smithers App is installed. */
export interface Settings {
  /**
   * The token each read goes out with (worker/github/ReadToken.ts): `GITHUB_TOKEN`, else the GitHub App's, 5,000 calls
   * an hour; neither, 60 an hour per IP address.
   */
  readonly token: ReadToken.ReadToken
  /** `GITHUB_API_URL`: GitHub's REST API, `https://api.github.com` unless set. */
  readonly apiBaseUrl: string
  /** `GITHUB_APP_SLUG`: the Smithers GitHub App's name in its URL, `smithers` unless set. */
  readonly appSlug: string
  /** `REPO_ABOUT_FRESH_MINUTES`: how long one read serves, 60 unless set. */
  readonly freshFor: Duration.Duration
}

/** Reads {@link Settings}. */
export const settings = Effect.gen(function* () {
  const token = yield* ReadToken.fromConfig
  const apiBaseUrl = yield* Config.String("GITHUB_API_URL").pipe(Config.withDefault(DEFAULT_API_URL))
  const appSlug = yield* Config.schema(Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]{0,99}$/)), "GITHUB_APP_SLUG")
    .pipe(Config.withDefault("smithers"))
  const minutes = yield* Config.schema(Schema.Int.check(Schema.isGreaterThan(0)), "REPO_ABOUT_FRESH_MINUTES").pipe(
    Config.withDefault(60),
  )
  return {
    token,
    apiBaseUrl,
    appSlug,
    freshFor: Duration.minutes(minutes),
  } satisfies Settings
})

const nullable = <S extends Schema.Top>(schema: S) => Schema.optional(Schema.NullOr(schema))

const RepositoryJson = Schema.Struct({
  full_name: Schema.String,
  description: nullable(Schema.String),
  homepage: nullable(Schema.String),
  topics: Schema.optional(Schema.Array(Schema.String)),
  stargazers_count: Schema.Number,
  forks_count: Schema.Number,
  subscribers_count: Schema.optional(Schema.Number),
  watchers_count: Schema.Number,
  license: nullable(Schema.Struct({ spdx_id: nullable(Schema.String), name: nullable(Schema.String) })),
  default_branch: Schema.String,
  archived: Schema.optional(Schema.Boolean),
  private: Schema.optional(Schema.Boolean),
})

const LanguagesJson = Schema.Record(Schema.String, Schema.Number)

const ReleaseJson = Schema.Struct({
  tag_name: Schema.String,
  name: nullable(Schema.String),
  published_at: nullable(Schema.String),
})

// GitHub answers 202 with no body while it computes a large repository's contributors.
const ContributorsJson = Schema.NullOr(
  Schema.Array(Schema.Struct({ login: Schema.optional(Schema.String), avatar_url: Schema.optional(Schema.String) })),
)

const ReadmeJson = Schema.Struct({
  path: Schema.String,
  size: Schema.Number,
  content: Schema.optional(Schema.String),
  encoding: Schema.optional(Schema.String),
})

const ContentsJson = Schema.Array(Schema.Struct({ name: Schema.String, type: Schema.String }))

const CommitJson = Schema.Struct({
  sha: Schema.String,
  commit: Schema.Struct({
    message: Schema.String,
    author: nullable(Schema.Struct({ name: nullable(Schema.String), date: nullable(Schema.String) })),
  }),
  author: nullable(Schema.Struct({ login: Schema.String })),
})
const decodeCommit = Schema.decodeUnknownOption(CommitJson)

/** A refusal the whole read fails with: a rate limit, with GitHub's wait, or anything else as `unavailable`. */
const refusedBy = (error: Core.IntegrationError.IntegrationError): AboutRefused => {
  const wait = error.details?.["retryAfterMillis"]
  return new AboutRefused(typeof wait === "number" ? { code: "unavailable", retryAfterMillis: wait } : { code: "unavailable" })
}

/**
 * An optional part: its answer, or `null` when GitHub refused it for any reason but a rate limit, which fails the
 * read so nothing partial is cached for the hour.
 */
const optional = <A>(part: Effect.Effect<A, Core.IntegrationError.IntegrationError>): Effect.Effect<A | null, AboutRefused> =>
  part.pipe(
    Effect.catch((error) => error.details?.["rateLimited"] === true ? Effect.fail(refusedBy(error)) : Effect.succeed(null)),
  )

/** An `http(s)` homepage, trimmed; anything else is none. */
const homepageOf = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? "").trim()
  return /^https?:\/\/\S+$/i.test(trimmed) && URL.canParse(trimmed) ? trimmed : null
}

/** A README's, or a home's, text from GitHub's base64 body: none when it is over the view's limit or isn't text. */
const readmeText = (readme: typeof ReadmeJson.Type): string | null => {
  if (readme.size > MAX_BLOB_BYTES || readme.encoding !== "base64" || readme.content === undefined) return null
  try {
    const binary = atob(readme.content.replace(/\s/g, ""))
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return textOf(bytes) ?? null
  } catch {
    return null
  }
}

/** The newest commit, from a `count` of the commits' first item. */
const headOf = (first: unknown): AboutCommit | null =>
  Option.match(decodeCommit(first), {
    onNone: () => null,
    onSome: (commit) => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: commit.author?.login ?? commit.commit.author?.name ?? "",
      at: commit.commit.author?.date ?? "",
    }),
  })

/**
 * What GitHub says of `owner/name`, through `client`. Only the repository itself must answer: a 404 is `not_found`
 * (GitHub keeps private repositories as 404), and any other refusal of it is `unavailable`. `appSlug` names the App
 * whose installation path the answer carries.
 */
export const read = (client: GitHub.GitHubClient.GitHubClient, owner: string, name: string, appSlug: string) =>
  Effect.gen(function* () {
    const path = yield* GitHub.Repository.requireRepositoryPath(owner, name).pipe(
      Effect.mapError(() => new AboutRefused({ code: "not_found" })),
    )
    const base = `/repos/${path}`
    const repository = yield* client.request("GET", base, undefined, { schema: RepositoryJson }).pipe(
      Effect.mapError((error) => error.details?.["status"] === 404 ? new AboutRefused({ code: "not_found" }) : refusedBy(error)),
    )
    if (repository.private === true) return yield* new AboutRefused({ code: "not_found" })
    const [languages, release, releases, contributors, contributorCount, readme, root, commits, branches, tags] =
      yield* Effect.all(
        [
          optional(client.request("GET", `${base}/languages`, undefined, { schema: LanguagesJson })),
          optional(client.request("GET", `${base}/releases/latest`, undefined, { schema: ReleaseJson })),
          optional(client.count(`${base}/releases`)),
          optional(client.request("GET", `${base}/contributors`, undefined, {
            schema: ContributorsJson,
            query: { per_page: ABOUT_CONTRIBUTORS },
          })),
          optional(client.count(`${base}/contributors`)),
          optional(client.request("GET", `${base}/readme`, undefined, { schema: ReadmeJson })),
          optional(client.request("GET", `${base}/contents/`, undefined, { schema: ContentsJson })),
          optional(client.count(`${base}/commits`)),
          optional(client.count(`${base}/branches`)),
          optional(client.count(`${base}/tags`)),
        ] as const,
        { concurrency: "unbounded" },
      )
    const rootEntries = root?.flatMap((entry): ReadonlyArray<AboutEntry> =>
      entry.type === "dir" ? [{ name: entry.name, kind: "dir" }] : entry.type === "file" || entry.type === "symlink"
        ? [{ name: entry.name, kind: "file" }]
        : entry.type === "submodule"
        ? [{ name: entry.name, kind: "dir" }]
        : []
    )
    const readmeBody = readme === null ? null : readmeText(readme)
    const head = commits === null ? null : headOf(commits.first)
    // The repository's own home at that very commit, so a page before the clone draws the home the clone will have.
    const home = head === null ? null : yield* optional(
      client.request("GET", `${base}/contents/${Home.path}`, undefined, { schema: ReadmeJson, query: { ref: head.sha } }),
    )
    return {
      name: repository.full_name,
      description: repository.description?.trim() || null,
      homepage: homepageOf(repository.homepage),
      topics: repository.topics ?? [],
      stars: repository.stargazers_count,
      forks: repository.forks_count,
      watchers: repository.subscribers_count ?? repository.watchers_count,
      license: repository.license?.spdx_id && repository.license.spdx_id !== "NOASSERTION"
        ? repository.license.spdx_id
        : repository.license?.name ?? null,
      defaultBranch: repository.default_branch,
      archived: repository.archived ?? false,
      languages: Object.entries(languages ?? {})
        .filter(([, bytes]) => bytes > 0)
        .sort(([leftName, left], [rightName, right]) => right - left || leftName.localeCompare(rightName))
        .map(([language, bytes]) => ({ name: language, bytes })),
      release: release === null
        ? null
        : { tag: release.tag_name, name: release.name?.trim() || null, publishedAt: release.published_at ?? null },
      releases: releases?.total ?? null,
      contributors: (contributors ?? []).flatMap((person) =>
        person.login === undefined || person.avatar_url === undefined
          ? []
          : [{ login: person.login, avatarUrl: person.avatar_url }]
      ),
      contributorCount: contributorCount?.total ?? null,
      commits: commits?.total ?? null,
      branches: branches?.total ?? null,
      tags: tags?.total ?? null,
      head,
      root: rootEntries === undefined ? null : rootEntries.slice(0, ABOUT_ROOT_ENTRIES),
      readme: readme === null || readmeBody === null ? null : { path: readme.path, text: readmeBody },
      home: home === null ? null : readmeText(home),
      installUrl: installUrl(appSlug),
    } satisfies About
  }).pipe(Effect.withSpan("repo.about.github"))

/**
 * A GitHub client for the about read over the `HttpClient` in context, with `settings`' API URL, and its token when
 * the read is `authenticated`; anonymous otherwise.
 */
export const client = (
  options: Settings,
  read: { readonly authenticated: boolean } = { authenticated: true },
): Effect.Effect<GitHub.GitHubClient.GitHubClient, never, HttpClient.HttpClient> =>
  Effect.flatMap(read.authenticated ? options.token : Effect.succeed(Option.none<Redacted.Redacted<string>>()), (token) =>
    GitHub.GitHubClient.make(
      {
        apiBaseUrl: options.apiBaseUrl,
        ...(Option.isSome(token) ? { token: Redacted.value(token.value) } : {}),
      },
      // An explicit, empty environment: no ambient GITHUB_TOKEN chooses the account.
      {},
    ).pipe(Effect.orDie))

/** Which hour-long window `nowMs` falls in, and the seconds left in it: the cache's key and the browser's max-age. */
export const window = (nowMs: number, freshFor: Duration.Duration) => {
  const span = Duration.toMillis(freshFor)
  const bucket = Math.floor(nowMs / span)
  return { bucket: String(bucket), maxAgeSeconds: Math.max(1, Math.ceil(((bucket + 1) * span - nowMs) / 1000)) }
}
