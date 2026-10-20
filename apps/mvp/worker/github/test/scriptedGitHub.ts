// A scripted GitHub for the git loop's tests (docs/features/issues.md#tests): a third-party provider scripted like the
// model, on the `HttpClient` seam, an Effect service the flows and routes take as a value; nothing intercepts a request.
// It keeps the GitHub rules the loop relies on: an App's JWT mints installation tokens only for an installed App and
// only within the permissions it was granted; issues and comments are numbered, timestamped and attributed to whoever's
// token made them; listings page by `per_page` with `Link: rel="next"`, sorted and filtered by `since` as GitHub does;
// a deleted or transferred issue answers 404. A test arms one-shot faults per request: a status GitHub answers with
// (nothing applied), or `lost`, where GitHub applies a write and the answer never arrives. The real GitHub is
// worker/github/Live.test.ts.
import { GitHub } from "@smthrs/integrations"
import { Effect, Layer, Redacted } from "effect"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http"

/** The App's ID, as the deployment's `GITHUB_APP_ID` names it. */
export const APP_ID = "424242"

/** The installation the scripted App has on the repository. */
export const INSTALLATION_ID = 77

/** GitHub's numeric id of the scripted repository. */
export const REPOSITORY_ID = 1_296_269

/** The login GitHub shows for the App's own writes. */
export const BOT_LOGIN = "smithers[bot]"

/** One issue as the scripted GitHub keeps it. */
export interface ScriptedIssue {
  readonly id: number
  readonly number: number
  title: string
  body: string | null
  state: "open" | "closed"
  /** Null for a deleted account (GitHub's ghost). */
  readonly login: string | null
  readonly createdAt: number
  updatedAt: number
  closedAt: number | null
  readonly pull: boolean
  /** Deleted or transferred away: GitHub answers 404 and leaves it out of every listing. */
  gone: boolean
  /** Listed without the fields this app reads, as if GitHub changed its shape. */
  malformed?: boolean
  readonly comments: Array<ScriptedComment>
}

/** One comment as the scripted GitHub keeps it. */
export interface ScriptedComment {
  readonly id: number
  readonly issue: number
  body: string
  readonly login: string | null
  readonly createdAt: number
  updatedAt: number
  gone: boolean
  malformed?: boolean
}

/** A one-shot fault on the next request that `match`es: GitHub's `status`, or `lost` (applied, then no answer). */
export interface Fault {
  readonly match: (method: string, path: string) => boolean
  readonly status?: number
  readonly headers?: Readonly<Record<string, string>>
  readonly lost?: boolean
}

/** One request GitHub saw: its method, path, and which kind of token made it. */
export interface Call {
  readonly method: string
  readonly path: string
  readonly token: "jwt" | "installation" | "user" | "none"
}

export interface ScriptedGitHub {
  readonly http: HttpClient.HttpClient
  readonly layer: Layer.Layer<HttpClient.HttpClient>
  readonly owner: string
  readonly name: string
  readonly issues: Map<number, ScriptedIssue>
  readonly calls: Array<Call>
  readonly faults: Array<Fault>
  /** Whether the App is installed on the repository. */
  installed: boolean
  /** The issues permission the App was granted: a token asking for more is refused 422. */
  granted: "read" | "write" | "none"
  /** Whether the repository is private. */
  private: boolean
  /** GitHub's clock, in epoch ms: the real one, moved on a second at least by each change, so `updated_at` is ordered. */
  now: number
  /** The installation tokens GitHub minted, newest last, with what each was asked for. */
  readonly minted: Array<{ readonly token: string; readonly body: unknown }>
  /** A user token GitHub accepts, for `login`. */
  readonly userToken: (login: string) => Redacted.Redacted<string>
  /** Revokes a user token: GitHub answers 401 for it from now on. */
  readonly revoke: (token: Redacted.Redacted<string>) => void
  /** Someone on github.com opens an issue; a null body is one with no description, a null login a deleted account. */
  readonly open: (title: string, body: string | null, login?: string | null) => ScriptedIssue
  /** Someone on github.com comments. */
  readonly comment: (number: number, body: string, login?: string | null) => ScriptedComment
  /** Someone on github.com edits an issue's title. */
  readonly retitle: (number: number, title: string) => void
  /** The issue is deleted, or transferred away. */
  readonly remove: (number: number) => void
  /** The comment is deleted. */
  readonly removeComment: (id: number) => void
  /** Requests GitHub saw for `method` and a path matching `pattern`. */
  readonly seen: (method: string, pattern: RegExp) => ReadonlyArray<Call>
}

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z")

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })

