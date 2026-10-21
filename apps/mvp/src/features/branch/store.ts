import { Collection, LiveQuery } from "@smthrs/effect-tanstack-db"
import { Context, Effect, Layer, type Scope } from "effect"
import { CURRENT, Current } from "./schema"

// The branch this tab's route shows (docs/features/branch-workspace.md#the-page), as one local row: what the page
// renders while `branch/track` runs and once it answers.

/** The branch row this tab shows. */
export const currentQuery = (current: Collection.Collection<Current, string>) =>
  LiveQuery.make((q) => q.from({ current: current.tanstack }).findOne())

/** The branch workspace's state for one tab: the route's branch, and the scope its work runs in. */
export class BranchStore extends Context.Service<
  BranchStore,
  {
    readonly current: Collection.Collection<Current, string>
    readonly currentState: Effect.Success<ReturnType<typeof currentQuery>>
    readonly scope: Scope.Scope
  }
>()("@smthrs/mvp/branch/BranchStore") {
  /** The store; its collection cleaned up when the scope closes. */
  static readonly layer = Layer.effect(
    BranchStore,
    Effect.gen(function* () {
      const current = yield* Collection.local<Current, string>({
        id: "branch-current",
        schema: Current,
        getKey: (row) => row.id,
        initialData: [{
          id: CURRENT,
          owner: "",
          repo: "",
          name: "",
          status: "none",
          branchId: null,
          conversationId: null,
          mode: null,
          access: null,
        }],
      })
      return BranchStore.of({ current, currentState: yield* currentQuery(current), scope: yield* Effect.scope })
    }),
  )
}
