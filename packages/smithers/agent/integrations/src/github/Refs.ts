/**
 * Branch refs over the {@link GitHubClient} in context: read a branch's head
 * and create a branch at a commit.
 *
 * A plain operation, not a durable action: the flow step that calls it
 * chooses the token by providing the client. Nothing here moves an existing
 * ref, so nothing here can force one: a branch changes only by a fenced commit
 * (`Commits.createOnBranch`) or a merge.
 *
 * **Writing once.** Creating a ref is safe to adopt: GitHub answers 422 when
 * the branch exists, and a step that lost the answer reads the ref back with
 * {@link getBranch} and adopts it when it points at the commit it meant.
 *
 * A branch name is validated against git's ref rules before it becomes a
 * request path, so a hostile name cannot walk the token-bearing request to
 * another endpoint.
 *
 * @since 1.0.0
 */

import { Effect, Option, Schema } from "effect"
import { IntegrationError } from "../core/IntegrationError.ts"
import { GitHubClient } from "./GitHubClient.ts"
import { requireRepositoryPath } from "./Repository.ts"

/**
 * The longest branch name {@link requireBranch} accepts.
 *
 * @category constants
 * @since 1.0.0
 */
export const MAX_BRANCH_LENGTH = 200

/**
 * A branch and the commit it points at.
 *
 * @category models
 * @since 1.0.0
 */
export interface Branch {
  readonly name: string
  readonly sha: string
}

const RefAnswer = Schema.Struct({
  ref: Schema.String,
  object: Schema.Struct({ sha: Schema.String, type: Schema.String })
})

const SEGMENT = /^[A-Za-z0-9._-]+$/
const SHA = /^[0-9a-f]{40}$/

/**
 * Whether `name` is a branch name this module sends: 1 to
 * {@link MAX_BRANCH_LENGTH} characters of letters, digits, `.`, `_`, `-` and
 * `/`, in segments that are not empty, do not start with `.` and do not end
 * with `.lock`, with no `..` anywhere: a subset of git's `check-ref-format`.
 *
 * @category predicates
 * @since 1.0.0
 */
export const isBranch = (name: unknown): name is string =>
  typeof name === "string" && name.length > 0 && name.length <= MAX_BRANCH_LENGTH && !name.includes("..") &&
  name.split("/").every((segment) => SEGMENT.test(segment) && !segment.startsWith(".") && !segment.endsWith(".lock"))

/**
 * `name` when {@link isBranch} holds, else an `invalid-config` failure.
 *
 * @category constructors
 * @since 1.0.0
 */
export const requireBranch = (name: string): Effect.Effect<string, IntegrationError> =>
  isBranch(name) ? Effect.succeed(name) : Effect.fail(
    new IntegrationError("invalid-config", "A branch name must follow git's ref rules.", {
      field: "branch",
      branch: typeof name === "string" ? (name as string).slice(0, 64) : typeof name,
      retryable: false
    })
  )

const spanAttributes = (owner: string, repo: string): Record<string, unknown> => ({
  "github.owner": owner,
  "github.repo": repo
})

/**
 * Branch `name`'s head: `GET /repos/{owner}/{repo}/git/ref/heads/{name}`.
 * `Option.none()` when GitHub answers 404, as it does for a branch that does
 * not exist.
 *
 * @category getters
 * @since 1.0.0
 */
export const getBranch = (
  owner: string,
  repo: string,
  name: string
): Effect.Effect<Option.Option<Branch>, IntegrationError, GitHubClient> =>
  Effect.gen(function*() {
    const client = yield* GitHubClient
    const repository = yield* requireRepositoryPath(owner, repo)
    const branch = yield* requireBranch(name)
    return yield* client.request("GET", `/repos/${repository}/git/ref/heads/${branch}`, undefined, {
      schema: RefAnswer
    }).pipe(
      Effect.map((answer) => Option.some({ name: branch, sha: answer.object.sha })),
      Effect.catchIf((error) => error.details?.["status"] === 404, () => Effect.succeed(Option.none<Branch>()))
    )
  }).pipe(Effect.withSpan("GitHub.Refs.getBranch", { attributes: spanAttributes(owner, repo) }))

/**
 * Creates branch `name` at commit `sha`: `POST /repos/{owner}/{repo}/git/refs`.
 *
 * GitHub answers 422 when the branch exists. A lost answer fails
 * `outcomeUnknown`: read it back with {@link getBranch} and adopt it when it
 * points at `sha`.
 *
 * @category constructors
 * @since 1.0.0
 */
export const createBranch = (
  owner: string,
  repo: string,
  input: { readonly name: string; readonly sha: string }
): Effect.Effect<Branch, IntegrationError, GitHubClient> =>
  Effect.gen(function*() {
    const client = yield* GitHubClient
    const repository = yield* requireRepositoryPath(owner, repo)
    const branch = yield* requireBranch(input.name)
    if (typeof input.sha !== "string" || !SHA.test(input.sha)) {
      return yield* Effect.fail(
        new IntegrationError("invalid-config", "A commit SHA must be 40 lowercase hex digits.", {
          field: "sha",
          retryable: false
        })
      )
    }
    const answer = yield* client.request("POST", `/repos/${repository}/git/refs`, {
      ref: `refs/heads/${branch}`,
      sha: input.sha
    }, { schema: RefAnswer })
    return { name: branch, sha: answer.object.sha }
  }).pipe(Effect.withSpan("GitHub.Refs.createBranch", { attributes: spanAttributes(owner, repo) }))
