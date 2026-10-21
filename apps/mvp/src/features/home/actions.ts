import { Clock, Effect, FiberHandle, Option, Random } from "effect"
import { FlowDispatch } from "../../flows/dispatch"
import { isReady, put, ready, shownRepository } from "../repo/actions"
import { RepoClient } from "../repo/api"
import { isRepository, repoId } from "../repo/contract"
import { RepoStore } from "../repo/store"
import { TodosStore } from "../todos/store"
import { HomeClient } from "./api"
import { codeHref, HOME_FILE, NEW_BRANCH } from "./contract"
import { recordAction, recordAnswer, recordFile, recordResolve } from "./metrics"
import { fileRowOf, homeRowOf, markdownPaths, type ReadResult } from "./reads"
import { CURRENT, type CuratedRow, type CurrentRow, fileKey, homeKey, type HomeRow } from "./rows"
import { HomeStore } from "./store"
import { homePageOf, liveKindsOf } from "./view"

// What the tab does for a repository's home (decision 0014 §4). Opening a repository asks ChatApi, at once, who the
// person is on it and for Smithers' curated home for it; and once the repository is ready on this device, reads its
// own home at the default branch's head, then the files its Markdown blocks name, each at the same commit. Reading
// runs no flow and changes nothing: a home at a commit never changes, so it is read once and kept. A live block the
// person may see has its rows synced: a `stack` block opens the repository's stack.

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

/**
 * Syncs the rows of the live blocks this person may see on the shown home: a `stack` block in a section their
 * audience may see opens the repository's stack. Run after each part of the home arrives, so the last one sees it all.
 */
const syncLive = (id: string) =>
  Effect.gen(function* () {
    const store = yield* HomeStore
    const todos = yield* Effect.serviceOption(TodosStore)
    if (Option.isNone(todos)) return
    const current = Option.getOrThrow(yield* store.current.get(CURRENT))
    // What the page shows decides what it reads: the same rows, through the same `homePageOf`.
    const declared = Option.getOrUndefined(yield* store.homes.get(current.key ?? ""))
    const curated = Option.getOrUndefined(yield* store.curated.get(id))
    if (!liveKindsOf(homePageOf(current, declared, curated)).has("stack")) return
    yield* todos.value.stackOf(id)
    yield* setCurrent({ stack: id })
  })

/**
 * Asks ChatApi who the person is on the repository and for its curated home: the curated row takes the answer, and the
 * current row the audience. A failed answer keeps the curated row this device had.
 */
const answer = (owner: string, name: string, id: string) =>
  Effect.gen(function* () {
    const store = yield* HomeStore
    const startedAt = yield* Clock.currentTimeMillis
    const result = yield* Effect.result((yield* HomeClient).answer(owner, name))
    const durationMs = (yield* Clock.currentTimeMillis) - startedAt
    if (result._tag === "Failure") {
      yield* setCurrent({ answering: false })
      return yield* recordAnswer("unreadable", undefined, 0, durationMs, result.failure.status)
    }
    const { audience, curated } = result.success
    const row = curatedRowOf(id, curated)
    yield* put<CuratedRow>(store.curated, id, row)
    yield* setCurrent({ audience, answering: false })
    yield* recordAnswer(row.state, audience, row.sections.length, durationMs, undefined)
  }).pipe(Effect.withSpan("home.answer"))

/** The curated row for ChatApi's answer: Smithers' curated home for the repository, or none. */
const curatedRowOf = (
  id: string,
  curated: { readonly defaultBranch: string; readonly sections: CuratedRow["sections"] } | null,
): CuratedRow =>
  curated === null
    ? { key: id, state: "absent", defaultBranch: null, sections: [] }
    : { key: id, state: "declared", defaultBranch: curated.defaultBranch, sections: curated.sections }

/** The repository's own home: once it is ready, its home at the head, then its Markdown blocks' files. */
const declared = (id: string) =>
  Effect.gen(function* () {
    const repository = yield* ready(id)
    const key = homeKey(id, repository.headSha)
    yield* setCurrent({ key, defaultBranch: repository.defaultBranch })
    const home = yield* resolve(repository, key, repository.headSha)
    yield* Effect.forEach(
      markdownPaths(home.sections),
      (path) => ensureFile(repository, key, repository.headSha, path),
      { concurrency: "unbounded", discard: true },
    )
  })

/**
 * Reads `owner/name`'s homes into this tab without showing them: Smithers' curated one, which ChatApi answers, and,
 * once the repository is ready on this device, its own home and its Markdown blocks' files. Ends once they are read,
 * once the device can tell the repository isn't ready (the page then shows the tree's own state), or after the
 * repository store's `pageWait`, whichever is first. A link's hover or focus runs it (the router's intent preload),
 * and so does every navigation before `open`, which then shows the home at once instead of a skeleton. Who the person
 * is on the repository waits for `open`: it belongs to the shown page.
 */
