import { AgentAction } from "@smthrs/agent"
import { Uuid, WebCrypto } from "@smthrs/crypto"
import { Action, Flow, Interpreter, RetryPolicy } from "@smthrs/flow"
import { GitHub } from "@smthrs/integrations"
import { Node, type Planned } from "@smthrs/plan"
import { SandboxTools } from "@smthrs/sandbox"
import { Cause, Config, Effect, Layer, Metric, Option, Schema } from "effect"
import { HttpClient } from "effect/http"
import type { SqlClient } from "effect/sql"
import { agentAttribution } from "../../src/features/issues/contract.ts"
import { checkExecutionId, todoExecutionId } from "../../src/features/pulls/contract.ts"
import { TODO_FAILURES } from "../../src/features/todos/contract.ts"
import { Machines } from "../branch/Machines.ts"
import { codeOf } from "../ErrorCode.ts"
import { classify, statusOf, withToken } from "../github/Calls.ts"
import { repositoryOf } from "../github/Config.ts"
import { fetchPull, projectPull } from "../github/Pulls.ts"
import type { GitHubTokens } from "../github/Tokens.ts"
import * as Stack from "../stack/Stack.ts"
import { ChecksRun } from "./Checks.ts"
import { Implement } from "./TodoAgent.ts"
import { machineOf } from "./TodoMachine.ts"

// The `todo` run (decision 0016, the factory simplified): one durable run per attempt, on Cloudflare, started by the
// stack's writer through `TodoRuns`. It takes one TODO to a merged pull request:
//
//   todo/Begin      the TODO and its prompt; its branch `smithers/t<n>-<slug>` made on GitHub at the default branch's
//                   head, as the App, so its machine can check it out ─▶ writer: branch, step implement
//   todo/Implement  the agent writes the change on the attempt's machine with the sandbox tools (worker/flows/TodoAgent.ts)
//   todo/Collect    the files it changed, read whole from the machine; none ─▶ failed empty_change
//   todo/Publish    one commit, `createCommitOnBranch` fenced by the base; the pull request into the default branch,
//                   its body ending "Fixes #n" for a TODO from issue n ─▶ writer: in review; the head's checks start
//   todo/Await      re-reads the pull request until a person merges or closes it (the engine's retries, a minute apart)
//   todo/Settle     writer: merged, or dropped when it was closed; the next Queued TODO starts
//   todo/Fail       any step that gave up ─▶ writer: failed with the step's code; the next TODO starts. A TODO a person
//                   dropped (`ended`) closes the pull request its run opened, and changes nothing else
//
// Every writer call is fenced by the TODO and the attempt (`Stack.report`), so a dropped TODO's run stops at its next
// one. Every GitHub write adopts its own earlier attempt after a lost answer: the branch by its head, the commit by its
// parent and message, the pull request by its head and marker. Nothing here merges, approves or forces a ref: a person
// merges (decision 0012 decision 6). Records carry ids, numbers and outcomes, never a title, a prompt or a file.

/**
 * `TODO_RUNS`: whether this deployment runs TODOs (false unless set). Until the run's agent is proven on Cloudflare
 * (docs/work/todos-and-stack.md), every TODO stays Queued, as before Track B.
 */
export const enabled = Config.Boolean("TODO_RUNS").pipe(Config.withDefault(false))

/** The attempt a run is for: what the writer's `AttemptStart` says, so `TodoRuns.start` hands it over as it is. */
export const TodoRequest = Schema.Struct({
  attemptId: Schema.String.check(Schema.isUUID()),
  todoId: Schema.String.check(Schema.isUUID()),
  repoId: Schema.String,
  number: Schema.Int,
  ordinal: Schema.Int,
  revision: Schema.Int,
})
export type TodoRequest = typeof TodoRequest.Type

/** Why a run gave up: a TODO failure code, or `ended`: a person dropped the TODO, so the run just stops. */
export const STEP_FAILURES = [...TODO_FAILURES, "ended"] as const
export type StepFailure = (typeof STEP_FAILURES)[number]

