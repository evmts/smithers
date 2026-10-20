import { Context, Effect, Layer } from "effect"
import { ChatStore } from "../chat/store"
import { FlowDispatch } from "../../flows/dispatch"
import { leave, open } from "./actions"
import { BranchStore } from "./store"

// The branch workspace as a frontend sees it (docs/features/branch-workspace.md#the-page): a live query to read and
// plain functions to act, with no Effect in sight.

type Store = BranchStore["Service"]

export interface BranchQueries {
  /** The branch this tab's route shows. */
  readonly current: Store["currentState"]["tanstack"]
}

export interface BranchActions {
  /** Opens branch `ref` of `owner/repo`: resolves once the page can show it, with its id, or why not. */
  readonly open: (owner: string, repo: string, ref: string) => Promise<string | undefined>
  /** Leaves the branch for the home conversation. */
  readonly leave: () => Promise<void>
}

export class Branch extends Context.Service<Branch, { readonly queries: BranchQueries; readonly actions: BranchActions }>()(
  "@smthrs/mvp/branch/Branch",
) {
  /** Binds the store's query and actions for frontends, with the services this layer was built with. */
  static readonly layer = Layer.effect(
    Branch,
    Effect.gen(function* () {
      const store = yield* BranchStore
      const run = Effect.runPromiseWith(yield* Effect.context<BranchStore | ChatStore | FlowDispatch>())
      return Branch.of({
        queries: { current: store.currentState.tanstack },
        actions: {
          open: (owner, repo, ref) => run(open(owner, repo, ref)),
          leave: () => run(leave),
        },
      })
    }),
  ).pipe(Layer.provideMerge(BranchStore.layer))
}

/** The branch layer's value: what frontends get. */
export type BranchView = Branch["Service"]
