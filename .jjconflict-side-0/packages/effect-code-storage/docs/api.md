---
title: "API reference"
description: "Every export of @smthrs/effect-code-storage: the CodeStorage and GitRemote namespaces, their service, layers, models, errors and metrics."
---

The package root exports two namespaces and nothing else:

```ts
import { CodeStorage, GitRemote } from "@smthrs/effect-code-storage"
```

## `CodeStorage`

### `CodeStorage.CodeStorage`

```ts
class CodeStorage extends Context.Service<CodeStorage, Client>() {
  static readonly layer: (credentials: Credentials) => Layer.Layer<CodeStorage, CodeStorageError, HttpClient.HttpClient>
  static readonly layerConfig: Layer.Layer<CodeStorage, CodeStorageError | Config.ConfigError, HttpClient.HttpClient>
}
```

The client as a service. `layer` imports the key once; a key that doesn't
import fails the layer with `{ operation: "configure", code: "invalid_key" }`.
`layerConfig` reads its credentials with `config`.

### `CodeStorage.Client`

```ts
interface Client {
  readonly createRepo: (options: CreateRepoOptions) => Effect.Effect<CreatedRepo, CodeStorageError>
  readonly pullUpstream: (repo: string) => Effect.Effect<void, CodeStorageError>
  readonly listFiles: (repo: string, options?: ListFilesOptions) => Effect.Effect<FilesPage, CodeStorageError>
  readonly readFile: (repo: string, options: ReadFileOptions) => Effect.Effect<FileContents, CodeStorageError>
  readonly listCommits: (repo: string, options?: ListCommitsOptions) => Effect.Effect<CommitsPage, CodeStorageError>
}
```

- `createRepo` creates a repository, mirroring `github` when given. It is
  idempotent by name: `created` is `false` when the repository already
  existed. The same name with another upstream fails `conflict`.
- `pullUpstream` starts a sync from the upstream. While one runs, calls on the
  repository fail `sync_in_progress`.
- `listFiles` lists one page of the tree. `nextCursor` is set when there is
  another page.
- `readFile` reads one file's bytes, up to `maxBytes`.
- `listCommits` lists one page of commits, newest first.

### `CodeStorage.Credentials` and `CodeStorage.config`

```ts
interface Credentials {
  readonly org: string
  readonly key: Redacted.Redacted<string>
  readonly apiUrl?: string | undefined
}
const config: Config.Config<Credentials>
```

`key` is the organization's ES256 key as a PKCS#8 PEM; newlines escaped as
`\n`, as an environment variable often carries them, work too. `apiUrl`
defaults to `https://api.<org>.code.storage`. `config` reads
`CODE_STORAGE_ORG`, `CODE_STORAGE_KEY` (redacted) and the optional
`CODE_STORAGE_API_URL`.

### Options and results

```ts
interface GitHubUpstream {
  readonly owner: string
  readonly name: string
}
interface CreateRepoOptions {
  readonly name: string
  readonly defaultBranch?: string | undefined
  readonly github?: GitHubUpstream | undefined
}
interface CreatedRepo {
  readonly name: string
  readonly created: boolean
}

interface ListFilesOptions {
  readonly ref?: string | undefined
  readonly path?: string | undefined
  readonly recursive?: boolean | undefined
  readonly cursor?: string | undefined
  readonly limit?: number | undefined
}
interface FileEntry {
  readonly path: string
  readonly type: string
  readonly mode: string
}
interface FilesPage {
  readonly ref: string
  readonly paths: ReadonlyArray<string>
  readonly entries: ReadonlyArray<FileEntry>
  readonly nextCursor: string | undefined
  readonly bytesRead: number
}

interface ReadFileOptions {
  readonly path: string
  readonly ref?: string | undefined
  readonly maxBytes: number
}
interface FileContents {
  readonly bytes: Uint8Array
  readonly blobSha: string | undefined
}

interface ListCommitsOptions {
  readonly ref?: string | undefined
  readonly path?: string | undefined
  readonly cursor?: string | undefined
  readonly limit?: number | undefined
}
interface Commit {
  readonly sha: string
  readonly parentShas: ReadonlyArray<string>
  readonly message: string
  readonly authorName: string
  readonly authorEmail: string
  readonly date: string
}
interface CommitsPage {
  readonly commits: ReadonlyArray<Commit>
  readonly nextCursor: string | undefined
  readonly bytesRead: number
}
```

- A `ref` is a branch, a tag or a commit SHA, and defaults to the repository's
  default branch.
- `listFiles` sends only the options given. Code Storage's `limit` defaults to
  1,000 and allows up to 5,000. `paths` lists blobs only; `entries` also has
  trees, symlinks and submodules, with `type` and git's six-digit `mode`.
- A `readFile` whose declared size is over `maxBytes` fails `too_large` with
  `size` and its body is not read. An undeclared body that passes the cap
  fails `too_large` without `size`, read no further than the cap.