/** A step gave up for good, with the TODO's failure code. Not retried. */
export class TodoFailed extends Schema.TaggedError<TodoFailed>()("@smthrs/mvp/todo/TodoFailed", {
  failure: Schema.Literals(STEP_FAILURES),
}) {}

/** The steps that call GitHub, the machine or Postgres, as a failure that outlived its retries names them. */
export const STEPS = ["begin", "collect", "publish", "await", "settle"] as const
export type Step = (typeof STEPS)[number]

/**
 * GitHub, the machine or Postgres couldn't answer step `step`: retried, after `retryAfterMillis` when GitHub said. One
 * that outlives its step's retries fails the run with the step's code (`failureOf`).
 */
export class TodoUnavailable extends Schema.TaggedError<TodoUnavailable>()("@smthrs/mvp/todo/TodoUnavailable", {
  step: Schema.Literals(STEPS),
  retryAfterMillis: Schema.optional(Schema.Number),
}) {}

/** The pull request is still open: `todo/Await` asks again. */
export class StillOpen extends Schema.TaggedError<StillOpen>()("@smthrs/mvp/todo/StillOpen", {}) {}

const StepError = Schema.Union([TodoFailed, TodoUnavailable])

/** A step's calls to GitHub and Postgres: 1 s doubling to a minute, for at most an hour. A refusal isn't retried. */
export const STEP_RETRY = RetryPolicy.make({
  initialMs: 1_000,
  factor: 2,
  maxMs: 60_000,
  expirationMs: 60 * 60_000,
  nonRetryable: ["@smthrs/mvp/todo/TodoFailed"],
})

/** Waiting for a person's merge: 5 s doubling to a minute, for as long as the pull request stays open. */
export const AWAIT_RETRY = RetryPolicy.make({
  initialMs: 5_000,
  factor: 2,
  maxMs: 60_000,
  nonRetryable: ["@smthrs/mvp/todo/TodoFailed"],
})

/** What `todo/Begin` read and made: the TODO's text, its branch at its base, and who committed it. */
export const Begun = Schema.Struct({
  branch: Schema.String,
  baseSha: Schema.String,
  defaultBranch: Schema.String,
  title: Schema.String,
  prompt: Schema.String,
  acceptance: Schema.Array(Schema.String),
  issueNumber: Schema.NullOr(Schema.Int),
  ownerId: Schema.String,
  ownerLogin: Schema.String,
})
export type Begun = typeof Begun.Type

/** The change, read whole from the machine: each changed file base64, and each deleted path. */
export const Collected = Schema.Struct({
  additions: Schema.Array(Schema.Struct({ path: Schema.String, contents: Schema.String })),
  deletions: Schema.Array(Schema.String),
})
export type Collected = typeof Collected.Type

/** The commit and the pull request `todo/Publish` made. */
export const Published = Schema.Struct({ headSha: Schema.String, prNumber: Schema.Int })
export type Published = typeof Published.Type

/** How the pull request ended: merged at `mergeSha`, closed unmerged, or the TODO was dropped in Smithers (`ended`). */
export const Awaited = Schema.Struct({
  state: Schema.Literals(["merged", "closed", "ended"]),
  mergeSha: Schema.NullOr(Schema.String),
})
export type Awaited = typeof Awaited.Type

/** How the run ended. */
export const Ran = Schema.Struct({ state: Schema.Literals(["merged", "dropped", "failed", "ended"]) })
export type Ran = typeof Ran.Type

/** The most files one TODO's commit changes. */
export const MAX_FILES = 50

/** The most bytes one TODO's commit adds. */
export const MAX_CHANGE_BYTES = 1024 * 1024

export const Begin = Action.make("todo/Begin", {
  payload: { request: TodoRequest },
  success: Begun,
  error: StepError,
  retryPolicy: STEP_RETRY,
})

export const Collect = Action.make("todo/Collect", {
  payload: { request: TodoRequest, begun: Begun },
  success: Collected,
  error: StepError,
  retryPolicy: STEP_RETRY,
})

