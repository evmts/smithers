import { GitHub } from "@smthrs/integrations"
import { Clock, Effect } from "effect"
import { SqlClient } from "effect/sql"
import { itemId } from "../../src/features/issues/contract.ts"
import { reviewId } from "../../src/features/pulls/contract.ts"
import type { Repository } from "./Config.ts"
import { type Fetched, fetchIssue, project } from "./Project.ts"
import { markedWrite, shownBody } from "./Store.ts"

// Re-reading one pull request from GitHub into the projection (decision 0012 §2 and §6, docs/features/pulls.md): its
// `items` row and comments as an issue's (GitHub numbers both in one sequence), plus its `pulls` row, its commits and its
// reviews. A webhook only names its subject, a write reads back what it made, and the `todo` run reads its own pull
// request back, so all of them come here. Reading (GitHub) and writing (Postgres) are separate, so a write settles its
// row and its projection in one transaction without holding it across a call to GitHub.

/** What GitHub answered for one pull request, read at `fetchedAt` (epoch ms); `gone` when it no longer has it. */
export type FetchedPull =
  | {
    readonly kind: "found"
    readonly issue: Extract<Fetched, { readonly kind: "found" }>
    readonly pull: GitHub.Pulls.PullRequest
    readonly commits: ReadonlyArray<GitHub.Pulls.PullCommit>
    readonly reviews: ReadonlyArray<GitHub.Pulls.Review>
    readonly fetchedAt: number
  }
  | { readonly kind: "gone" }

/** Reads pull request `number` of `repository`, its conversation, commits and reviews, with the client in context. */
export const fetchPull = (repository: Repository, number: number) =>
  Effect.gen(function* () {
    const issue = yield* fetchIssue(repository, number)
    if (issue.kind === "gone") return issue satisfies FetchedPull
    const fetchedAt = yield* Clock.currentTimeMillis
    const pull = yield* GitHub.Pulls.getPull(repository.owner, repository.name, number)
    const commits = yield* GitHub.Pulls.listCommits(repository.owner, repository.name, number)
    const reviews = yield* GitHub.Pulls.listReviews(repository.owner, repository.name, number)
    return { kind: "found", issue, pull, commits: commits.items, reviews: reviews.items, fetchedAt } satisfies FetchedPull
  })

const iso = (at: number) => new Date(at).toISOString()

/**
 * Upserts pull request `pull` of `repoId`, read at `fetchedAt`, under the same newer-than guard `items` has: GitHub's
 * `updated_at`, then the read's time, must be newer, and what GitHub said must differ. Returns whether the row changed.
 */
export const upsertPull = (repoId: string, pull: GitHub.Pulls.PullRequest, fetchedAt: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql`
      INSERT INTO pulls (item_id, repo_id, number, head_ref, head_sha, base_ref, base_sha, draft, merged, merged_at,
        merged_by, merge_sha, mergeable_state, additions, deletions, changed_files, commit_count, source_updated_at,
        fetched_at)
      VALUES (${itemId(repoId, pull.number)}, ${repoId}, ${pull.number}, ${pull.head.ref}, ${pull.head.sha},
        ${pull.base.ref}, ${pull.base.sha}, ${pull.draft}, ${pull.merged}, ${pull.merged_at}::timestamptz,
        ${pull.merged_by?.login ?? null}, ${pull.merged ? pull.merge_commit_sha : null}, ${pull.mergeable_state},
        ${pull.additions}, ${pull.deletions}, ${pull.changed_files}, ${pull.commits}, ${pull.updated_at}::timestamptz,
        ${iso(fetchedAt)}::timestamptz)
      ON CONFLICT (item_id) DO UPDATE SET
        head_ref = EXCLUDED.head_ref, head_sha = EXCLUDED.head_sha, base_ref = EXCLUDED.base_ref,
        base_sha = EXCLUDED.base_sha, draft = EXCLUDED.draft, merged = EXCLUDED.merged, merged_at = EXCLUDED.merged_at,
        merged_by = EXCLUDED.merged_by, merge_sha = EXCLUDED.merge_sha, mergeable_state = EXCLUDED.mergeable_state,
        additions = EXCLUDED.additions, deletions = EXCLUDED.deletions, changed_files = EXCLUDED.changed_files,
        commit_count = EXCLUDED.commit_count, source_updated_at = EXCLUDED.source_updated_at,
        fetched_at = EXCLUDED.fetched_at
      WHERE (pulls.source_updated_at, pulls.fetched_at) < (EXCLUDED.source_updated_at, EXCLUDED.fetched_at)
        AND (pulls.head_ref, pulls.head_sha, pulls.base_ref, pulls.base_sha, pulls.draft, pulls.merged, pulls.merged_at,
          pulls.merged_by, pulls.merge_sha, pulls.mergeable_state, pulls.additions, pulls.deletions,
          pulls.changed_files, pulls.commit_count)
        IS DISTINCT FROM (EXCLUDED.head_ref, EXCLUDED.head_sha, EXCLUDED.base_ref, EXCLUDED.base_sha, EXCLUDED.draft,
          EXCLUDED.merged, EXCLUDED.merged_at, EXCLUDED.merged_by, EXCLUDED.merge_sha, EXCLUDED.mergeable_state,
          EXCLUDED.additions, EXCLUDED.deletions, EXCLUDED.changed_files, EXCLUDED.commit_count)
      RETURNING item_id`
    return rows.length > 0
  })