- `bytesRead` is the size of a page's answer in bytes; a file's is
  `bytes.length`. Code Storage bills outbound transfer and reports no usage
  through its API, so a host that keeps a spend budget adds these up itself.

### `CodeStorage.CodeStorageError` and `CodeStorage.isTransient`

```ts
class CodeStorageError extends Schema.TaggedError<CodeStorageError>()("@smthrs/effect-code-storage/CodeStorageError", {
  operation: "configure" | "createRepo" | "pullUpstream" | "listFiles" | "readFile" | "listCommits",
  code: string,
  status?: number,
  retryAfterMillis?: number,
  size?: number,
  unknownCode?: string
})
const isTransient: (error: CodeStorageError) => boolean
```

- **`code`** comes from one of three places:
  - Code Storage's own code, when its problem body carries one the docs list,
    such as `sync_in_progress`, `repository_not_found` or
    `insufficient_scope`.
  - The status's generic code otherwise, such as `bad_request`, `not_found`,
    `rate_limited` or `service_unavailable`. That includes a code the docs
    don't list, which they say to treat as the status's generic code. On a
    status with no generic code in the docs' table, the server's code stands
    (the docs define it as that status's text in snake_case), or
    `http_<status>` without one.
  - One of the client's own:
    - `transport`: no answer, or a body that broke off;
    - `invalid_response`: a body over 8 MiB, not JSON, or not the documented
      shape;
    - `too_large`;
    - `invalid_key`.
- **`retryAfterMillis`** is the server's `Retry-After` in milliseconds, from
  delta-seconds or an HTTP date. `@smthrs/flow`'s `RetryPolicy` reads this
  field and waits it instead of its own backoff.
- **`unknownCode`** is the undocumented code that `code` replaced, kept for
  diagnosis. Branch on `code`, never on `unknownCode`.
- **`message`** is `Code Storage <operation> failed: <code> (<status>)`, or
  `(<status>, unknown code <unknownCode>)`. It holds no server text: a code
  is used only when it is a snake_case identifier.
- **`isTransient`** is true for `transport`, `request_timeout`,
  `rate_limited`, `sync_in_progress`, `repository_thawing`,
  `authentication_unavailable` and any 5xx.

### `CodeStorage.requests`

```ts
const requests: Metric.Counter<number>
```

`code_storage_requests`: one count per call, by `operation` and `outcome` (`ok`, `interrupted`, or the failure's code).

### `CodeStorage.bytesRead`

```ts
const bytesRead: Metric.Counter<number>
```

`code_storage_bytes_read`: response body bytes received, by `operation`, counted as each chunk arrives. It includes an error's problem body and a body cut at its cap or broken off. A file refused by its declared size counts nothing. It is the proxy for Code Storage's outbound transfer charge.

### `CodeStorage.Operation`

```ts
type Operation = "configure" | "createRepo" | "pullUpstream" | "listFiles" | "readFile" | "listCommits"
```

## `GitRemote`

### `GitRemote.head`

```ts
const head: (remote: string) => Effect.Effect<Head, GitRemoteError, HttpClient.HttpClient>
interface Head {
  readonly sha: string
  readonly branch: string | undefined
}
```

- **What it reads:** the HEAD of the git remote at `remote`, such as
  `https://github.com/octocat/Spoon-Knife.git`. It sends
  `GET <remote>/info/refs?service=git-upload-pack` with no credential.
- **How much it reads:** only the start of the answer, up to the first ref
  line, and never more than 64 KiB.
- **`branch`:** the target of `symref=HEAD:refs/heads/<branch>`, or
  `undefined` when HEAD is detached. Any name git allows reads back exactly,
  `日本語` and emoji included: packets are framed by their byte lengths, and
  each one is decoded only once it is whole.
- **`sha`:** a SHA-1 or a SHA-256 commit id.

### `GitRemote.GitRemoteError`

```ts
class GitRemoteError extends Schema.TaggedError<GitRemoteError>()("@smthrs/effect-code-storage/GitRemoteError", {
  code: "not_found" | "empty" | "unavailable" | "transport" | "invalid_response",
  status?: number
})
```

| `code`             | Meaning                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `not_found`        | The remote answered 401, 403 or 404. That is how GitHub answers for a repository that is missing or private |
| `empty`            | The remote has no HEAD: no commits, or refs but no HEAD                                                     |
| `unavailable`      | Any other failing status, in `status`                                                                       |
| `transport`        | No answer, or the answer broke off                                                                          |
| `invalid_response` | The answer isn't a smart HTTP upload-pack advertisement, or its service or HEAD line isn't UTF-8            |

### `GitRemote.requests`

```ts
const requests: Metric.Counter<number>
```

`git_remote_requests`: one count per `head`, by `outcome` (`ok`, `interrupted`, or the failure's code). Each call is also one span, `GitRemote.head`, with the attribute `git.remote`.