export const Publish = Action.make("todo/Publish", {
  payload: { request: TodoRequest, begun: Begun, collected: Collected },
  success: Published,
  error: StepError,
  retryPolicy: STEP_RETRY,
})

export const Await = Action.make("todo/Await", {
  payload: { request: TodoRequest, published: Published },
  success: Awaited,
  error: Schema.Union([TodoFailed, TodoUnavailable, StillOpen]),
  retryPolicy: AWAIT_RETRY,
})

export const Settle = Action.make("todo/Settle", {
  payload: { request: TodoRequest, awaited: Awaited },
  success: Ran,
  error: TodoUnavailable,
  // Once the terminal report commits, admission must keep retrying its receipt rather than fall through to Fail.
  retryPolicy: RetryPolicy.make({ initialMs: 1_000, factor: 2, maxMs: 60_000 }),
})

/** What `todo/Fail` reads: a step's own failure, or the agent's. */
const Failure = Schema.Union([TodoFailed, TodoUnavailable, StillOpen, AgentAction.AgentFailure])
type Failure = typeof Failure.Type

export const Fail = Action.make("todo/Fail", {
  payload: { request: TodoRequest, error: Failure },
  success: Ran,
  error: TodoUnavailable,
  retryPolicy: RetryPolicy.make({ initialMs: 1_000, factor: 2, maxMs: 60_000 }),
})

/** The TODO failure code a run that gave up ends with: a step's own, its step's, or the agent's `implement`. */
export const failureOf = (error: Failure): StepFailure => {
  if (error instanceof TodoFailed) return error.failure
  if (error instanceof TodoUnavailable) {
    return error.step === "begin" || error.step === "publish" ? "publish_refused" : error.step === "collect"
      ? "implement"
      : "pr_refused"
  }
  return "implement"
}

/** `todo`: one attempt of one TODO, from its branch to a person's merge. */
export const Todo = Flow.make("todo", {
  description: "Take one TODO to a merged pull request: make its branch, have the agent write the change on the " +
    "branch's machine, commit it and open the pull request, start its checks, then wait for a person to merge it.",
  capabilities: ["db:write:todos", "db:write:todo_attempts", "db:write:items", "db:write:pulls"],
  modelInvocable: false,
  payload: TodoRequest,
  success: Ran,
  error: TodoUnavailable,
  body: Node.capture(
    {
      begin: Begin.name,
      implement: Implement.name,
      collect: Collect.name,
      publish: Publish.name,
      await: Await.name,
      settle: Settle.name,
      fail: Fail.name,
    },
    (request) =>
      Begin.call({ request }).pipe(
        Node.bindPlanned(Node.capture({ implement: Implement.name }, (begun: Planned.Planned<Begun>) =>
          Implement.call({
            attemptId: request.attemptId,
            todoId: request.todoId,
            repoId: request.repoId,
            number: request.number,
            title: begun.title,
            prompt: begun.prompt,
            acceptance: begun.acceptance,
            branch: begun.branch,
          }).pipe(
            Node.andThen(Collect.call({ request, begun })),
            Node.bindPlanned(Node.capture({ publish: Publish.name }, (collected: Planned.Planned<Collected>) =>
              Publish.call({ request, begun, collected }))),
            Node.bindPlanned(Node.capture({ await: Await.name }, (published: Planned.Planned<Published>) =>
              Await.call({ request, published }))),
            Node.bindPlanned(Node.capture({ settle: Settle.name }, (awaited: Planned.Planned<Awaited>) =>
              Settle.call({ request, awaited }))),
          ))),
        Node.catch({
          onFailure: Node.capture({ fail: Fail.name }, (error: Planned.Planned<Failure>) => Fail.call({ request, error })),
        }),
      ),
  ),
})

