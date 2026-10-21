import { Context, Effect, Layer } from "effect"
import type { FlowDispatch } from "../../flows/dispatch"
import type { AuthStore } from "../auth/store"
import { attach, detach, input, open, resize, show, type Sink } from "./actions"
import { TerminalStore } from "./store"

// The branch terminal as a frontend sees it (docs/features/branch-workspace.md#the-terminal): a live query to read and
// plain functions to act. React renders the panel and hands the frame's output seam to `attach`.

type Store = TerminalStore["Service"]

export interface TerminalQueries {
  /** The panel this tab shows. */
  readonly panel: Store["panelState"]["tanstack"]
  /** The live terminals on the panel's branch: its tabs. */
  readonly tabs: Store["tabsState"]["tanstack"]
}

export interface TerminalActions {
  /**
   * Shows branch `branchId`'s panel, watching terminal `watching` when given; `null` shows none. Resolves with the
   * terminal it shows, if any.
   */
  readonly show: (branchId: string | null, watching?: string) => Promise<string | null>
  /** Open terminal. */
  readonly open: () => void
  /** Attaches the frame's output to terminal `terminalId`; the function it returns detaches it. */
  readonly attach: (terminalId: string, sink: Sink) => () => void
  readonly input: (data: string) => void
  readonly resize: (cols: number, rows: number) => void
}

export class Terminal extends Context.Service<
  Terminal,
  { readonly queries: TerminalQueries; readonly actions: TerminalActions }
>()("@smthrs/mvp/terminal/Terminal") {
  /** Binds the store's query and actions for frontends, with the services this layer was built with. */
  static readonly layer = (config: { readonly origin: string }) =>
    Layer.effect(
      Terminal,
      Effect.gen(function* () {
        const store = yield* TerminalStore
        const context = yield* Effect.context<TerminalStore | AuthStore | FlowDispatch>()
        const run = Effect.runSyncWith(context)
        const runAsync = Effect.runPromiseWith(context)
        return Terminal.of({
          queries: { panel: store.panelState.tanstack, tabs: store.tabsState.tanstack },
          actions: {
            show: (branchId, watching) => runAsync(show(branchId, watching)),
            open: () => void runAsync(open),
            attach: (terminalId, sink) => {
              run(attach(terminalId, sink))
              return () => run(detach)
            },
            input: (data) => run(input(data)),
            resize: (cols, rows) => run(resize(cols, rows)),
          },
        })
      }),
    ).pipe(Layer.provideMerge(TerminalStore.layer(config)))
}

/** The terminal layer's value: what frontends get. */
export type TerminalView = Terminal["Service"]
