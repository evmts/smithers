import type { Collection } from "@smthrs/effect-tanstack-db"
import { Clock, Effect, FiberHandle, Metric, Option, Stream } from "effect"
import { RepoClient, type RepoRefused } from "./api"
import { Clipboard } from "./clipboard"
import { BUSY, COULDNT_LOAD, isRepository, NOT_FOUND, READING_PAUSED, repoId, textOf } from "./contract"
import { blobLoadMs, cloneClicks, clones, opens, permalinkCopies, treeLoadMs } from "./metrics"
import { blobKey, hrefFor, readmeOf, resolveRef, type Target, treeKey } from "./paths"
import type { BlobRow, CloneRow, TreeRow, ViewRow } from "./rows"
import { VIEW } from "./rows"
import type { Repository } from "./schema"
import { RepoStore } from "./store"

// What a person does in the repository view, and what the tab does for them. Each action returns once the tab's rows
// say so; a request it starts runs in the store's scope and settles the rows when RepoApi answers.
//
// A clone is a plain request, not a write through chat's outbox (decision 0002 §3): it needs the network and sign-in
// anyway, and RepoApi takes it idempotently, so a request that didn't get through is safe to send again with Try
// again. The outbox would add a stored write and a lock for nothing a refresh can't redo.

/** Inserts `row`, or replaces the row with its key. */
const put = <A extends object>(collection: Collection.Collection<A, string>, key: string, row: A) =>
  Effect.gen(function* () {
    if (Option.isNone(yield* collection.get(key))) yield* collection.insert(row)
    else yield* collection.update(key, (draft) => void Object.assign(draft, row))
  }).pipe(Effect.orDie)

/** Changes the view row. */
const changeView = (fields: Partial<Omit<ViewRow, "id">>) =>
  Effect.flatMap(RepoStore, ({ view }) => Effect.orDie(view.update(VIEW, (row) => void Object.assign(row, fields))))

/** Starts the repositories' shape, if nothing read it yet; a device that can't reach Electric keeps what it has. */
const startSync = Effect.flatMap(
  RepoStore,
  (store) => Effect.forkIn(Effect.ignore(store.repositories.preload), store.scope, { startImmediately: true }),
)

// --- Cloning ---

/** What became of a request RepoApi didn't take, and how the header shows it. */
const refusalOf = (refused: RepoRefused): { readonly outcome: string; readonly status: CloneRow["status"] } =>
  refused.status === 401
    ? { outcome: "sign_in", status: "sign_in" }
    : refused.status === 429
    ? { outcome: "limit", status: "limit" }
    : { outcome: refused.status === undefined ? "unreachable" : "refused", status: "failed" }

/** Sends the clone request, then waits for Electric to deliver what RepoApi did. */
const send = (row: CloneRow) =>
  Effect.gen(function* () {
    const store = yield* RepoStore
    const client = yield* RepoClient
    const answer = yield* Effect.result(client.clone(row.owner, row.name))
    if (answer._tag === "Failure") {
      const { outcome, status } = refusalOf(answer.failure)
      yield* put<CloneRow>(store.clones, row.id, { ...row, status })
      yield* Metric.update(Metric.withAttributes(clones, { outcome }), 1)
      return yield* Effect.logWarning("repo.clone").pipe(
        Effect.annotateLogs(
          answer.failure.status === undefined ? { outcome } : { outcome, status: answer.failure.status },
        ),
      )
    }
    const accepted = answer.success
    yield* startSync
    const delivered = accepted.txid !== null
      ? store.repositories.awaitTxId(accepted.txid, store.confirmWithin)
      : Effect.flatMap(store.repositories.get(accepted.id), (found) =>
        Option.isSome(found)
          ? Effect.void
          : store.repositories.awaitMatch((change) => change.value.id === accepted.id, store.confirmWithin))
    if ((yield* Effect.result(delivered))._tag === "Failure") {
      yield* put<CloneRow>(store.clones, row.id, { ...row, status: "failed" })
      yield* Metric.update(Metric.withAttributes(clones, { outcome: "unconfirmed" }), 1)
      return yield* Effect.logWarning("repo.clone").pipe(Effect.annotateLogs({ outcome: "unconfirmed" }))
    }
    yield* Effect.orDie(store.clones.delete(row.id))
    yield* Metric.update(Metric.withAttributes(clones, { outcome: "accepted" }), 1)
    yield* Effect.logInfo("repo.clone").pipe(Effect.annotateLogs({ outcome: "accepted" }))
  }).pipe(Effect.annotateLogs({ feature: "repo" }))

/**
 * Clone pressed (`kind` `clone`), or Try again (`retry`): shows `cloning` at once and asks RepoApi, once at a time per
 * repository. RepoApi starts a new attempt for a failed or refused clone and nothing for one running or done. Answers
 * whether it asked: `false` for a name that isn't a GitHub repository.
 */
