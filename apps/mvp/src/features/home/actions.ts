import { Clock, Effect, FiberHandle, Option } from "effect"
import { put, ready } from "../repo/actions"
import { RepoClient } from "../repo/api"
import { isRepository, repoId } from "../repo/contract"
import { HOME_FILE } from "./contract"
import { recordFile, recordResolve } from "./metrics"
import { fileRowOf, homeRowOf, markdownPaths, type ReadResult } from "./reads"
import { CURRENT, type CurrentRow, fileKey, homeKey, type HomeRow } from "./rows"
import { HomeStore } from "./store"

// What the tab does for a repository's home (decision 0014 §4). Opening a repository reads its home at the default
// branch's head once the repository is ready on this device, then the files its Markdown blocks name, each at the same
// commit. Reading runs no flow and changes nothing: a home at a commit never changes, so it is read once and kept.

/** Changes the current row. */
const setCurrent = (fields: Partial<Omit<CurrentRow, "id">>) =>
  Effect.flatMap(HomeStore, ({ current }) => Effect.orDie(current.update(CURRENT, (row) => void Object.assign(row, fields))))

/** RepoApi's status on a refused read, when it answered one. */
const statusOf = (result: ReadResult) => (result._tag === "Failure" ? result.failure.status : undefined)

/** The repository's home at `sha`: the one this device has, or `.smithers/home.json` read now. */
const resolve = (repository: { readonly owner: string; readonly name: string }, key: string, sha: string) =>
  Effect.gen(function* () {
    const store = yield* HomeStore
    const startedAt = yield* Clock.currentTimeMillis
    const kept = yield* store.homes.get(key)
    if (Option.isSome(kept) && kept.value.state !== "unreadable") {
      yield* recordResolve(kept.value, "cached", 0, undefined)
      return kept.value
    }
    const result = yield* Effect.result((yield* RepoClient).blob(repository.owner, repository.name, sha, HOME_FILE))
    const row = homeRowOf(key, result)
    yield* put<HomeRow>(store.homes, key, row)
    yield* recordResolve(row, row.state, (yield* Clock.currentTimeMillis) - startedAt, statusOf(result))
    return row
  }).pipe(Effect.withSpan("home.resolve"))

/** Reads a Markdown block's file at the home's commit, unless this tab has it or is reading it. */
const ensureFile = (repository: { readonly owner: string; readonly name: string }, home: string, sha: string, path: string) =>
  Effect.gen(function* () {
    const store = yield* HomeStore
    const key = fileKey(home, path)
    const found = yield* store.files.get(key)
    if (Option.isSome(found) && found.value.state !== "failed") return
    yield* put(store.files, key, { key, home, path, state: "loading" as const, text: null })
    const startedAt = yield* Clock.currentTimeMillis
    const result = yield* Effect.result((yield* RepoClient).blob(repository.owner, repository.name, sha, path))
    const row = fileRowOf(key, home, path, result)
    yield* put(store.files, key, row)
    yield* recordFile(row.state, (yield* Clock.currentTimeMillis) - startedAt, statusOf(result))
  })

/** The page's load: once the repository is ready, its home at the head, then its Markdown blocks' files. */
const load = (id: string) =>
  Effect.gen(function* () {
    const repository = yield* ready(id)
    const key = homeKey(id, repository.headSha)
    yield* setCurrent({ key, defaultBranch: repository.defaultBranch })
    const home = yield* resolve(repository, key, repository.headSha)
    yield* Effect.forEach(
      markdownPaths(home.blocks),
      (path) => ensureFile(repository, key, repository.headSha, path),
      { concurrency: "unbounded", discard: true },
    )
  })

/**
 * Opens `owner/name`'s home for the routed page: the current row names it at once, and the tab reads what it needs in
 * its scope once the repository is ready. Opening another repository interrupts a load still waiting.
 */
export const open = (owner: string, name: string) =>
  Effect.gen(function* () {
    const store = yield* HomeStore
    if (!isRepository(owner, name)) {
      yield* setCurrent({ owner, name, key: null, defaultBranch: null })
      return yield* FiberHandle.clear(store.loader)
    }
    const id = repoId(owner, name)
    // Another page of the same repository keeps the home it shows while its head is read again.
    const shown = Option.getOrThrow(yield* store.current.get(CURRENT))
    const same = shown.key !== null && shown.key.startsWith(`${id}@`)
    yield* setCurrent({ owner, name, ...(same ? {} : { key: null, defaultBranch: null }) })
    yield* FiberHandle.run(store.loader, load(id), { startImmediately: true })
  }).pipe(Effect.annotateLogs({ feature: "home" }))
