import { Collection, LiveQuery } from "@smthrs/effect-tanstack-db"
import { Context, Effect, FiberHandle, Layer, Ref, type Scope } from "effect"
import { BranchConversationsStore } from "../../device/registry"
import { CURRENT, Current, type ConversationRoute } from "./schema"

// The branch this tab's route shows (docs/features/branch-workspace.md#the-page), as one local row: what the page
// renders while `branch/track` runs and once it answers.

/** The branch row this tab shows. */
export const currentQuery = (current: Collection.Collection<Current, string>) =>
  LiveQuery.make((q) => q.from({ current: current.tanstack }).findOne())

/** Opens this tab's route again in place, so its loader opens the branch once more: the router's `invalidate`. */
export class BranchRoute extends Context.Service<BranchRoute, { readonly reopen: Effect.Effect<void> }>()(
  "@smthrs/mvp/branch/BranchRoute",
) {
  static readonly layer = (reopen: () => void) => Layer.succeed(BranchRoute, BranchRoute.of({ reopen: Effect.sync(reopen) }))
}

/**
 * The branch workspace's state for one tab: the route's branch, what follows whether its owner shares it, and the scope
 * its work runs in.
 */
export class BranchStore extends Context.Service<
  BranchStore,
  {
    readonly generation: Ref.Ref<number>
    readonly conversations: Collection.Collection<ConversationRoute, string>
    readonly current: Collection.Collection<Current, string>
    readonly currentState: Effect.Success<ReturnType<typeof currentQuery>>
    /** Follows the shown branch's permission list for its owner: only the latest branch's. */
    readonly follower: FiberHandle.FiberHandle<void, never>
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
      return BranchStore.of({
        generation: yield* Ref.make(0),
        conversations: yield* Collection.persisted(BranchConversationsStore),
        current,
        currentState: yield* currentQuery(current),
        follower: yield* FiberHandle.make<void, never>(),
        scope: yield* Effect.scope,
      })
    }),
  )
}
