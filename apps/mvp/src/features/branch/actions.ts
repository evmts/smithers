import { Effect, Fiber, FiberHandle, Metric, Option, Stream, SubscriptionRef } from "effect"
import { FlowDispatch } from "../../flows/dispatch"
import { share, show } from "../chat/actions"
import { ChatStore } from "../chat/store"
import { isRepository } from "../repo/contract"
import { SharingStore } from "../sharing/store"
import { isBranchName } from "./contract"
import { opens, reopens } from "./metrics"
import { CURRENT, type Current } from "./schema"
import { BranchRoute, BranchStore } from "./store"

// What opening a branch's page does (docs/features/branch-workspace.md#the-page): it runs `branch/track` and, once it
// answers, shows the branch's conversation in this tab (decision 0013 §1), so the composer asks there, in the branch's
// prompt when its owner shared it (docs/features/coedit.md#the-prompt). Leaving for `/app` shows the home conversation
// again. Offline, the page doesn't wait for an answer that can't come: it shows what the device has, and the route opens
// the branch again once the browser is back online.

const setCurrent = (fields: Omit<Current, "id">) =>
  Effect.flatMap(BranchStore, ({ current }) =>
    Effect.orDie(current.update(CURRENT, (row) => void Object.assign(row, fields))))

const currentNow = Effect.flatMap(BranchStore, ({ current }) => Effect.map(current.get(CURRENT), Option.getOrThrow))

/**
 * Follows the permission list of the owner's branch `branchId`, shown in this tab, once it has synced: their first share
 * makes its prompt one everyone on it types together, and removing the last makes the draft theirs alone again. Only its
 * owner can read the list, and nobody else can change whether it is shared while they may open it. Opening another
 * branch, or leaving, stops it.
 */
const followShares = (branchId: string) =>
  Effect.gen(function* () {
    const shares = yield* (yield* SharingStore).shares(branchId)
    yield* Effect.ignore(shares.preload)
    yield* shares.changes({ initial: true }).pipe(
      Stream.runForEach(() => Effect.flatMap(shares.toArray, (rows) => share(rows.length > 0))),
    )
  })

/** Why a branch couldn't be shown, from `branch/track`'s failure. */
const statusOf = (reason: string | undefined): Current["status"] =>
  reason === "not_found" || reason === "invalid"
    ? "missing"
    : reason === "sign_in"
    ? "sign_in"
    : reason === "forbidden"
    ? "forbidden"
    : "failed"

/** Completes once the browser says it is offline (`false`) or online (`true`): at once when it already does. */
const browserIs = (online: boolean) =>
  Effect.flatMap(ChatStore, ({ browserOnline }) =>
    SubscriptionRef.changes(browserOnline).pipe(Stream.filter((now) => now === online), Stream.runHead, Effect.asVoid))

/**
 * Opens branch `ref` of `owner/repo` in this tab: `tracking` at once, then `ready` with its conversation shown, or why
 * not. A name that can't be a branch, such as a commit, shows nothing of the workspace. Counted by outcome. Answers
 * the branch's id once it is ready. The browser offline before `branch/track` answers, it answers none at once and
 * shows `offline`; once the browser is back online, the route opens again (`BranchRoute`), unless `signal`, the
 * navigation's, was aborted: a newer navigation took over, or the page closed.
 */
export const open = (owner: string, repo: string, ref: string, signal?: AbortSignal) =>
  Effect.gen(function* () {
    const empty = { branchId: null, conversationId: null, mode: null, access: null }
    yield* FiberHandle.clear((yield* BranchStore).follower)
    if (!isRepository(owner, repo) || !isBranchName(ref)) {
      yield* setCurrent({ owner, repo, name: ref, status: "missing", ...empty })
      return undefined
    }
    yield* setCurrent({ owner, repo, name: ref, status: "tracking", ...empty })
    yield* Effect.logInfo("branch.open").pipe(Effect.annotateLogs({ outcome: "tracking" }))
    // The run goes on in the tab's scope whether or not this page still waits: offline, it spends its retries as any
    // run does, and settles.
    const tracking = yield* Effect.forkIn(
      Effect.result(
        (yield* FlowDispatch).dispatch("branch/track", { repo: `${owner}/${repo}`, branch: ref }, { door: "view" }),
      ),
      (yield* BranchStore).scope,
    )
    const answered = yield* Effect.raceFirst(
      Effect.map(Fiber.join(tracking), Option.some),
      Effect.as(browserIs(false), Option.none()),
    )
    // The tab moved on while the branch was tracked (another branch's page, or home): the answer isn't this page's.
    const now = yield* currentNow
    if (now.owner !== owner || now.repo !== repo || now.name !== ref) return undefined
    if (Option.isNone(answered)) {
      yield* setCurrent({ owner, repo, name: ref, status: "offline", ...empty })
      yield* Metric.update(Metric.withAttributes(opens, { outcome: "offline" }), 1)
      yield* Effect.logInfo("branch.open").pipe(Effect.annotateLogs({ outcome: "offline" }))
      // Opening another branch, or leaving for home, stops the wait; so does another navigation, or leaving for any
      // other page, which abort `signal`.
      const { follower } = yield* BranchStore
      const { reopen } = yield* BranchRoute
      yield* FiberHandle.run(
        follower,
        Effect.andThen(
          browserIs(true),
          Effect.suspend(() => {
            const outcome = signal?.aborted === true ? "abandoned" : "reopened"
            return Effect.andThen(
              Metric.update(Metric.withAttributes(reopens, { outcome }), 1),
              outcome === "reopened" ? reopen : Effect.void,
            )
          }),
        ),
      )
      return undefined
    }
    const dispatched = answered.value
    if (dispatched._tag === "Success" && dispatched.success._tag === "Done") {
      const tracked = dispatched.success.value
      yield* show(tracked.conversationId, tracked.shared)
      if (tracked.access === "owner") {
        const { follower } = yield* BranchStore
        yield* FiberHandle.run(follower, followShares(tracked.branchId))
      }
      yield* setCurrent({
        owner,
        repo,
        name: tracked.name,
        status: "ready",
        branchId: tracked.branchId,
        conversationId: tracked.conversationId,
        mode: tracked.mode,
        access: tracked.access,
      })
      yield* Metric.update(Metric.withAttributes(opens, { outcome: "ready" }), 1)
      return tracked.branchId
    }
    const error = dispatched._tag === "Success" && dispatched.success._tag === "Failed"
      ? dispatched.success.error
      : undefined
    const status = statusOf(error?._tag === "@smthrs/mvp/branch/BranchTrackRefused" ? error.reason : undefined)
    yield* setCurrent({ owner, repo, name: ref, status, ...empty })
    yield* Metric.update(Metric.withAttributes(opens, { outcome: status }), 1)
    return undefined
  }).pipe(Effect.withSpan("branch.open"), Effect.annotateLogs({ feature: "branch" }))


/** Leaves the branch: this tab shows and asks in the home conversation again. */
export const leave = Effect.gen(function* () {
  yield* FiberHandle.clear((yield* BranchStore).follower)
  yield* setCurrent({
    owner: "",
    repo: "",
    name: "",
    status: "none",
    branchId: null,
    conversationId: null,
    mode: null,
    access: null,
  })
  yield* show(null)
})
