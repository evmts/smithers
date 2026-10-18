// Code Storage and GitHub as scripted providers for the repository tests (docs/features/repo.md#tests). Both are third-
// party services, scripted like the model: Code Storage keeps its repositories in memory and syncs a mirror from what
// the scripted GitHub holds; GitHub answers HEAD and size from the same table. A test arms a one-shot fault on either
// through `fail`; the live tests (worker/RepoClone.live.test.ts) use the real ones.
import { CodeStorage, GitRemote } from "@smthrs/effect-code-storage"
import { Effect } from "effect"
import type { Sized } from "../RepoUpstream.ts"
import { RepoUpstream, UpstreamUnavailable } from "../RepoUpstream.ts"

/** A repository on the scripted GitHub: its default branch, head commit and files. */
export interface GitHubRepository {
  readonly branch: string | undefined
  readonly commit: { readonly sha: string; readonly message: string; readonly author: string; readonly date: string }
  readonly files: Readonly<Record<string, string | Uint8Array>>
  /** GitHub's `size`, in KiB. */
  readonly sizeKb: number
}

const encoder = new TextEncoder()

/** A 40-hex SHA made from `seed`. */
export const shaOf = (seed: string): string => {
  let hex = ""
  for (let index = 0; hex.length < 40; index++) {
    hex += ((seed.charCodeAt(index % seed.length) * (index + 7)) % 256).toString(16).padStart(2, "0")
  }
  return hex.slice(0, 40)
}

/**
 * The fixture repository the tests and the docs use: a README linking into `docs/`, a guide, code, a binary and a
 * file over RepoApi's 512 KiB cap.
 */
export const fixture = (overrides: Partial<GitHubRepository> = {}): GitHubRepository => ({
  branch: "main",
  commit: { sha: shaOf("fixture"), message: "Add the fixture", author: "Mona", date: "2026-10-19T12:00:00Z" },
  files: {
    "README.md": "# Fixture\n\nSee [the guide](docs/guide.md).\n",
    "docs/guide.md": "# Guide\n\nBack to [the README](../README.md).\n",
    "src/index.ts": "export const one = 1\nexport const two = 2\nexport const three = 3\n",
    "logo.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
    "big.txt": "x".repeat(600 * 1024),
  },
  sizeKb: 640,
  ...overrides,
})

type Operation = CodeStorage.Operation

interface Mirror {
  readonly upstream: { readonly owner: string; readonly name: string }
  readonly defaultBranch: string | undefined
  synced: boolean
  /** `listCommits` calls left that answer `sync_in_progress` after a pull. */
  pending: number
  commit?: GitHubRepository["commit"]
  files?: Readonly<Record<string, Uint8Array>>
}