const decoder = new TextDecoder()

/** A scripted GitHub at `https://api.github.test` with the repository `owner/name`, the App installed and granted write. */
export const scriptedGitHub = (owner = "acme", name = "widgets"): ScriptedGitHub => {
  const userTokens = new Map<string, string>()
  const installationTokens = new Map<string, "read" | "write">()
  let ids = 1_000
  let numbers = 0
  let users = 0

  const apiPath = `/repos/${owner}/${name}`.toLowerCase()

  const user = (login: string | null) => (login === null ? null : { id: login.length, login })

  const issueJson = (issue: ScriptedIssue) => ({
    id: issue.id,
    ...(issue.malformed === true ? {} : { node_id: `I_${issue.id}` }),
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    state_reason: issue.state === "closed" ? "completed" : null,
    user: user(issue.login),
    comments: issue.comments.filter((comment) => !comment.gone).length,
    created_at: iso(issue.createdAt),
    updated_at: iso(issue.updatedAt),
    closed_at: issue.closedAt === null ? null : iso(issue.closedAt),
    html_url: `https://github.com/${owner}/${name}/issues/${issue.number}`,
    ...(issue.pull ? { pull_request: { url: "https://api.github.test/pulls" } } : {}),
  })

  const commentJson = (comment: ScriptedComment) => ({
    id: comment.id,
    ...(comment.malformed === true ? {} : { node_id: `IC_${comment.id}` }),
    body: comment.body,
    user: user(comment.login),
    created_at: iso(comment.createdAt),
    updated_at: iso(comment.updatedAt),
    issue_url: `https://api.github.test/repos/${owner}/${name}/issues/${comment.issue}`,
    html_url: `https://github.com/${owner}/${name}/issues/${comment.issue}#issuecomment-${comment.id}`,
  })

  // GitHub's clock follows the real one, a second at least per change, so `since` searches a write's admission makes
  // (Postgres' clock) find what GitHub stamped after it.
  const tick = () => (github.now = Math.max(github.now + 1_000, Date.now()))

  /** One page of `items` by `per_page` and `page`, with GitHub's `Link` header when more follow. */
  const paged = (url: URL, items: ReadonlyArray<unknown>) => {
    const perPage = Number(url.searchParams.get("per_page") ?? 30)
    const page = Number(url.searchParams.get("page") ?? 1)
    const slice = items.slice((page - 1) * perPage, page * perPage)
    const headers: Record<string, string> = {}
    if (page * perPage < items.length) {
      const next = new URL(url)
      next.searchParams.set("page", String(page + 1))
      headers["link"] = `<${next.toString()}>; rel="next"`
    }
    return json(slice, 200, headers)
  }

  const since = (url: URL) => {
    const value = url.searchParams.get("since")
    return value === null ? -Infinity : Date.parse(value)
  }

  const sorted = <T extends { readonly createdAt: number; updatedAt: number }>(url: URL, items: ReadonlyArray<T>) => {
    const key = url.searchParams.get("sort") === "created" ? "createdAt" : "updatedAt"
    const direction = url.searchParams.get("direction") === "asc" ? 1 : -1
    return [...items].sort((a, b) => (a[key] - b[key]) * direction)
  }

  const answer = (method: string, url: URL, token: Call["token"], login: string | undefined, body: unknown): {
    readonly response: Response
    readonly apply?: () => void
  } => {
    const path = url.pathname.toLowerCase()
    if (path === `${apiPath}/installation` && method === "GET") {
      if (token !== "jwt") return { response: json({ message: "A JSON web token could not be decoded" }, 401) }
      return { response: github.installed ? json({ id: INSTALLATION_ID }) : json({ message: "Not Found" }, 404) }
    }
    if (path === `/app/installations/${INSTALLATION_ID}/access_tokens` && method === "POST") {
      if (token !== "jwt") return { response: json({ message: "A JSON web token could not be decoded" }, 401) }
      if (!github.installed) return { response: json({ message: "Not Found" }, 404) }
      const asked = (body as { readonly permissions?: { readonly issues?: string } }).permissions?.issues ?? "read"
      const allowed = github.granted === "write" || (github.granted === "read" && asked === "read")
      if (!allowed) return { response: json({ message: "The permissions requested are not granted to this installation." }, 422) }
      const minted = `ghs_scripted_${github.minted.length + 1}`
      installationTokens.set(minted, asked === "write" ? "write" : "read")
      github.minted.push({ token: minted, body })
      return { response: json({ token: minted, expires_at: iso(github.now + 3_600_000) }, 201) }
    }
    if (!path.startsWith(apiPath)) return { response: json({ message: "Not Found" }, 404) }
    if (token === "none" || login === undefined) return { response: json({ message: "Bad credentials" }, 401) }
    const rest = path.slice(apiPath.length)
    const live = [...github.issues.values()].filter((issue) => !issue.gone)
    if (rest === "" && method === "GET") return { response: json({ id: REPOSITORY_ID, private: github.private }) }
    if (rest === "/issues" && method === "GET") {
      const listed = sorted(url, live.filter((issue) => issue.updatedAt >= since(url)))
      return { response: paged(url, listed.map(issueJson)) }
    }
    if (rest === "/issues" && method === "POST") {
      const input = body as { readonly title: string; readonly body: string }
      const issue: ScriptedIssue = {
        id: (ids += 1),
        number: (numbers += 1),
        title: input.title,
        body: input.body,
        state: "open",
        login,
        createdAt: tick(),
        updatedAt: github.now,
        closedAt: null,
        pull: false,
        gone: false,
        comments: [],
      }
      return { response: json(issueJson(issue), 201), apply: () => void github.issues.set(issue.number, issue) }
    }
    if (rest === "/issues/comments" && method === "GET") {
      const comments = live.flatMap((issue) => issue.comments.filter((comment) => !comment.gone))
      const listed = sorted(url, comments.filter((comment) => comment.updatedAt >= since(url)))
      return { response: paged(url, listed.map(commentJson)) }
    }
    const match = /^\/issues\/(\d+)(\/comments)?$/.exec(rest)
    if (match === null) return { response: json({ message: "Not Found" }, 404) }
    const issue = github.issues.get(Number(match[1]))
    if (issue === undefined || issue.gone) return { response: json({ message: "Not Found" }, 404) }
    if (match[2] === undefined && method === "GET") return { response: json(issueJson(issue)) }
    if (match[2] !== undefined && method === "GET") {
      // An issue's comments come oldest first.
      const listed = issue.comments
        .filter((comment) => !comment.gone && comment.updatedAt >= since(url))
        .sort((a, b) => a.createdAt - b.createdAt)
      return { response: paged(url, listed.map(commentJson)) }
    }
    if (match[2] !== undefined && method === "POST") {
      const comment: ScriptedComment = {
        id: (ids += 1),
        issue: issue.number,
        body: (body as { readonly body: string }).body,
        login,
        createdAt: tick(),
        updatedAt: github.now,
        gone: false,
      }
      return {
        response: json(commentJson(comment), 201),
        apply: () => {
          issue.comments.push(comment)
          issue.updatedAt = github.now
        },
      }
    }
    return { response: json({ message: "Not Found" }, 404) }
  }

  /** Who a request's `Authorization` names: the App's JWT, an installation token, a user, or nobody. */
  const caller = (authorization: string | undefined): { readonly token: Call["token"]; readonly login?: string } => {
    const bearer = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined
    if (bearer === undefined) return { token: "none" }
    if (installationTokens.has(bearer)) return { token: "installation", login: BOT_LOGIN }
    const login = userTokens.get(bearer)
    if (login !== undefined) return { token: "user", login }
    const parts = bearer.split(".")
    if (parts.length === 3) {
      const claims = JSON.parse(decoder.decode(Uint8Array.from(atob(parts[1]!.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0))))
      if (claims.iss === APP_ID) return { token: "jwt" }
    }
    return { token: "none" }
  }

  const http = HttpClient.make((request, url) =>
    Effect.suspend(() => {
      const method = request.method
      const who = caller(request.headers["authorization"])
      github.calls.push({ method, path: url.pathname, token: who.token })
      const raw = request.body._tag === "Uint8Array" ? decoder.decode(request.body.body) : undefined
      const body: unknown = raw === undefined || raw === "" ? undefined : JSON.parse(raw)
      const fault = github.faults.findIndex((candidate) => candidate.match(method, url.pathname))
      const armed = fault === -1 ? undefined : github.faults.splice(fault, 1)[0]
      if (armed !== undefined && armed.lost !== true) {
        return Effect.succeed(
          HttpClientResponse.fromWeb(request, json({ message: "scripted fault" }, armed.status ?? 502, { ...armed.headers })),
        )
      }
      // An installation token writes only with the permission it was minted with.
      if (who.token === "installation" && method === "POST" && url.pathname.startsWith(apiPath)) {
        const bearer = request.headers["authorization"]!.slice("Bearer ".length)
        if (installationTokens.get(bearer) !== "write") {
          return Effect.succeed(
            HttpClientResponse.fromWeb(request, json({ message: "Resource not accessible by integration" }, 403)),
          )
        }
      }
      const answered = answer(method, url, who.token, who.login, body)
      answered.apply?.()
      if (armed?.lost === true) {
        return Effect.fail(
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.TransportError({ request, cause: new Error("scripted lost answer") }),
          }),
        )
      }
      return Effect.succeed(HttpClientResponse.fromWeb(request, answered.response))
    })
  )

  const github: ScriptedGitHub = {
    http,
    layer: Layer.succeed(HttpClient.HttpClient, http),
    owner,
    name,
    issues: new Map(),
    calls: [],
    faults: [],
    installed: true,
    granted: "write",
    private: false,
    now: Date.now(),
    minted: [],
    userToken: (login) => {
      const token = `ghu_scripted_${(users += 1)}`
      userTokens.set(token, login)
      return Redacted.make(token)
    },
    revoke: (token) => void userTokens.delete(Redacted.value(token)),
    open: (title, body, login = "octocat") => {
      const issue: ScriptedIssue = {
        id: (ids += 1),
        number: (numbers += 1),
        title,
        body,
        state: "open",
        login,
        createdAt: tick(),
        updatedAt: github.now,
        closedAt: null,
        pull: false,
        gone: false,
        comments: [],
      }
      github.issues.set(issue.number, issue)
      return issue
    },
    comment: (number, body, login = "octocat") => {
      const issue = github.issues.get(number)!
      const comment: ScriptedComment = {
        id: (ids += 1),
        issue: number,
        body,
        login,
        createdAt: tick(),
        updatedAt: github.now,
        gone: false,
      }
      issue.comments.push(comment)
      issue.updatedAt = github.now
      return comment
    },
    retitle: (number, title) => {
      const issue = github.issues.get(number)!
      issue.title = title
      issue.updatedAt = tick()
    },
    remove: (number) => void (github.issues.get(number)!.gone = true),
    removeComment: (id) => {
      for (const issue of github.issues.values()) {
        const comment = issue.comments.find((candidate) => candidate.id === id)
        if (comment !== undefined) {
          comment.gone = true
          issue.updatedAt = tick()
        }
      }
    },
    seen: (method, pattern) => github.calls.filter((call) => call.method === method && pattern.test(call.path)),
  }
  return github
}

/** A fresh RSA key, as GitHub would issue an App, in PKCS#8 PEM (`GitHub.AppAuth` takes PKCS#1 or PKCS#8). */
export const appKey = async (): Promise<Redacted.Redacted<string>> => {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey))
  const base64 = btoa(String.fromCharCode(...der)).replace(/(.{64})/g, "$1\n")
  return Redacted.make(`-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----\n`)
}

/** The App over the scripted GitHub, as `GitHub.AppAuth` makes it with `key`. */
export const scriptedApp = (github: ScriptedGitHub, key: Redacted.Redacted<string>) =>
  GitHub.AppAuth.make({ appId: APP_ID, privateKey: key, apiBaseUrl: SCRIPTED_API }).pipe(Effect.provide(github.layer))

/** The scripted GitHub's REST origin. */
export const SCRIPTED_API = "https://api.github.test"