/** What the run needs from its host. */
export interface Services<E, R> {
  /** Postgres with the app's tables. */
  readonly database: Layer.Layer<SqlClient.SqlClient, E, R>
  readonly tokens: GitHubTokens
  readonly http: HttpClient.HttpClient
  readonly apiBaseUrl: string
  /**
   * Starts a remote execution on its own host: the next TODO's run, a head's checks. The same start again changes
   * nothing. Admission failures reach the step's durable retry policy, which replays the writer's persisted receipt.
   */
  readonly start: (flow: Flow.Any, options: { readonly executionId: string; readonly payload: unknown }) => Effect.Effect<void, Stack.RunsUnavailable>
}

/** Admissions requested by TODO steps, by flow and outcome; ids are confined to logs and spans. */
export const admissions = Metric.counter("smithers_todo_admissions", {
  description: "Remote execution admissions requested by TODO steps, by flow and outcome",
  incremental: true,
})

/** The production admission adapter: a lost or refused acknowledgment fails the durable action for replay. */
export const admission = (
  start: (flow: Flow.Any, options: { readonly executionId: string; readonly payload: unknown }) => Effect.Effect<void, unknown>,
): Services<never, never>["start"] => (flow, options) => {
  const record = (outcome: "started" | "not_started", errorCode?: string) =>
    Effect.gen(function* () {
      yield* Metric.update(Metric.withAttributes(admissions, { flow: flow._tag, outcome }), 1)
      yield* Effect.logWithLevel(outcome === "started" ? "Info" : "Warn")("todo.start").pipe(
        Effect.annotateLogs({ flow: flow._tag, executionId: options.executionId, outcome, ...(errorCode === undefined ? {} : { errorCode }) }),
      )
    })
  return start(flow, options).pipe(
    Effect.tap(() => record("started")),
    Effect.catchCause((cause) => {
      if (Cause.hasInterrupts(cause)) return Effect.interrupt
      const failure = Cause.squash(cause)
      const errorCode = failure instanceof Stack.RunsUnavailable ? failure.errorCode : codeOf(failure)
      return record("not_started", errorCode).pipe(Effect.andThen(Effect.fail(new Stack.RunsUnavailable({ errorCode }))))
    }),
    Effect.withSpan("todo.start", { attributes: { "smithers.execution.id": options.executionId, "smithers.flow": flow._tag } }),
  )
}

/** The branch a TODO's attempt works on: `smithers/t<n>-<slug of its title>`, at most 60 characters. */
export const branchNameOf = (number: number, title: string, suffix = ""): string => {
  // Accents come off their letters (NFKD, then the combining marks go); anything else not a letter or digit is a dash.
  const slug = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 40)
    .replace(/-+$/, "")
  return `smithers/t${number}${slug === "" ? "" : `-${slug}`}${suffix}`
}

/** A commit's headline and body as the run writes them, which is also how it knows its own commit again. */
export const commitMessageOf = (number: number, title: string, login: string) => ({
  headline: `T${number}: ${title}`.slice(0, 200),
  body: agentAttribution(login),
})

/** The pull request's body: the prompt, "Fixes #n" for a TODO from issue n, and whom the App acted for. */
export const pullBodyOf = (begun: Begun): string =>
  [
    begun.prompt,
    ...(begun.issueNumber === null ? [] : [`Fixes #${begun.issueNumber}`]),
    agentAttribution(begun.ownerLogin),
  ].join("\n\n")