export const warm = (owner: string, name: string) =>
  Effect.gen(function* () {
    if (!isRepository(owner, name)) return
    const id = repoId(owner, name)
    const curated = Effect.gen(function* () {
      const store = yield* HomeStore
      if (Option.isSome(yield* store.curated.get(id))) return
      const result = yield* Effect.result((yield* HomeClient).answer(owner, name))
      if (result._tag === "Success") yield* put<CuratedRow>(store.curated, id, curatedRowOf(id, result.success.curated))
    })
    const own = Effect.gen(function* () {
      const repository = yield* shownRepository(id)
      if (Option.isNone(repository)) return
      const { headSha } = repository.value
      const key = homeKey(id, headSha)
      const home = yield* resolve(repository.value, key, headSha)
      yield* Effect.forEach(markdownPaths(home.sections), (path) => ensureFile(repository.value, key, headSha, path), {
        concurrency: "unbounded",
        discard: true,
      })
    })
    yield* Effect.all([curated, own], { concurrency: "unbounded", discard: true })
  }).pipe(
    (warming) => Effect.flatMap(RepoStore, (repo) => Effect.timeoutOption(warming, repo.pageWait)),
    Effect.asVoid,
    Effect.withSpan("home.warm"),
    Effect.annotateLogs({ feature: "home" }),
  )

/**
 * Opens `owner/name`'s home for the routed page: the current row names it at once, with its home's key when the
 * repository is ready on this device, so a home `warm` read shows at once; and the tab reads what it needs in its
 * scope: who the person is and the curated home at once, the repository's own home once it is ready. Opening another
 * repository interrupts a load still waiting.
 */
export const open = (owner: string, name: string) =>
  Effect.gen(function* () {
    const store = yield* HomeStore
    if (!isRepository(owner, name)) {
      yield* setCurrent({
        owner,
        name,
        repoId: null,
        key: null,
        defaultBranch: null,
        audience: null,
        answering: false,
        stack: null,
        failure: null,
      })
      return yield* FiberHandle.clear(store.loader)
    }
    const id = repoId(owner, name)
    // Another page of the same repository keeps the home it shows while its head is read again.
    const shown = Option.getOrThrow(yield* store.current.get(CURRENT))
    const same = shown.repoId === id
    const row = yield* (yield* RepoStore).repositories.get(id)
    const head = isReady(row)
      ? { key: homeKey(id, row.value.headSha), defaultBranch: row.value.defaultBranch }
      : { key: null, defaultBranch: null }
    yield* setCurrent({
      owner,
      name,
      repoId: id,
      answering: true,
      ...(same ? {} : { ...head, audience: null, stack: null, failure: null }),
    })
    const part = <R>(load: Effect.Effect<void, never, R>) => Effect.andThen(load, syncLive(id))
    yield* FiberHandle.run(
      store.loader,
      Effect.all([part(answer(owner, name, id)), part(declared(id))], { concurrency: "unbounded", discard: true }),
      { startImmediately: true },
    )
  }).pipe(Effect.annotateLogs({ feature: "home" }))

/** A new branch's name: the person's login, else `smithers`, and six random letters and digits. */
const branchName = (login: string | null) =>
  Effect.map(
    Random.nextIntBetween(0, 36 ** 6, { halfOpen: true }),
    (n) => `${login ?? "smithers"}/${n.toString(36).padStart(6, "0")}`,
  )

/**
 * Runs an `action` block's flow on the routed repository: `branch.new` makes a new branch at the default branch's head
 * through `branch/create`, the flow `/branch.new` and the agent run, and answers the page to open, its workspace. The
 * action shows running until the flow settles; a failure says why on the current row, and answers nothing. A flow the
 * home doesn't run as an action answers nothing.
 */
export const runAction = (flow: string, login: string | null) =>
  Effect.gen(function* () {
    if (flow !== NEW_BRANCH) return undefined
    const store = yield* HomeStore
    const current = Option.getOrThrow(yield* store.current.get(CURRENT))
    if (current.repoId === null || current.running.includes(flow)) return undefined
    const { owner, name } = current
    yield* setCurrent({ running: [...current.running, flow], failure: null })
    const startedAt = yield* Clock.currentTimeMillis
    const branch = yield* branchName(login)
    const dispatched = yield* Effect.result(
      (yield* FlowDispatch).dispatch("branch/create", { repo: `${owner}/${name}`, branch }, { door: "button" }),
    )
    const done = dispatched._tag === "Success" && dispatched.success._tag === "Done" ? dispatched.success.value : undefined
    const error = dispatched._tag === "Success" && dispatched.success._tag === "Failed" ? dispatched.success.error : undefined
    const reason = done !== undefined
      ? null
      : error?._tag === "@smthrs/mvp/branch/BranchTrackRefused"
      ? error.reason
      : "unavailable"
    const now = Option.getOrThrow(yield* store.current.get(CURRENT))
    yield* setCurrent({ running: now.running.filter((each) => each !== flow), failure: reason })
    yield* recordAction(flow, reason ?? "done", (yield* Clock.currentTimeMillis) - startedAt)
    return done === undefined ? undefined : codeHref(owner, name, done.name)
  }).pipe(Effect.withSpan("home.action"), Effect.annotateLogs({ feature: "home" }))
