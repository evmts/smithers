---
title: "@smthrs/effect-code-storage"
description: "Code Storage, Pierre's git hosting, for Effect programs: import a public GitHub repository, sync it, list its files, read a file and list commits, with per-request ES256 tokens; and read a git remote's HEAD with no credential."
---

`@smthrs/effect-code-storage` is an Effect client for
[Code Storage](https://code.storage), git hosting built for programs by The
Pierre Computer Company. A repository there is real git over HTTPS, and it can
mirror an upstream such as a public GitHub repository. This package covers
what a host needs to import one and browse it.

## What it guarantees

- **One short token per request.** Each call signs its own JWT with the
  organization's ES256 key through WebCrypto. The `repo` claim names the one
  repository the call touches, `scopes` holds only the scope the call needs
  (`repo:write` to create, `git:write` to sync, `git:read` to read), and the
  token lives five minutes. Code Storage refuses a restricted key's token past
  an hour.
- **Secrets stay out of telemetry.** The key is imported once, when the layer
  is built, and never leaves the client. Tokens travel only in the
  `Authorization` header, which Effect's HTTP client never records.
- **Typed failures without the provider's text.** A failure is a
  `CodeStorageError` with Code Storage's stable `code`, the HTTP status and
  `Retry-After` in milliseconds as `retryAfterMillis`, the field a durable
  flow's `RetryPolicy` waits. Its free-text `detail` is never copied, so a
  failure can be logged and traced as is. `isTransient` says which failures
  may succeed unchanged on another try. Retrying is yours to decide, for
  example with a durable flow's `RetryPolicy`.
- **Bounded reads.** JSON answers stop at 8 MiB, error bodies at 16 KiB, and a
  file at the `maxBytes` you pass. A file whose declared size is over the cap
  fails `too_large` before its body is read.
- **Observable.** Each call is one span, `CodeStorage.<operation>`, whose only
  attribute is the repository, plus one count on `code_storage_requests` by
  `operation` and `outcome`. Effect's HTTP client span is its child.
- **Metered.** Every response byte received counts on
  `code_storage_bytes_read` by `operation`, and each page reports its own
  `bytesRead`. Code Storage bills outbound transfer but has no usage API, so
  this is how a host keeps a spend budget.
- **Platform neutral.** It uses Effect's `HttpClient`, WebCrypto and
  `TextDecoder`, and imports no Node built-in.

## Importing a public GitHub repository

Code Storage's public mode mirrors a public GitHub repository with no GitHub
App and no GitHub credential. It syncs once, when asked, and needs the
upstream to stay public. It does not support Git LFS.

1. `GitRemote.head("https://github.com/<owner>/<name>.git")` reads the
   upstream's default branch and commit, and fails `not_found` for a missing or
   private repository. It uses git's own smart HTTP endpoint, so it needs no
   token and isn't held to GitHub's REST limit of 60 requests an hour per
   address.
2. `createRepo({ name, defaultBranch: head.branch, github: { owner, name } })`
   creates the mirror. Creating is idempotent by name: a second call answers
   `created: false`, and the same name with another upstream fails `conflict`.
   Name the default branch: Code Storage defaults to `main`.
3. `pullUpstream(name)` starts the sync. Until the first sync finishes, calls
   on the repository fail `sync_in_progress`, which is transient.
4. `listCommits(name, { ref: branch, limit: 1 })` succeeds once the sync is
   done, with the head commit. From then on, read at that commit's SHA:
   `listFiles(name, { ref, recursive: true, limit: 5000 })`, then
   `readFile(name, { path, ref, maxBytes })`.

## Code Storage facts it relies on

From `https://code.storage/docs/openapi.json`, read 2026-10-19:

| Call           | Route                                                            | Scope        |
| -------------- | ---------------------------------------------------------------- | ------------ |
| `createRepo`   | `POST /api/repos` with `repo_name`, `default_branch`, `upstream` | `repo:write` |
| `pullUpstream` | `POST /api/repos/{repo}/upstream/pull`                           | `git:write`  |
| `listFiles`    | `GET /api/repos/{repo}/files`                                    | `git:read`   |
| `readFile`     | `GET /api/repos/{repo}/file`                                     | `git:read`   |
| `listCommits`  | `GET /api/repos/{repo}/commits`                                  | `git:read`   |

A repository name may contain `/`; the client encodes it into one path
segment. The organization's API origin is `https://api.<org>.code.storage`.

### Capacity and spend

From `https://code.storage/docs/llms.txt` and its pages, read 2026-10-19:

- **No usage or billing API.** `GET /api/meta` returns the cluster's provider,
  region and inbound addresses. `GET /api/repos/{repo}` and `GET /api/repos`
  return names, default branch, creation time and upstream, with no size.
- **No published rate limit.** A `429 rate_limited` carries `Retry-After`,
  the minimum delay, which takes precedence, and the IETF `RateLimit` field.
  The gateway's capacity is dynamic, so there is no `RateLimit-Policy`.
- **Unknown codes.** New codes can be added; treat an unknown one as its
  status's generic code. The client does.

## Pages

- [API reference](api.md)
