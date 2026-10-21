// GitHub's REST API, scripted, as RepoApi's about route reaches it (docs/features/repo.md#about): a third-party
// provider, scripted like the model and Code Storage, on the fetch seam. It answers the ten reads the about route
// makes, from the repositories a test publishes, with GitHub's own shapes: base64 READMEs, `Link` headers that name
// the last page of a one-item page, 404 for a missing release or README, 202 with no body while GitHub computes
// contributors. A test arms a fault per path suffix: a status, or a rate limit. The real GitHub is the e2e tests'.

/** Where GitHub's REST API is, unless `GITHUB_API_URL` says otherwise. */
export const GITHUB_API = "https://api.github.com"

/** A repository on the scripted GitHub, in about's terms. */
export interface RestRepository {
  readonly fullName: string
  readonly description: string | null
  readonly homepage: string | null
  readonly topics: ReadonlyArray<string>
  readonly stars: number
  readonly forks: number
  readonly watchers: number
  readonly license: { readonly spdx: string | null; readonly name: string | null } | null
  readonly defaultBranch: string
  readonly archived: boolean
  readonly private: boolean
  readonly languages: Readonly<Record<string, number>>
  readonly release: { readonly tag: string; readonly name: string | null; readonly publishedAt: string } | null
  readonly releases: number
  /** `null`: GitHub is still computing them, and answers 202 with no body. */
  readonly contributors: ReadonlyArray<{ readonly login?: string; readonly avatar?: string }> | null
  readonly contributorCount: number
  readonly readme: { readonly path: string; readonly text: string; readonly size?: number } | null
  readonly root: ReadonlyArray<{ readonly name: string; readonly type: string }> | null
  /** Newest first. */
  readonly commits: ReadonlyArray<{
    readonly sha: string
    readonly message: string
    readonly name: string | null
    readonly date: string | null
    readonly login: string | null
  }>
  readonly branches: number
  readonly tags: number
}

/** `octocat/Spoon-Knife` as GitHub tells it: the repository the e2e tests open. */
export const spoonKnife = (overrides: Partial<RestRepository> = {}): RestRepository => ({
  fullName: "octocat/Spoon-Knife",
  description: "This repo is for demonstration purposes only.",
  homepage: "",
  topics: ["demo", "forking"],
  stars: 14126,
  forks: 160292,
  watchers: 908,
  license: { spdx: "MIT", name: "MIT License" },
  defaultBranch: "main",
  archived: false,
  private: false,
  languages: { HTML: 355, CSS: 256 },
  release: { tag: "v1.0.0", name: "First", publishedAt: "2026-10-01T12:00:00Z" },
  releases: 2,
  contributors: [{ login: "octocat", avatar: "https://avatars.githubusercontent.com/u/583231?v=4" }, {}],
  contributorCount: 1,
  readme: { path: "README.md", text: "### Well hello there!\n\nFork me.\n" },
  root: [{ name: "README.md", type: "file" }, { name: "index.html", type: "file" }, { name: "docs", type: "dir" }],
  commits: [{
    sha: "d0dd1f61b33d64e29d8bc1372a94ef6a2fee76a9",
    message: "Pointing to the guide for forking",
    name: "The Octocat",
    date: "2014-02-12T23:20:44Z",
    login: "octocat",
  }],
  branches: 3,
  tags: 0,
  ...overrides,
})

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-ratelimit-remaining": "59", ...headers },
  })

const notFound = () => json(404, { message: "Not Found" })

/** A one-item page of a list `total` long, with the `Link` header GitHub sends for it. */
const counted = (url: URL, total: number, first: unknown) =>
  json(200, total === 0 ? [] : [first], total > 1 ? {
    link: `<${url.origin}${url.pathname}?per_page=1&page=2>; rel="next", ` +
      `<${url.origin}${url.pathname}?per_page=1&page=${total}>; rel="last"`,
  } : {})

const base64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)))

