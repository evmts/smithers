import { ElectricCollection } from "@smthrs/effect-electric"
import { Collection, LiveQuery } from "@smthrs/effect-tanstack-db"
import type { TerminalSocket } from "@smthrs/platform-browser"
import { Context, Effect, FiberHandle, Layer, Ref, Scope, Semaphore } from "effect"
import { TERMINALS_SHAPE_ROUTE } from "./contract"
import { PANEL, Panel, TerminalRow } from "./schema"

// The branch terminal on this tab (decision 0013 §3, docs/features/branch-workspace.md#the-terminal): each branch's
// terminals, synced from Postgres by Electric while the branch's page shows; the panel the page renders; and the one
// socket this tab holds to the terminal it shows. The socket's bytes go straight to the frame, never into a collection.

/** Where the terminals sync from: ChatApi's origin, the site's own. */
export interface TerminalConfig {
  readonly origin: string
}

/** The panel this tab shows. */
export const panelQuery = (panel: Collection.Collection<Panel, string>) =>
  LiveQuery.make((q) => q.from({ panel: panel.tanstack }).findOne())

/** The terminals' state for one tab. */
export class TerminalStore extends Context.Service<
  TerminalStore,
  {
    readonly origin: string
    readonly panel: Collection.Collection<Panel, string>
    readonly panelState: Effect.Success<ReturnType<typeof panelQuery>>
    /** A branch's terminals, synced while this tab has opened them, for as long as the store lives. */
    readonly terminals: (branchId: string) => Effect.Effect<ElectricCollection.ElectricCollection<TerminalRow>>
    /** The socket this tab holds, while it holds one: only the latest attach keeps it. */
    readonly attached: FiberHandle.FiberHandle<void, never>
    readonly connection: Ref.Ref<TerminalSocket.Connection | undefined>
    /** When the shown terminal was asked for, until its first byte: `terminal_open_ms`. */
    readonly openedAt: Ref.Ref<number | undefined>
    readonly scope: Scope.Scope
  }
>()("@smthrs/mvp/terminal/TerminalStore") {
  /** The store; its collections cleaned up, its shapes closed and its socket closed when the scope closes. */
  static readonly layer = (config: TerminalConfig) =>
    Layer.effect(
      TerminalStore,
      Effect.gen(function* () {
        const scope = yield* Effect.scope
        const panel = yield* Collection.local<Panel, string>({
          id: "terminal-panel",
          schema: Panel,
          getKey: (row) => row.id,
          initialData: [{ id: PANEL, branchId: null, terminalId: null, phase: "idle", access: null }],
        })
        const opened = new Map<string, ElectricCollection.ElectricCollection<TerminalRow>>()
        const opening = yield* Semaphore.make(1)
        const open = (branchId: string) =>
          ElectricCollection.make<TerminalRow>({
            id: `terminals:${branchId}`,
            schema: TerminalRow,
            getKey: (row) => row.id,
            syncMode: "eager",
            shape: {
              url: `${config.origin}${TERMINALS_SHAPE_ROUTE}?branch=${encodeURIComponent(branchId)}`,
              columnMapper: ElectricCollection.snakeCamelMapper(),
              parser: { int8: (value: string) => Number(value) },
            },
          }).pipe(
            Scope.provide(scope),
            Effect.tap((collection) => Effect.sync(() => opened.set(branchId, collection))),
          )
        const terminals = (branchId: string) =>
          Effect.suspend(() => {
            const known = opened.get(branchId)
            if (known !== undefined) return Effect.succeed(known)
            return Semaphore.withPermits(opening, 1)(
              Effect.suspend(() => {
                const raced = opened.get(branchId)
                return raced !== undefined ? Effect.succeed(raced) : open(branchId)
              }),
            )
          })
        return TerminalStore.of({
          origin: config.origin,
          panel,
          panelState: yield* panelQuery(panel),
          terminals,
          attached: yield* FiberHandle.make<void, never>(),
          connection: yield* Ref.make<TerminalSocket.Connection | undefined>(undefined),
          openedAt: yield* Ref.make<number | undefined>(undefined),
          scope,
        })
      }),
    )
}
