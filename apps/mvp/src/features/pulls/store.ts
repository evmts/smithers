import { ElectricCollection } from "@smthrs/effect-electric"
import { Collection } from "@smthrs/effect-tanstack-db"
import { Context, Effect, Layer, Ref, Stream, type Scope } from "effect"
import { IssuesStore } from "../issues/store"
import { CHECKS_SHAPE_ROUTE, PULL_COMMITS_SHAPE_ROUTE, PULLS_SHAPE_ROUTE, REVIEWS_SHAPE_ROUTE } from "./contract"
import {
  checksQuery,
  commentsQuery,
  commitsQuery,
  filesQuery,
  listQuery,
  pullQuery,
  reviewsQuery,
  viewQuery,
} from "./queries"
import { CheckRow, commitKey, FilesRow, PullCommitRow, PullRow, PullsView, ReviewRow, VIEW } from "./schema"

// Pull requests on this tab (decision 0012 §6, docs/features/pulls.md#the-browser): the repository's pull requests,
// their commits, reviews and checks in Postgres, synced by Electric and kept on the device, beside the issues' store's
// `items` and `comments`, which hold a pull request's title, body and conversation; the comparisons this tab read; and
// what the route shows.

/** Where pull requests sync from: ChatApi's origin. */
export interface PullsConfig {
  readonly origin: string
}

type Query<F extends (...args: never) => unknown> = Effect.Success<ReturnType<F>>

/** The pull requests' state for one tab, and the live queries frontends read. */
export class PullsStore extends Context.Service<
  PullsStore,
  {
    readonly pulls: ElectricCollection.ElectricCollection<PullRow>
    readonly commits: ElectricCollection.ElectricCollection<PullCommitRow>
    readonly reviews: ElectricCollection.ElectricCollection<ReviewRow>
    readonly checks: ElectricCollection.ElectricCollection<CheckRow>
    readonly files: Collection.Collection<FilesRow, string>
    readonly view: Collection.Collection<PullsView, string>
    readonly list: Query<typeof listQuery>
    readonly pull: Query<typeof pullQuery>
    readonly comments: Query<typeof commentsQuery>
    readonly reviewList: Query<typeof reviewsQuery>
    readonly commitList: Query<typeof commitsQuery>
    readonly checkList: Query<typeof checksQuery>
    readonly fileList: Query<typeof filesQuery>
    readonly viewState: Query<typeof viewQuery>
    readonly scope: Scope.Scope
  }
>()("@smthrs/mvp/pulls/PullsStore") {
  /** The store; its collections cleaned up and its shapes closed when the scope closes. Needs the issues' store. */
  static readonly layer = (config: PullsConfig) => Layer.effect(PullsStore, make(config))
}

const make = Effect.fnUntraced(function* (config: PullsConfig) {
  const scope = yield* Effect.scope
  const issues = yield* IssuesStore
  const shape = (route: string) => ({
    url: `${config.origin}${route}`,
    columnMapper: ElectricCollection.snakeCamelMapper(),
    parser: { int8: (value: string) => Number(value) },
  })
  const kept = { syncMode: "eager", persist: { schemaVersion: 1 } } as const
  const pulls = yield* ElectricCollection.make<PullRow>({
    id: "pull-rows",
    schema: PullRow,
    getKey: (row) => row.itemId,
    shape: shape(PULLS_SHAPE_ROUTE),
    ...kept,
  })
  const commits = yield* ElectricCollection.make<PullCommitRow>({
    id: "pull-commits",
    schema: PullCommitRow,
    getKey: commitKey,
    shape: shape(PULL_COMMITS_SHAPE_ROUTE),
    ...kept,
  })
  const reviews = yield* ElectricCollection.make<ReviewRow>({
    id: "pull-reviews",
    schema: ReviewRow,
    getKey: (row) => row.id,
    shape: shape(REVIEWS_SHAPE_ROUTE),
    ...kept,
  })
  const checks = yield* ElectricCollection.make<CheckRow>({
    id: "pull-checks",
    schema: CheckRow,
    getKey: (row) => row.id,
    shape: shape(CHECKS_SHAPE_ROUTE),
    ...kept,
  })
  const files = yield* Collection.local<FilesRow, string>({ id: "pull-files", schema: FilesRow, getKey: (row) => row.id })
  const view = yield* Collection.local<PullsView, string>({
    id: "pull-view",
    schema: PullsView,
    getKey: (row) => row.id,
    initialData: [{
      id: VIEW,
      owner: "",
      name: "",
      repoId: "",
      number: null,
      tab: "conversation",
      merging: false,
      mergeWriteId: null,
      mergeRefused: null,
      installed: false,
      pullRefusal: null,
    }],
  })
  const awaitingPulls = yield* Ref.make(false)
  yield* pulls.sync.pipe(
    Stream.runForEach((event) => Effect.gen(function* () {
      if (event._tag === "Stopped" && (event.error.status === 401 || event.error.status === 403)) {
        yield* Effect.ignore(view.update(VIEW, (row) => {
          row.installed = false
          row.pullRefusal = event.error.status === 401 ? "sign_in" : "forbidden"
        }))
      }
      if (event._tag !== "Succeeded") return
      yield* Effect.ignore(view.update(VIEW, (row) => void (row.pullRefusal = null)))
      if (yield* Ref.getAndSet(awaitingPulls, true)) return
      yield* pulls.currentApplied.pipe(
        Effect.flatMap(() => Effect.ignore(view.update(VIEW, (row) => void (row.installed = true)))),
        Effect.ensuring(Ref.set(awaitingPulls, false)),
        Effect.forkIn(scope, { startImmediately: true }),
      )
    })),
    Effect.forkIn(scope, { startImmediately: true }),
  )
  // The first batch can finish while the other pull collections are being built. Its current installed receipt
  // survives a later live Sent event; a current refusal still wins over that receipt.
  yield* pulls.currentApplied.pipe(
    Effect.flatMap(() => Effect.ignore(view.update(VIEW, (row) => {
      if (row.pullRefusal === null) row.installed = true
    }))),
    Effect.forkIn(scope, { startImmediately: true }),
  )
  return PullsStore.of({
    pulls,
    commits,
    reviews,
    checks,
    files,
    view,
    list: yield* listQuery(view, issues.items, pulls),
    pull: yield* pullQuery(view, issues.items, pulls),
    comments: yield* commentsQuery(view, issues.items, issues.comments),
    reviewList: yield* reviewsQuery(view, issues.items, reviews),
    commitList: yield* commitsQuery(view, issues.items, commits),
    checkList: yield* checksQuery(view, issues.items, pulls, checks),
    fileList: yield* filesQuery(files),
    viewState: yield* viewQuery(view, issues.writes),
    scope,
  })
})