/** The first line of a commit message: what a commit list shows. */
export const headlineOf = (message: string): string => message.split("\n", 1)[0]!.slice(0, 500)

/**
 * Replaces pull request `number`'s commits with `commits`, in order, when they differ from what the row holds: a push
 * or a force push changes the list, and a read of the same list writes nothing. Returns whether it changed.
 */
export const replaceCommits = (repoId: string, number: number, commits: ReadonlyArray<GitHub.Pulls.PullCommit>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const id = itemId(repoId, number)
    const held = yield* sql<{ readonly sha: string }>`SELECT sha FROM pull_commits WHERE item_id = ${id} ORDER BY position`
    if (held.length === commits.length && held.every((row, index) => row.sha === commits[index]!.sha)) return false
    yield* sql`DELETE FROM pull_commits WHERE item_id = ${id}`
    let position = 0
    for (const commit of commits) {
      position += 1
      yield* sql`
        INSERT INTO pull_commits (item_id, position, repo_id, sha, headline, author_login, authored_at)
        VALUES (${id}, ${position}, ${repoId}, ${commit.sha}, ${headlineOf(commit.commit.message)},
          ${commit.author?.login ?? null}, ${commit.commit.author?.date ?? null}::timestamptz)`
    }
    return true
  })

/** Upserts review `review` of pull request `number`; a review's text and state change only by an edit or dismissal. */
export const upsertReview = (repoId: string, number: number, review: GitHub.Pulls.Review, fetchedAt: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql`
      INSERT INTO reviews (id, repo_id, item_id, github_id, author_login, state, commit_sha, body, submitted_at,
        write_id, fetched_at)
      VALUES (${reviewId(repoId, review.id)}, ${repoId}, ${itemId(repoId, number)}, ${review.id},
        ${review.user?.login ?? null}, ${review.state}, ${review.commit_id}, ${shownBody(review.body)},
        ${review.submitted_at}::timestamptz, ${markedWrite(review.body)}::uuid, ${iso(fetchedAt)}::timestamptz)
      ON CONFLICT (id) DO UPDATE SET
        state = EXCLUDED.state, body = EXCLUDED.body, write_id = COALESCE(EXCLUDED.write_id, reviews.write_id),
        fetched_at = EXCLUDED.fetched_at
      WHERE reviews.fetched_at < EXCLUDED.fetched_at
        AND (reviews.state, reviews.body) IS DISTINCT FROM (EXCLUDED.state, EXCLUDED.body)
      RETURNING id`
    return rows.length > 0
  })

/** Writes what `fetchPull` read, through the `SqlClient` in context. Returns how many rows changed, or the tombstone. */
export const projectPull = (repository: Repository, number: number, fetched: FetchedPull) =>
  Effect.gen(function* () {
    if (fetched.kind === "gone") return yield* project(repository, number, fetched)
    const projected = yield* project(repository, number, fetched.issue)
    let changed = projected.changed
    if (yield* upsertPull(repository.id, fetched.pull, fetched.fetchedAt)) changed += 1
    if (yield* replaceCommits(repository.id, number, fetched.commits)) changed += 1
    for (const review of fetched.reviews) {
      if (yield* upsertReview(repository.id, number, review, fetched.fetchedAt)) changed += 1
    }
    return { outcome: "applied" as const, changed }
  })

/** Reads pull request `number` and projects it: `fetchPull`, then `projectPull`. */
export const readPull = (repository: Repository, number: number) =>
  Effect.flatMap(fetchPull(repository, number), (fetched) => projectPull(repository, number, fetched))