export const clone = (owner: string, name: string, kind: "clone" | "retry" = "clone") =>
  Effect.gen(function* () {
    if (!isRepository(owner, name)) return false
    const store = yield* RepoStore
    const id = repoId(owner, name)
    yield* Metric.update(Metric.withAttributes(cloneClicks, { kind }), 1)
    const pending = yield* store.clones.get(id)
    if (Option.isSome(pending) && pending.value.status === "requesting") return true
    const row: CloneRow = { id, owner, name, status: "requesting" }
    yield* put<CloneRow>(store.clones, id, row)
    yield* Effect.forkIn(send(row), store.scope, { startImmediately: true })
    return true
  })

/** Try again on a failed or refused clone. */
export const retryClone = (owner: string, name: string) => clone(owner, name, "retry")

// --- Reading ---

/** What a failed read shows: gone, the read budget spent, Code Storage busy, or couldn't load. */
const readFailure = (refused: RepoRefused): string =>
  refused.status === 404
    ? NOT_FOUND
    : refused.status === 503 && refused.code === "capacity"
    ? READING_PAUSED
    : refused.status === 503
    ? BUSY
    : COULDNT_LOAD

/** Loads `owner/name`'s file list at `sha` unless this tab has it or is loading it; a failed one loads again. */
const ensureTree = (repository: Repository, sha: string) =>
  Effect.gen(function* () {
    const store = yield* RepoStore
    const key = treeKey(repository.id, sha)
    const found = yield* store.trees.get(key)
    if (Option.isSome(found) && found.value.state !== "failed") return
    yield* put<TreeRow>(store.trees, key, { key, state: "loading", paths: [], truncated: false, message: null })
    const load = Effect.gen(function* () {
      const startedAt = yield* Clock.currentTimeMillis
      const result = yield* Effect.result(
        (yield* RepoClient).tree(repository.owner, repository.name, sha),
      )
      const row: TreeRow = result._tag === "Success"
        ? { key, state: "ready", paths: result.success.paths, truncated: result.success.truncated, message: null }
        : { key, state: "failed", paths: [], truncated: false, message: readFailure(result.failure) }
      yield* put(store.trees, key, row)
      yield* observeLoad("repo.tree.load", treeLoadMs, row.state, startedAt, result)
    })
    yield* Effect.forkIn(load, store.scope, { startImmediately: true })
  })

/** Loads a file at `sha` unless this tab has it or is loading it; a failed one loads again. */
const ensureBlob = (repository: Repository, sha: string, path: string) =>
  Effect.gen(function* () {
    const store = yield* RepoStore
    const key = blobKey(repository.id, sha, path)
    const found = yield* store.blobs.get(key)
    if (Option.isSome(found) && found.value.state !== "failed") return
    yield* put<BlobRow>(store.blobs, key, { key, state: "loading", contents: null, size: null, message: null })
    const load = Effect.gen(function* () {
      const startedAt = yield* Clock.currentTimeMillis
      const result = yield* Effect.result(
        (yield* RepoClient).blob(repository.owner, repository.name, sha, path),
      )
      const row = blobRow(key, result)
      yield* put(store.blobs, key, row)
      yield* observeLoad("repo.blob.load", blobLoadMs, row.state, startedAt, result)
    })
    yield* Effect.forkIn(load, store.scope, { startImmediately: true })
  })

/** A loaded file's row: its text, binary or too large with its size, or why it failed. */
const blobRow = (
  key: string,
  result: { readonly _tag: "Success"; readonly success: { readonly bytes: Uint8Array } } | {
    readonly _tag: "Failure"
    readonly failure: RepoRefused
  },
): BlobRow => {
  if (result._tag === "Failure") {
    const { status, size } = result.failure
    return status === 413 && size !== undefined
      ? { key, state: "too-large", contents: null, size, message: null }
      : { key, state: "failed", contents: null, size: null, message: readFailure(result.failure) }
  }
  const bytes = result.success.bytes
  const contents = textOf(bytes)
  return contents === undefined
    ? { key, state: "binary", contents: null, size: bytes.byteLength, message: null }
    : { key, state: "text", contents, size: bytes.byteLength, message: null }
}

/** One load's records: its duration by outcome, and a log line with the outcome and RepoApi's status. */
const observeLoad = (
  message: string,
  histogram: typeof treeLoadMs,
  outcome: string,
  startedAt: number,
  result: { readonly _tag: "Success" } | { readonly _tag: "Failure"; readonly failure: RepoRefused },
) =>
  Effect.gen(function* () {
    const durationMs = (yield* Clock.currentTimeMillis) - startedAt
    yield* Metric.update(Metric.withAttributes(histogram, { outcome }), durationMs)
    const status = result._tag === "Failure" ? result.failure.status : undefined
    yield* Effect.logWithLevel(outcome === "failed" ? "Warn" : "Info")(message).pipe(
      Effect.annotateLogs({ outcome, durationMs, ...(status === undefined ? {} : { status }), feature: "repo" }),
    )
  })