/** Text as base64 of its UTF-8 bytes, as `createCommitOnBranch` takes a file's contents. */
export const base64Of = (text: string): string => {
  const bytes = new TextEncoder().encode(text)
  let binary = ""
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

/** A git status entry that says the file is gone from the working copy. */
const deleted = (entry: { readonly index: string; readonly worktree: string }) => entry.worktree === "D" || entry.index === "D"

/** The namespace a step's own tool call's id is a version 5 UUID of `<attempt>:<step>:<name>` in. */
export const STEP_CALL_NAMESPACE = "c7a41d58-2e93-4f0b-86d5-1b9e3f7a0c24"

/** The steps over `services` and the host's `Machines`. */
export const steps = <E, R>(services: Services<E, R>) => {
  const attemptOf = (request: TodoRequest): Stack.RunAttempt => ({
    attemptId: request.attemptId,
    todoId: request.todoId,
    repoId: request.repoId,
    ordinal: request.ordinal,
  })
  const repositoryOfRequest = (request: TodoRequest) => repositoryOf(request.repoId.replace(/^github\//, ""))

  /** Starts the run of a TODO the writer started. */
  const startTodo = (start: Stack.AttemptStart) =>
    services.start(Todo, { executionId: todoExecutionId(start.attemptId), payload: start })

  /** Reports to the writer; a stale report (a dropped TODO, another attempt) ends the run. */
  // Postgres failing fails the step for its retry policy (`step`'s `failureIn`).
  const report = (request: TodoRequest, event: Stack.RunEvent) =>
    Effect.gen(function* () {
      const reported = yield* Stack.report(attemptOf(request), event, { runs: true })
      if (reported.outcome === "stale") return yield* new TodoFailed({ failure: "ended" })
      yield* Effect.forEach(reported.starts, startTodo, { discard: true })
    })

  /** A failure of step `step` as the run reads it: its own, GitHub's refusal as `refused`, anything else retried. */
  const failureIn = (step: Step, refused: StepFailure) => (error: unknown): TodoFailed | TodoUnavailable => {
    if (error instanceof TodoFailed || error instanceof TodoUnavailable) return error
    const classified = classify(error)
    if (classified.kind === "refused") return new TodoFailed({ failure: refused })
    return new TodoUnavailable(
      classified.kind === "retry" && classified.retryAfterMillis !== undefined
        ? { step, retryAfterMillis: classified.retryAfterMillis }
        : { step },
    )
  }

  /** An installation token for the request's repository; none is the run's failure, or a wait. */
  const tokenFor = (step: Step, request: TodoRequest, access: "publish" | "pulls") =>
    services.tokens.forInstallation(repositoryOfRequest(request), access).pipe(
      Effect.mapError((failure) =>
        failure.reason === "app_not_installed" || failure.reason === "not_allowed"
          ? new TodoFailed({ failure: "app_not_installed" })
          : new TodoUnavailable(
            failure.retryAfterMillis === undefined ? { step } : { step, retryAfterMillis: failure.retryAfterMillis },
          )
      ),
    )

  /**
   * Runs step `name` (`begin`, `collect` or `publish`) with GitHub's HTTP and Postgres, as a span and a log line with
   * ids and the outcome only. GitHub refusing what it didn't name otherwise is `publish_refused`.
   */
  const step = <A>(
    name: Extract<Step, "begin" | "collect" | "publish">,
    request: TodoRequest,
    effect: Effect.Effect<A, unknown, SqlClient.SqlClient | HttpClient.HttpClient | Machines>,
  ) =>
    effect.pipe(
      Effect.provideService(HttpClient.HttpClient, services.http),
      Effect.provide(services.database),
      Effect.mapError(failureIn(name, "publish_refused")),
      Effect.tap(() =>
        Effect.logInfo("todo.step").pipe(
          Effect.annotateLogs({ step: name, attemptId: request.attemptId, todoId: request.todoId, outcome: "done" }),
        )
      ),
      Effect.tapError((error) =>
        Effect.logWarning("todo.step").pipe(
          Effect.annotateLogs({
            step: name,
            attemptId: request.attemptId,
            todoId: request.todoId,
            outcome: error instanceof TodoFailed ? error.failure : "retry",
          }),
        )
      ),
      Effect.withSpan(`todo.${name}`, {
        attributes: { "smithers.todo.attempt": request.attemptId, "smithers.todo.number": request.number },
      }),
    )

  const begin = ({ request }: typeof Begin.payloadSchema.Type) =>
    step("begin", request, Effect.gen(function* () {
      const found = yield* Stack.attemptTodo(attemptOf(request))
      if (Option.isNone(found)) return yield* new TodoFailed({ failure: "ended" })
      const todo = found.value
      if (todo.attempt !== request.ordinal || (todo.state !== "working" && todo.state !== "in_review")) {
        return yield* new TodoFailed({ failure: "ended" })
      }
      const repository = repositoryOfRequest(request)
      const token = yield* tokenFor("begin", request, "publish")
      const made = yield* Effect.gen(function* () {
        const client = yield* GitHub.GitHubClient.GitHubClient
        const facts = yield* client.request(
          "GET",
          `/repos/${GitHub.Repository.repositoryPath(repository.owner, repository.name)}`,
          undefined,
          { schema: Schema.Struct({ default_branch: Schema.String }) },
        )
        const defaultBranch = facts.default_branch
        // A step that ran before recorded its branch and base: the same again.
        if (todo.branch !== null && todo.baseSha !== null) return { branch: todo.branch, baseSha: todo.baseSha, defaultBranch }
        const head = yield* GitHub.Refs.getBranch(repository.owner, repository.name, defaultBranch)
        if (Option.isNone(head)) return yield* new TodoFailed({ failure: "publish_refused" })
        const baseSha = head.value.sha
        // A branch of that name that isn't at the base is someone else's: a suffix, never written over.
        for (const suffix of ["", "-2", "-3", "-4", "-5"]) {
          const branch = branchNameOf(todo.number, todo.title, suffix)
          const existing = yield* GitHub.Refs.getBranch(repository.owner, repository.name, branch)
          if (Option.isSome(existing)) {
            if (existing.value.sha === baseSha) return { branch, baseSha, defaultBranch }
            continue
          }
          const created = yield* GitHub.Refs.createBranch(repository.owner, repository.name, { name: branch, sha: baseSha })
            .pipe(Effect.result)
          if (created._tag === "Success") return { branch, baseSha, defaultBranch }
          // Made by someone else between the read and the write: the next name.
          if (statusOf(created.failure) === 422) continue
          return yield* Effect.fail(created.failure)
        }
        return yield* new TodoFailed({ failure: "publish_refused" })
      }).pipe(withToken(token, services.apiBaseUrl))
      yield* report(request, { kind: "branch", branch: made.branch, baseSha: made.baseSha })
      yield* report(request, { kind: "step", step: "implement" })
      return {
        ...made,
        title: todo.title,
        prompt: todo.prompt,
        acceptance: todo.acceptance,
        issueNumber: todo.issueNumber,
        ownerId: todo.createdBy,
        ownerLogin: todo.createdLogin,
      } satisfies Begun
    }))

  const collect = ({ request, begun }: typeof Collect.payloadSchema.Type) =>
    step("collect", request, Effect.gen(function* () {
      const machines = yield* Machines
      const machine = machineOf({ ...request, branch: begun.branch, ownerId: begun.ownerId })
      const tool = (name: string, call: SandboxTools.Call) =>
        Effect.gen(function* () {
          const callId = yield* Uuid.v5(STEP_CALL_NAMESPACE, `${request.attemptId}:collect:${name}`).pipe(
            Effect.provide(WebCrypto.layer),
          )
          return (yield* machines.tool(machine.branch, machine.ownerId, callId, call)).result
        }).pipe(
          Effect.mapError((error) =>
            error._tag === "@smthrs/sandbox/SandboxTools/ToolRefused" || error._tag === "@smthrs/mvp/branch/CheckoutFailed"
              ? new TodoFailed({ failure: "implement" })
              : new TodoUnavailable({ step: "collect" })
          ),
        )
      // A tool answers its own call's result.
      const { entries } = (yield* tool("status", { tool: "status" })) as typeof SandboxTools.StatusResult.Type
      if (entries.length === 0) return yield* new TodoFailed({ failure: "empty_change" })
      if (entries.length > MAX_FILES) return yield* new TodoFailed({ failure: "implement" })
      const additions: Array<{ readonly path: string; readonly contents: string }> = []
      const deletions: Array<string> = []
      let bytes = 0
      for (const entry of entries) {
        if (deleted(entry)) {
          deletions.push(entry.path)
          continue
        }
        const read = (yield* tool(`read:${entry.path}`, { tool: "read", path: entry.path })) as typeof SandboxTools.ReadResult.Type
        if (read.truncated) return yield* new TodoFailed({ failure: "implement" })
        bytes += read.bytes
        additions.push({ path: entry.path, contents: base64Of(read.content) })
      }
      if (bytes > MAX_CHANGE_BYTES) return yield* new TodoFailed({ failure: "implement" })
      return { additions, deletions } satisfies Collected
    }))

  const publish = ({ request, begun, collected }: typeof Publish.payloadSchema.Type) =>
    step("publish", request, Effect.gen(function* () {
      yield* report(request, { kind: "step", step: "publish" })
      const repository = repositoryOfRequest(request)
      const token = yield* tokenFor("publish", request, "publish")
      const message = commitMessageOf(request.number, begun.title, begun.ownerLogin)
      const published = yield* Effect.gen(function* () {
        // The commit, made once: a head past the base is ours when its parent is the base and its message ours.
        const head = yield* GitHub.Refs.getBranch(repository.owner, repository.name, begun.branch)
        if (Option.isNone(head)) return yield* new TodoFailed({ failure: "publish_refused" })
        let headSha = head.value.sha
        if (headSha === begun.baseSha) {
          headSha = yield* GitHub.Commits.createOnBranch(repository.owner, repository.name, {
            branch: begun.branch,
            expectedHeadOid: begun.baseSha,
            headline: message.headline,
            body: message.body,
            additions: collected.additions,
            deletions: collected.deletions,
          })
        } else {
          const commit = yield* GitHub.Commits.getCommit(repository.owner, repository.name, headSha)
          const ours = commit.parents.length === 1 && commit.parents[0]!.sha === begun.baseSha &&
            commit.message === `${message.headline}\n\n${message.body}`
          if (!ours) return yield* new TodoFailed({ failure: "publish_refused" })
        }
        // The pull request, found by its head and our marker, or opened once.
        const found = yield* GitHub.Pulls.findPullByHead(repository.owner, repository.name, {
          head: begun.branch,
          writeId: request.attemptId,
        })
        const pull = Option.isSome(found) ? found.value : yield* GitHub.Pulls.createPull(repository.owner, repository.name, {
          head: begun.branch,
          base: begun.defaultBranch,
          title: `T${request.number}: ${begun.title}`.slice(0, 256),
          body: GitHub.Issues.withWriteMarker(pullBodyOf(begun), request.attemptId),
        }).pipe(Effect.mapError(failureIn("publish", "pr_refused")))
        // Read it back into the projection, so every device sees it before the webhook rings.
        yield* projectPull(repository, pull.number, yield* fetchPull(repository, pull.number))
        return { headSha, prNumber: pull.number } satisfies Published
      }).pipe(withToken(token, services.apiBaseUrl))
      yield* report(request, { kind: "published", headSha: published.headSha, prNumber: published.prNumber })
      // The head's checks: Smithers runs on its machine, recorded in `runs` with the head (decision 0012 decision 12).
      yield* services.start(ChecksRun, {
        executionId: checkExecutionId(request.repoId, published.headSha, "all"),
        payload: {
          repoId: request.repoId,
          sha: published.headSha,
          prNumber: published.prNumber,
          baseSha: begun.baseSha,
          attemptId: request.attemptId,
          branch: begun.branch,
          ownerId: begun.ownerId,
        },
      })
      return published
    }))

  const await_ = ({ request, published }: typeof Await.payloadSchema.Type) =>
    Effect.gen(function* () {
      const repository = repositoryOfRequest(request)
      const found = yield* Stack.attemptTodo(attemptOf(request))
      const dropped = Option.match(found, {
        onNone: () => true,
        onSome: (todo) => todo.attempt !== request.ordinal || todo.state === "dropped",
      })
      const token = yield* tokenFor("await", request, dropped ? "publish" : "pulls")
      return yield* Effect.gen(function* () {
        // Dropped in Smithers while its pull request is open: the run closes what it opened, as the App.
        if (dropped) {
          yield* GitHub.Pulls.closePull(repository.owner, repository.name, published.prNumber)
          return { state: "ended", mergeSha: null } satisfies Awaited
        }
        const fetched = yield* fetchPull(repository, published.prNumber)
        yield* projectPull(repository, published.prNumber, fetched)
        if (fetched.kind === "gone") return { state: "closed", mergeSha: null } satisfies Awaited
        if (fetched.pull.merged) return { state: "merged", mergeSha: fetched.pull.merge_commit_sha } satisfies Awaited
        if (fetched.pull.state === "closed") return { state: "closed", mergeSha: null } satisfies Awaited
        return yield* new StillOpen()
      }).pipe(withToken(token, services.apiBaseUrl))
    }).pipe(
      Effect.provideService(HttpClient.HttpClient, services.http),
      Effect.provide(services.database),
      Effect.mapError((error) => (error instanceof StillOpen ? error : failureIn("await", "pr_refused")(error))),
      Effect.withSpan("todo.await", { attributes: { "smithers.todo.attempt": request.attemptId } }),
    )

  const settle = ({ request, awaited }: typeof Settle.payloadSchema.Type) =>
    Effect.gen(function* () {
      if (awaited.state === "ended") return { state: "ended" } satisfies Ran
      const state = awaited.state === "merged" ? "merged" : "dropped"
      const reported = yield* Stack.report(attemptOf(request), {
        kind: "finished",
        state,
        ...(awaited.state === "closed" ? { note: "closed_on_github" as const } : {}),
        ...(awaited.mergeSha === null ? {} : { mergeSha: awaited.mergeSha }),
      }, { runs: true })
      yield* Effect.forEach(reported.starts, startTodo, { discard: true })
      yield* Effect.logInfo("todo.settle").pipe(
        Effect.annotateLogs({ attemptId: request.attemptId, todoId: request.todoId, state, outcome: reported.outcome }),
      )
      return { state: reported.outcome === "stale" ? "ended" : state } satisfies Ran
    }).pipe(
      Effect.provide(services.database),
      Effect.mapError(() => new TodoUnavailable({ step: "settle" })),
      Effect.withSpan("todo.settle", { attributes: { "smithers.todo.attempt": request.attemptId } }),
    )

  const fail = ({ request, error }: typeof Fail.payloadSchema.Type) =>
    Effect.gen(function* () {
      const failure = failureOf(error)
      yield* Effect.logWarning("todo.fail").pipe(
        Effect.annotateLogs({ attemptId: request.attemptId, todoId: request.todoId, failure, errorCode: codeOf(error) }),
      )
      if (failure === "ended") return { state: "ended" } satisfies Ran
      const reported = yield* Stack.report(attemptOf(request), { kind: "finished", state: "failed", failure }, {
        runs: true,
      })
      yield* Effect.forEach(reported.starts, startTodo, { discard: true })
      return { state: reported.outcome === "stale" ? "ended" : "failed" } satisfies Ran
    }).pipe(
      Effect.provide(services.database),
      Effect.mapError(() => new TodoUnavailable({ step: "settle" })),
      Effect.withSpan("todo.fail", { attributes: { "smithers.todo.attempt": request.attemptId } }),
    )

  return { begin, collect, publish, await: await_, settle, fail }
}

/**
 * Registers `todo` with its steps over `services`, the host's `Machines`, and `implement`: `todo/Implement`'s
 * implementation (worker/flows/TodoAgent.ts `registration`).
 */
export const registration = <E, R, IE, IR>(
  services: Services<E, R>,
  implement: Layer.Layer<Layer.Success<typeof Implement.layer>, IE, IR>,
) => {
  const implementation = steps(services)
  return Interpreter.layerWithImplementations(
    Todo,
    Layer.mergeAll(
      Begin.toLayer(implementation.begin),
      Collect.toLayer(implementation.collect),
      Publish.toLayer(implementation.publish),
      Await.toLayer(implementation.await),
      Settle.toLayer(implementation.settle),
      Fail.toLayer(implementation.fail),
      implement,
    ),
  ).pipe(Layer.provideMerge(Action.layerImplementations))
}