/** A scripted GitHub: `fetch` answers; `publish` adds a repository; `fail` arms a fault on a path suffix. */
export const scriptedGitHub = () => {
  const repositories = new Map<string, RestRepository>()
  const faults = new Map<string, number | "rate_limited">()
  const answers = new Map<string, (url: URL) => Response>()
  const calls: Array<string> = []
  const authorizations: Array<string | null> = []

  const answer = (repository: RestRepository, rest: string, url: URL): Response => {
    switch (rest) {
      case "":
        return json(200, {
          full_name: repository.fullName,
          description: repository.description,
          homepage: repository.homepage,
          topics: repository.topics,
          stargazers_count: repository.stars,
          forks_count: repository.forks,
          subscribers_count: repository.watchers,
          watchers_count: repository.stars,
          license: repository.license === null ? null : { spdx_id: repository.license.spdx, name: repository.license.name },
          default_branch: repository.defaultBranch,
          archived: repository.archived,
          private: repository.private,
        })
      case "/languages":
        return json(200, repository.languages)
      case "/releases/latest":
        return repository.release === null ? notFound() : json(200, {
          tag_name: repository.release.tag,
          name: repository.release.name,
          published_at: repository.release.publishedAt,
        })
      case "/releases":
        return counted(url, repository.releases, { tag_name: repository.release?.tag })
      case "/contributors":
        if (url.searchParams.get("per_page") === "1") {
          return counted(url, repository.contributorCount, repository.contributors?.[0] ?? {})
        }
        return repository.contributors === null ? new Response(null, { status: 202 }) : json(
          200,
          repository.contributors.map((person) => ({ login: person.login, avatar_url: person.avatar })),
        )
      case "/readme":
        return repository.readme === null ? notFound() : json(200, {
          path: repository.readme.path,
          size: repository.readme.size ?? new TextEncoder().encode(repository.readme.text).length,
          encoding: "base64",
          content: base64(repository.readme.text).replace(/(.{60})/g, "$1\n"),
        })
      case "/contents/":
        return repository.root === null ? notFound() : json(200, repository.root)
      case "/commits": {
        const newest = repository.commits[0]
        return counted(url, repository.commits.length, newest === undefined ? undefined : {
          sha: newest.sha,
          commit: { message: newest.message, author: { name: newest.name, date: newest.date } },
          author: newest.login === null ? null : { login: newest.login },
        })
      }
      case "/branches":
        return counted(url, repository.branches, { name: repository.defaultBranch })
      case "/tags":
        return counted(url, repository.tags, { name: "v1.0.0" })
      default:
        return notFound()
    }
  }

  const fetch = async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const match = /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(url.pathname)
    if (match === null) return notFound()
    const [, owner, name, rest = ""] = match
    calls.push(rest)
    authorizations.push(request.headers.get("authorization"))
    const fault = faults.get(rest)
    if (fault === "rate_limited") {
      return json(403, { message: "API rate limit exceeded" }, {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(Math.ceil(Date.now() / 1000) + 600),
      })
    }
    if (fault !== undefined) return json(fault, { message: "scripted fault" })
    const scripted = answers.get(rest)
    if (scripted !== undefined) return scripted(url)
    const repository = repositories.get(`${decodeURIComponent(owner!)}/${decodeURIComponent(name!)}`.toLowerCase())
    return repository === undefined ? notFound() : answer(repository, rest, url)
  }

  return {
    fetch,
    /** Every path GitHub was asked for, after `/repos/<owner>/<name>`, in order. */
    calls,
    /** Each request's `Authorization` header, or `null` for an anonymous one, in the order of `calls`. */
    authorizations,
    publish: (owner: string, name: string, repository: RestRepository = spoonKnife()) =>
      void repositories.set(`${owner}/${name}`.toLowerCase(), repository),
    /** Arms a fault on every request for `/repos/<owner>/<name><rest>` until `clear`. */
    fail: (rest: string, fault: number | "rate_limited") => void faults.set(rest, fault),
    /** Answers every request for `/repos/<owner>/<name><rest>` with `body` as JSON until `clear`: GitHub's odd shapes. */
    answer: (rest: string, body: unknown, status = 200) => void answers.set(rest, () => json(status, body)),
    clear: () => {
      faults.clear()
      answers.clear()
    },
  }
}

export type ScriptedGitHub = ReturnType<typeof scriptedGitHub>