/** A scripted Code Storage and GitHub, sharing one table of GitHub repositories (`owner/name`, lowercased). */
export const scripted = (options: { readonly syncPolls?: number; readonly pageSize?: number } = {}) => {
  const github = new Map<string, GitHubRepository>()
  const mirrors = new Map<string, Mirror>()
  const calls: Array<string> = []
  const faults = new Map<string, Array<CodeStorage.CodeStorageError | "never">>()
  const githubFaults = new Map<string, Array<GitRemote.GitRemoteError | UpstreamUnavailable | Sized>>()
  const state = { syncPolls: options.syncPolls ?? 1 }

  const fault = (operation: string) => {
    const queued = faults.get(operation)
    const next = queued?.shift()
    return next === undefined
      ? Effect.void
      : next === "never"
      ? Effect.never
      : Effect.fail(next)
  }
  const error = (operation: Operation, code: string, status: number, extra: { size?: number; retryAfterMillis?: number } = {}) =>
    new CodeStorage.CodeStorageError({ operation, code, status, ...extra })

  const client: CodeStorage.Client = {
    createRepo: (create) =>
      Effect.gen(function* () {
        calls.push(`createRepo:${create.name}`)
        yield* fault("createRepo")
        const existing = mirrors.get(create.name)
        if (existing !== undefined) {
          const same = existing.upstream.owner === create.github?.owner && existing.upstream.name === create.github?.name
          if (!same) return yield* error("createRepo", "conflict", 409)
          return { name: create.name, created: false }
        }
        mirrors.set(create.name, {
          upstream: { owner: create.github!.owner, name: create.github!.name },
          defaultBranch: create.defaultBranch,
          synced: false,
          pending: 0,
        })
        return { name: create.name, created: true }
      }),
    pullUpstream: (repo) =>
      Effect.gen(function* () {
        calls.push(`pullUpstream:${repo}`)
        yield* fault("pullUpstream")
        const mirror = mirrors.get(repo)
        if (mirror === undefined) return yield* error("pullUpstream", "repository_not_found", 404)
        const source = github.get(`${mirror.upstream.owner}/${mirror.upstream.name}`.toLowerCase())
        if (source === undefined) return yield* error("pullUpstream", "github_repository_inaccessible", 403)
        mirror.pending = state.syncPolls
        mirror.commit = source.commit
        mirror.files = Object.fromEntries(
          Object.entries(source.files).map(([path, body]) => [path, typeof body === "string" ? encoder.encode(body) : body]),
        )
        mirror.synced = true
      }),
    listCommits: (repo, list = {}) =>
      Effect.gen(function* () {
        calls.push(`listCommits:${repo}`)
        yield* fault("listCommits")
        const mirror = mirrors.get(repo)
        if (mirror === undefined) return yield* error("listCommits", "repository_not_found", 404)
        if (!mirror.synced) return yield* error("listCommits", "ref_not_found", 404)
        if (mirror.pending > 0) {
          mirror.pending--
          return yield* error("listCommits", "sync_in_progress", 409, { retryAfterMillis: 5 })
        }
        if (list.ref !== undefined && list.ref !== mirror.defaultBranch && list.ref !== mirror.commit!.sha) {
          return yield* error("listCommits", "ref_not_found", 404)
        }
        const { sha, message, author, date } = mirror.commit!
        return {
          commits: [{ sha, parentShas: [], message, authorName: author, authorEmail: "mona@example.com", date }],
          nextCursor: undefined,
          bytesRead: 200,
        }
      }),
    listFiles: (repo, list = {}) =>
      Effect.gen(function* () {
        calls.push(`listFiles:${repo}`)
        yield* fault("listFiles")
        const mirror = mirrors.get(repo)
        if (mirror === undefined || !mirror.synced || mirror.pending > 0) {
          return yield* error("listFiles", "repository_not_found", 404)
        }
        if (list.ref !== mirror.commit!.sha) return yield* error("listFiles", "ref_not_found", 404)
        const paths = Object.keys(mirror.files!).sort()
        const start = Number(list.cursor ?? 0)
        const limit = Math.min(list.limit ?? 5_000, options.pageSize ?? 5_000)
        const page = paths.slice(start, start + limit)
        const next = start + limit < paths.length ? String(start + limit) : undefined
        return {
          ref: list.ref,
          paths: page,
          entries: page.map((path) => ({ path, type: "blob", mode: "100644" })),
          nextCursor: next,
          bytesRead: JSON.stringify(page).length,
        }
      }),
    readFile: (repo, read) =>
      Effect.gen(function* () {
        calls.push(`readFile:${repo}:${read.path}`)
        yield* fault("readFile")
        const mirror = mirrors.get(repo)
        const body = mirror?.synced === true && read.ref === mirror.commit!.sha ? mirror.files![read.path] : undefined
        if (body === undefined) return yield* error("readFile", "not_found", 404)
        if (body.length > read.maxBytes) return yield* error("readFile", "too_large", 200, { size: body.length })
        return { bytes: body, blobSha: shaOf(read.path) }
      }),
  }

  const githubFault = (operation: "head" | "size") => githubFaults.get(operation)?.shift()

  const upstream = RepoUpstream.of({
    head: (owner, name) =>
      Effect.gen(function* () {
        calls.push(`head:${owner}/${name}`)
        const armed = githubFault("head")
        if (armed !== undefined) return yield* Effect.fail(armed as GitRemote.GitRemoteError)
        const repository = github.get(`${owner}/${name}`.toLowerCase())
        if (repository === undefined) return yield* new GitRemote.GitRemoteError({ code: "not_found", status: 404 })
        return { sha: repository.commit.sha, branch: repository.branch }
      }),
    size: (owner, name) =>
      Effect.gen(function* () {
        calls.push(`size:${owner}/${name}`)
        const armed = githubFault("size")
        if (armed instanceof UpstreamUnavailable) return yield* Effect.fail(armed)
        if (armed !== undefined) return armed as Sized
        const repository = github.get(`${owner}/${name}`.toLowerCase())
        return repository === undefined ? { missing: true as const } : { bytes: repository.sizeKb * 1024 }
      }),
  })

  return {
    client,
    upstream,
    /** Every call, in order: `<operation>:<repo>`. */
    calls,
    github,
    mirrors,
    /** How many `listCommits` calls answer `sync_in_progress` after each pull. */
    set syncPolls(value: number) {
      state.syncPolls = value
    },
    /** Puts `repository` on GitHub as `owner/name`. */
    publish: (owner: string, name: string, repository: GitHubRepository = fixture()) =>
      void github.set(`${owner}/${name}`.toLowerCase(), repository),
    /** The next call of `operation` fails with `failure` (or never answers, for `"never"`), once per call queued. */
    fail: (operation: Operation, ...failures: ReadonlyArray<CodeStorage.CodeStorageError | "never">) =>
      void faults.set(operation, [...(faults.get(operation) ?? []), ...failures]),
    /** The next GitHub `head` or `size` call answers `answer` instead. */
    failGitHub: (operation: "head" | "size", ...answers: ReadonlyArray<GitRemote.GitRemoteError | UpstreamUnavailable | Sized>) =>
      void githubFaults.set(operation, [...(githubFaults.get(operation) ?? []), ...answers]),
    error,
  }
}

export type Scripted = ReturnType<typeof scripted>
