// A browser tab's repository feature in Node, as React drives it: the `Repo` layer's plain actions, lookups and live
// queries, over the real store and client. RepoApi is reached through `fetch` (RepoApi's real handler in
// repo.test.ts); an unhappy path gives the tab a faulty `RepoClient`, or a faulty shape source, instead
// (test.faults-by-injection). Nothing here intercepts a request.
import { ShapeSource } from "@smthrs/effect-electric"
import { Persistence } from "@smthrs/effect-tanstack-db"
import { Logger as StructuredLogger } from "@smthrs/observability"
import { type Duration, Effect, Layer, Logger, ManagedRuntime, Metric, type Schedule } from "effect"
import { FetchHttpClient } from "effect/http"
import type { AuthStore } from "../features/auth/store"
import { RepoClient } from "../features/repo/api"
import { Clipboard } from "../features/repo/clipboard"
import { Repo } from "../features/repo/repo"
import { RepoStore } from "../features/repo/store"

type StructuredLog = ReturnType<typeof StructuredLogger.formatStructured.log>

export interface DeviceOptions {
  /** RepoApi's origin. */
  readonly origin: string
  /** How the tab reaches RepoApi and Electric: the global `fetch` unless set. */
  readonly fetch?: typeof globalThis.fetch
  /** The client in place of the real one, for an unhappy path. */
  readonly client?: Layer.Layer<RepoClient>
  /** `down`: every shape request fails on the network, as offline. */
  readonly shapes?: "real" | "down"
  /** How long a failed shape request waits: the store's default unless set. */
  readonly retry?: Schedule.Schedule<unknown, ShapeSource.RequestFailed>
  /** How long Electric gets to deliver a clone's row: the store's default unless set. */
  readonly confirmWithin?: Duration.Input
  /** The clipboard's write: kept in `copied` unless set. */
  readonly writeText?: (text: string) => Promise<void>
  /** Sign-in's store, when the app has sign-in. */
  readonly auth?: Layer.Layer<AuthStore>
}

/** A tab: the repository layer over `options`, recording its log lines, metrics and clipboard. */
export const openTab = async (options: DeviceOptions) => {
  const logs: Array<StructuredLog> = []
  const copied: Array<string> = []
  const registry: Metric.MetricRegistry = new Map()
  const fetch = options.fetch ?? globalThis.fetch
  const client = options.client ??
    RepoClient.layer({ origin: options.origin, within: "10 seconds" }).pipe(Layer.provide(FetchHttpClient.layer))
  const shapes = options.shapes === "down"
    ? ShapeSource.layerFaulty((switches) => switches.down())
    : Layer.empty
  const runtime = ManagedRuntime.make(
    Repo.layer.pipe(
      Layer.provideMerge(
        RepoStore.layer({
          origin: options.origin,
          ...(options.confirmWithin === undefined ? {} : { confirmWithin: options.confirmWithin }),
          ...(options.retry === undefined ? {} : { retry: options.retry }),
        }),
      ),
      Layer.provideMerge(options.auth ?? Layer.empty),
      Layer.provideMerge(shapes),
      Layer.provideMerge(Persistence.memory),
      Layer.provideMerge(client),
      Layer.provideMerge(Clipboard.layer(options.writeText ?? (async (text) => void copied.push(text)))),
      Layer.provideMerge(Layer.succeed(FetchHttpClient.Fetch, fetch)),
      Layer.provideMerge(Layer.succeed(Metric.MetricRegistry, registry)),
      Layer.provideMerge(
        Logger.layer([Logger.make((log) => void logs.push(StructuredLogger.formatStructured.log(log)))]),
      ),
    // AuthStore is there only when `auth` gave it; a test reads it only then.
    ) as Layer.Layer<Repo | RepoStore | AuthStore>,
  )
  const repo = await runtime.runPromise(Effect.service(Repo))
  for (const query of Object.values(repo.queries)) query.startSyncImmediate()
  const count = (
    metric: Metric.Metric<number, Metric.CounterState<number>>,
    attributes: Record<string, string> = {},
  ) =>
    runtime.runSync(
      Metric.value(Metric.withAttributes(metric, attributes)).pipe(
        Effect.provideService(Metric.MetricRegistry, registry),
      ),
    ).count
  const histogramCount = (metric: Metric.Metric<number, Metric.HistogramState>, attributes: Record<string, string>) =>
    runtime.runSync(
      Metric.value(Metric.withAttributes(metric, attributes)).pipe(
        Effect.provideService(Metric.MetricRegistry, registry),
      ),
    ).count
  return {
    repo,
    runtime,
    logs,
    copied,
    count,
    histogramCount,
    /** The log lines with `message`. */
    lines: (message: string) => logs.filter((log) => log.message === message),
    /** The view as the header and page read it. */
    view: () => repo.queries.view.toArray[0]!,
    tree: () => repo.queries.tree.toArray[0]!,
    file: () => repo.queries.file.toArray[0]!,
    readme: () => repo.queries.readme.toArray[0]!,
    dispose: () => runtime.dispose(),
  }
}

export type Tab = Awaited<ReturnType<typeof openTab>>