/** Waits until the repository is ready on this device: Electric delivers it, or the device already has it. */
const ready = (id: string) =>
  Effect.gen(function* () {
    const store = yield* RepoStore
    yield* startSync
    const isReady = (row: Option.Option<Repository>): row is Option.Some<Repository> =>
      Option.isSome(row) && row.value.status === "ready"
    const now = yield* store.repositories.get(id)
    if (isReady(now)) return now.value
    // With the rows the device has as the first batch, so a row that arrived since the read above isn't missed.
    const next = yield* store.repositories.changes({ initial: true }).pipe(
      Stream.mapEffect(() => store.repositories.get(id)),
      Stream.filter(isReady),
      Stream.runHead,
    )
    // The changes stream never ends, so a head is always found.
    return Option.getOrThrow(next).value
  })

/** Waits until the file list at `key` has loaded or failed. */
const settled = (key: string) =>
  Effect.gen(function* () {
    const store = yield* RepoStore
    const isSettled = (row: Option.Option<TreeRow>): row is Option.Some<TreeRow> =>
      Option.isSome(row) && row.value.state !== "loading"
    const now = yield* store.trees.get(key)
    if (isSettled(now)) return now.value
    const next = yield* store.trees.changes({ initial: true }).pipe(
      Stream.mapEffect(() => store.trees.get(key)),
      Stream.filter(isSettled),
      Stream.runHead,
    )
    return Option.getOrThrow(next).value
  })

/**
 * The routed view's load: once the repository is ready, resolves the URL's ref, then loads the file list and the file,
 * or for a directory its README.
 */
const load = (target: Target, id: string) =>
  Effect.gen(function* () {
    const repository = yield* ready(id)
    const resolved = resolveRef(repository, target.ref, target.path)
    if (resolved === undefined) return yield* changeView({ missing: true })
    const { revision, sha, path } = resolved
    const fileKey = target.kind === "blob" ? blobKey(id, sha, path) : null
    yield* changeView({ revision, sha, path, treeKey: treeKey(id, sha), fileKey })
    yield* ensureTree(repository, sha)
    if (target.kind === "blob") return yield* ensureBlob(repository, sha, path)
    const tree = yield* settled(treeKey(id, sha))
    const readme = tree.state === "ready" ? readmeOf(tree.paths, path) : undefined
    if (readme === undefined) return
    yield* changeView({ readmeKey: blobKey(id, sha, readme), readmePath: readme })
    yield* ensureBlob(repository, sha, readme)
  })

/**
 * Opens `target` in the routed view: the view row says where at once, and the tab loads what it needs in its scope,
 * once the repository is ready. Opening another location interrupts a load still waiting; a request already sent
 * finishes and keeps what it read.
 */
export const open = (target: Target) =>
  Effect.gen(function* () {
    const store = yield* RepoStore
    const valid = isRepository(target.owner, target.name)
    const id = valid ? repoId(target.owner, target.name) : null
    yield* changeView({
      owner: target.owner,
      name: target.name,
      repoId: id,
      kind: target.kind,
      ref: target.ref,
      splat: target.path,
      line: target.line,
      lineEnd: target.lineEnd,
      missing: !valid,
      revision: null,
      sha: null,
      path: target.path,
      treeKey: null,
      fileKey: null,
      readmeKey: null,
      readmePath: null,
    })
    yield* Metric.update(Metric.withAttributes(opens, { kind: target.kind }), 1)
    yield* Effect.logInfo("repo.open").pipe(Effect.annotateLogs({ kind: target.kind }))
    if (id === null) return yield* FiberHandle.clear(store.loader)
    yield* FiberHandle.run(store.loader, load(target, id), { startImmediately: true })
  }).pipe(
    Effect.withSpan("repo.open", { attributes: { "smithers.repo.kind": target.kind } }),
    Effect.annotateLogs({ feature: "repo" }),
  )

/**
 * Copy permalink: the view's location at its commit, on the clipboard. Nothing until the view has resolved a commit.
 * Counted and logged by outcome.
 */
export const copyPermalink = Effect.gen(function* () {
  const store = yield* RepoStore
  const view = Option.getOrThrow(yield* store.view.get(VIEW))
  if (view.sha === null) return
  const location = {
    kind: view.kind,
    path: view.path,
    ...(view.line === null ? {} : { line: view.line }),
    ...(view.lineEnd === null ? {} : { lineEnd: view.lineEnd }),
  }
  const href = hrefFor({ owner: view.owner, name: view.name, defaultBranch: null }, view.sha, location)
  const written = yield* Effect.result((yield* Clipboard).write(`${store.origin}${href}`))
  const outcome = written._tag === "Success" ? "copied" : "failed"
  yield* Metric.update(Metric.withAttributes(permalinkCopies, { outcome }), 1)
  yield* Effect.logWithLevel(outcome === "copied" ? "Info" : "Warn")("repo.permalink").pipe(
    Effect.annotateLogs({ outcome, feature: "repo" }),
  )
})
