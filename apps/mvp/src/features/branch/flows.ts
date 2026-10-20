import { Action, Flow, RetryPolicy } from "@smthrs/flow"
import { Node, Placement } from "@smthrs/plan"
import { Schema } from "effect"
import { RepoName } from "../repo/flows"
import { isBranchName } from "./contract"
import { Tracked } from "./schema"

// `branch/track { repo, branch }` (decision 0013 §2, docs/features/branch-workspace.md#tracking-a-branch): records a
// branch GitHub already has, with its conversation, and answers both ids. Opening a branch's page runs it, and the agent
// can too. Its one step asks ChatApi (`POST /api/branches`), which reads the branch from its forge with the credential
// the server holds; the device never holds it. Tracking a branch the app tracks already answers at once.

/** A branch's name, as git accepts it. */
export const BranchName = Schema.String.check(Schema.makeFilter(isBranchName))

/**
 * ChatApi didn't track the branch: GitHub has no such repository or branch (`not_found`), signed out (`sign_in`), not
 * a Member (`forbidden`), or a name that can't be one (`invalid`).
 */
export class BranchTrackRefused extends Schema.TaggedError<BranchTrackRefused>()(
  "@smthrs/mvp/branch/BranchTrackRefused",
  { reason: Schema.Literals(["not_found", "sign_in", "forbidden", "invalid"]) },
) {}

/** ChatApi couldn't track the branch now: unreachable, or GitHub or Postgres didn't answer. */
export class BranchTrackUnavailable extends Schema.TaggedError<BranchTrackUnavailable>()(
  "@smthrs/mvp/branch/BranchTrackUnavailable",
  {},
) {}

/** What tracking can fail with. */
export const TrackFailure = Schema.Union([BranchTrackRefused, BranchTrackUnavailable])
export type TrackFailure = typeof TrackFailure.Type

const payload = { repo: RepoName, branch: BranchName }

/**
 * While ChatApi is unreachable or restarting, the step tries again: 500 ms doubling to 4 s, for at most 30 seconds,
 * since a page waits on it. Tracking is idempotent: the branch is recorded once.
 */
export const TRACK_RETRY = RetryPolicy.make({
  initialMs: 500,
  factor: 2,
  maxMs: 4_000,
  expirationMs: 30_000,
  nonRetryable: ["@smthrs/mvp/branch/BranchTrackRefused"],
})

/** The step: ask ChatApi to track the branch. */
export const TrackBranch = Action.make("branch/track/request", {
  payload,
  success: Tracked,
  error: TrackFailure,
  retryPolicy: TRACK_RETRY,
})

/** `branch/track { repo, branch }`: records a branch GitHub has, with its conversation. */
export const BranchTrack = Flow.make("branch/track", {
  description: "Track a branch of a GitHub repository (owner/name) that GitHub already has, with its conversation. " +
    "Answers { branchId, conversationId, repoId, name, mode }: mode locked for the default branch, else open. " +
    "BranchTrackRefused says why not: not_found, sign_in, forbidden or invalid.",
  modelInvocable: true,
  payload,
  success: Tracked,
  error: TrackFailure,
  body: Node.capture({ action: TrackBranch.name }, (request) => TrackBranch.call(request)),
}).annotate(Flow.Placement, Placement.client())
