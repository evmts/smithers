// `repo/Clone` (worker/flows/RepoClone.ts, docs/features/repo.md#the-clone) on the Node host (worker/test/flowHost.ts),
// over this file's schema of the compose Postgres (`pnpm db:up`), with the scripted Code Storage and GitHub
// (worker/test/codeStorage.ts). The same flow and registration run on the Cloudflare Durable Object, so passing here
// shows the flow is host-agnostic. Each step's unhappy paths run the step alone against an armed fault.
import { GitRemote } from "@smthrs/effect-code-storage"
import { FlowRuntime } from "@smthrs/flow"
import { RunStore } from "@smthrs/flows"
import { Logger as StructuredLogger } from "@smthrs/observability"
import { Cause, Context, Duration, Effect, Exit, Fiber, Layer, Logger, Metric, Redacted, Scope } from "effect"
import { SqlClient } from "effect/sql"
import { beforeEach, describe, expect, test } from "vitest"
import * as Database from "../../db/Database.ts"
import * as TestDatabase from "../../db/TestDatabase.ts"
import { cloneExecutionId } from "../../src/features/repo/contract.ts"
import * as RepoMetrics from "../RepoMetrics.ts"
import * as Repos from "../Repos.ts"
import { UpstreamUnavailable } from "../RepoUpstream.ts"
import { fixture, type Scripted, scripted } from "../test/codeStorage.ts"
import { build, runFlow } from "../test/flowHost.ts"
import { testFile } from "../test/harness.ts"
import { repositoryRow, resetRepos, usageRow } from "../test/repos.ts"
import * as RepoClone from "./RepoClone.ts"

const runtime = testFile("repo_clone")

beforeEach(() => resetRepos(runtime))

const sql = (statement: string) =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, (client) => Effect.orDie(client.unsafe(statement))))

const scratch = () => runtime.runPromise(Effect.service(TestDatabase.Scratch))

const unreachable = Database.layer(Effect.succeed(Redacted.make("postgresql://smithers:smithers@127.0.0.1:1/smithers")))

const limits = (overrides: Partial<Repos.Budgets> = {}): Repos.Budgets => ({
  maxRepositories: 100,
  maxStoredBytes: 3e9,
  maxReadBytes: 40e9,
  maxRepositoryBytes: 1e9,
  budgetUsd: 20,
  ...overrides,
})

type StructuredLog = ReturnType<typeof StructuredLogger.formatStructured.log>

/** The clone's services over this file's schema, recording logs and metrics. */
const services = async (
  provider: Scripted,
  options: { readonly budgets?: Partial<Repos.Budgets>; readonly deadline?: Duration.Input; readonly database?: RepoClone.Services["database"] } = {},
) => ({
  database: options.database ?? (await scratch()).database,
  codeStorage: provider.client,
  upstream: provider.upstream,
  budgets: limits(options.budgets),
  deadline: Duration.fromInputUnsafe(options.deadline ?? "10 minutes"),
})

/** Asks for a clone of `owner/name` as RepoApi does, and answers the flow's payload. */
const request = async (owner: string, name: string, budgets = limits()) => {
  const id = `github/${owner}/${name}`.toLowerCase()
  const requested = await runtime.runPromise(Repos.request({ id, owner, name }, budgets))
  if (requested.kind === "limit") throw new Error("over the repository limit")
  return { id, owner, name, cloneId: requested.cloneId, requestedAt: requested.requestedAt }
}

/** Runs one clone to its end, counting what it settled. */
const clone = async (provider: Scripted, payload: Awaited<ReturnType<typeof request>>, options: Parameters<typeof services>[1] = {}) => {
  const registry: Metric.MetricRegistry = new Map()
  const registration = RepoClone.registration(await services(provider, options)).pipe(
    Layer.provide(Layer.succeed(Metric.MetricRegistry, registry)),
  )
  const ran = await runFlow(RepoClone.Clone, payload, registration, {
    executionId: cloneExecutionId(payload.id, payload.cloneId),
    maxConnections: 3,
  })
  const count = (metric: Metric.Metric<number, Metric.CounterState<number>>, attributes: Record<string, string>) =>
    Effect.runSync(Metric.value(Metric.withAttributes(metric, attributes)).pipe(Effect.provideService(Metric.MetricRegistry, registry))).count
  return { ...ran, count }
}

describe("repo/Clone on the Node host", () => {
  test("clones to ready, with the head commit, and meters what it imported", async () => {
    const provider = scripted({ syncPolls: 2 })
    provider.publish("octocat", "Spoon-Knife")
    const payload = await request("octocat", "Spoon-Knife")
    const ran = await clone(provider, payload)
    expect(ran.exit).toEqual(Exit.succeed({ status: "ready", settled: true }))
    expect(ran.status).toBe("completed")
    expect(await repositoryRow(runtime, payload.id)).toMatchObject({
      status: "ready",
      defaultBranch: "main",
      headSha: fixture().commit.sha,
      storedBytes: String(640 * 1024),
    })
    // Two polls answered sync_in_progress; the step retried after Code Storage's Retry-After.
    expect(provider.calls.filter((call) => call.startsWith("listCommits"))).toHaveLength(3)
    expect(ran.count(RepoMetrics.clones, { outcome: "ready", reason: "none" })).toBe(1)
    expect((await usageRow(runtime))!.imported).toBe(640 * 1024)
  })

  test("a repository GitHub doesn't have, or with no commits, fails with no Code Storage call", async () => {
    const provider = scripted()
    const missing = await clone(provider, await request("octocat", "Gone"))
    expect(missing.exit).toEqual(Exit.succeed({ status: "failed", settled: true }))
    expect(await repositoryRow(runtime, "github/octocat/gone")).toMatchObject({ status: "failed", failure: "not_found" })
    provider.failGitHub("head", new GitRemote.GitRemoteError({ code: "empty", status: 200 }))
    await clone(provider, await request("octocat", "Empty"))
    expect(await repositoryRow(runtime, "github/octocat/empty")).toMatchObject({ status: "failed", failure: "empty" })
    expect(provider.calls.some((call) => call.startsWith("createRepo"))).toBe(false)
  })

  test("each budget settles capacity with no Code Storage call", async () => {
    const provider = scripted()
    provider.publish("octocat", "Big", fixture({ sizeKb: 2_000_000 }))
    await clone(provider, await request("octocat", "Big"))
    expect(await repositoryRow(runtime, "github/octocat/big")).toMatchObject({
      status: "capacity",
      capacity: "too_large",
      storedBytes: String(2_000_000 * 1024),
    })

    provider.publish("octocat", "Medium", fixture({ sizeKb: 2_000 }))
    await clone(provider, await request("octocat", "Medium"), { budgets: { maxStoredBytes: 1_000_000 } })
    expect(await repositoryRow(runtime, "github/octocat/medium")).toMatchObject({ status: "capacity", capacity: "storage" })

    await sql(`INSERT INTO code_storage_usage (month, bytes_read) VALUES ((date_trunc('month', now() AT TIME ZONE 'UTC'))::date, 50)`)
    provider.publish("octocat", "Small", fixture({ sizeKb: 1 }))
    const reads = await clone(provider, await request("octocat", "Small"), { budgets: { maxReadBytes: 50 } })
    expect(await repositoryRow(runtime, "github/octocat/small")).toMatchObject({ status: "capacity", capacity: "reads" })
    expect(reads.count(RepoMetrics.capacity, { reason: "reads" })).toBe(1)

    await sql(`UPDATE repo_imports SET paused = true`)
    provider.publish("octocat", "Paused")
    await clone(provider, await request("octocat", "Paused"))
    expect(await repositoryRow(runtime, "github/octocat/paused")).toMatchObject({ status: "capacity", capacity: "paused" })
    await sql(`UPDATE repo_imports SET paused = false`)

    const resetAt = Date.now() + 15 * 60_000
    provider.publish("octocat", "Limited")
    provider.failGitHub("size", { retryAt: resetAt })
    await clone(provider, await request("octocat", "Limited"))
    const limited = await repositoryRow(runtime, "github/octocat/limited")
    expect(limited).toMatchObject({ status: "capacity", capacity: "size_unknown", storedBytes: null })
    expect(Math.abs(limited!.retryAt!.getTime() - resetAt)).toBeLessThan(1_000)

    expect(provider.calls.some((call) => call.startsWith("createRepo"))).toBe(false)
  })

  test("two imports can't both take the last headroom", async () => {
    const provider = scripted()
    provider.publish("octocat", "One", fixture({ sizeKb: 600 }))
    provider.publish("octocat", "Two", fixture({ sizeKb: 600 }))
    const budgets = { maxStoredBytes: 1_000_000 }
    const [one, two] = await Promise.all([
      clone(provider, await request("octocat", "One"), { budgets }),
      clone(provider, await request("octocat", "Two"), { budgets }),
    ])
    expect([one.exit, two.exit]).toEqual(expect.arrayContaining([
      Exit.succeed({ status: "ready", settled: true }),
      Exit.succeed({ status: "capacity", settled: true }),
    ]))
  })

  test("past the deadline, the sync settles timed_out", async () => {
    const provider = scripted({ syncPolls: 1_000 })
    provider.publish("octocat", "Slow")
    const ran = await clone(provider, await request("octocat", "Slow"), { deadline: "1 millis" })
    expect(ran.exit).toEqual(Exit.succeed({ status: "failed", settled: true }))
    expect(await repositoryRow(runtime, "github/octocat/slow")).toMatchObject({ status: "failed", failure: "timed_out" })
  })

  test("a name Code Storage holds with another upstream fails unavailable", async () => {
    const provider = scripted()
    provider.publish("octocat", "Taken")
    provider.mirrors.set("github/octocat/taken", {
      upstream: { owner: "someone", name: "else" },
      defaultBranch: "main",
      synced: true,
      pending: 0,
    })
    await clone(provider, await request("octocat", "Taken"))
    expect(await repositoryRow(runtime, "github/octocat/taken")).toMatchObject({ status: "failed", failure: "unavailable" })
  })

  test("a stale attempt can't settle: Try again's attempt owns the row", async () => {
    const provider = scripted()
    provider.publish("octocat", "Spoon-Knife")
    const first = await request("octocat", "Spoon-Knife")
    await sql(`UPDATE repositories SET status = 'failed', failure = 'unavailable'`)
    const second = await request("octocat", "Spoon-Knife")
    expect(await repositoryRow(runtime, first.id)).toMatchObject({ attempt: 2, cloneId: second.cloneId })
    expect(second.cloneId).not.toBe(first.cloneId)
    const stale = await clone(provider, first)
    expect(stale.exit).toEqual(Exit.succeed({ status: "ready", settled: false }))
    expect(stale.count(RepoMetrics.clones, { outcome: "ready", reason: "none" })).toBe(0)
    expect(await repositoryRow(runtime, first.id)).toMatchObject({ status: "cloning", attempt: 2 })
    await clone(provider, second)
    expect(await repositoryRow(runtime, first.id)).toMatchObject({ status: "ready", attempt: 2 })
  })

  test("a run from before a reset can't admit or settle the new row, though both are attempt 1", async () => {
    const provider = scripted()
    provider.publish("octocat", "Spoon-Knife")
    const old = await request("octocat", "Spoon-Knife")
    // The table is reset while the old run's Durable Object lives on: the counter restarts, the attempt's id doesn't.
    await resetRepos(runtime)
    const fresh = await request("octocat", "Spoon-Knife")
    expect(await repositoryRow(runtime, fresh.id)).toMatchObject({ attempt: 1, cloneId: fresh.cloneId })
    expect(fresh.cloneId).not.toBe(old.cloneId)
    const stale = await clone(provider, old)
    expect(stale.exit).toEqual(Exit.succeed({ status: "ready", settled: false }))
    expect(await repositoryRow(runtime, fresh.id)).toMatchObject({ status: "cloning", storedBytes: null })
    expect((await clone(provider, fresh)).exit).toEqual(Exit.succeed({ status: "ready", settled: true }))
    expect(await repositoryRow(runtime, fresh.id)).toMatchObject({ status: "ready", storedBytes: String(640 * 1024) })
  })

  test("killed after Import, a new engine resumes the run with no second create", async () => {
    const provider = scripted()
    provider.publish("octocat", "Spoon-Knife")
    provider.fail("pullUpstream", "never")
    const payload = await request("octocat", "Spoon-Knife")
    const executionId = cloneExecutionId(payload.id, payload.cloneId)
    const registration = RepoClone.registration(await services(provider))
    const engine = async (schema?: string) => {
      const scope = Effect.runSync(Scope.make())
      const built = await Effect.runPromise(
        Scope.provide(scope)(
          build(registration, {
            hostId: "durable-object",
            isAlive: RunStore.Ownership.singleIncarnationLiveness,
            maxConnections: 3,
            ...(schema === undefined ? {} : { schema }),
          }),
        ),
      )
      return { built, close: () => Effect.runPromise(Scope.close(scope, Exit.void)) }
    }
    const first = await engine()
    const flows = Context.get(first.built.context, FlowRuntime.FlowRuntime)
    // Its fiber dies with its connections; what it ends with is the dead object's, never the run's.
    const running = Effect.runFork(Effect.exit(flows.execute(RepoClone.Clone, { executionId, payload })))
    await expect.poll(() => provider.calls.includes(`pullUpstream:${payload.id}`), { interval: 10, timeout: 20_000 }).toBe(true)
    // The object dies mid-step: Postgres ends its connections, so it records nothing more.
    await runtime.runPromise(
      Effect.flatMap(SqlClient.SqlClient, (client) =>
        client`SELECT pg_terminate_backend(pid) FROM pg_stat_activity
          WHERE pid <> pg_backend_pid() AND query LIKE ${`%${first.built.engine.schema}%`}`),
    )
    const second = await engine(first.built.engine.schema)
    const resumed = await Effect.runPromise(
      Effect.exit(Context.get(second.built.context, FlowRuntime.FlowRuntime).execute(RepoClone.Clone, { executionId, payload })),
    )
    await Effect.runPromise(Fiber.interrupt(running))
    await second.close()
    await first.close()
    expect(resumed).toEqual(Exit.succeed({ status: "ready", settled: true }))
    expect(provider.calls.filter((call) => call.startsWith("createRepo"))).toHaveLength(1)
    expect(await repositoryRow(runtime, payload.id)).toMatchObject({ status: "ready" })
  })
})

describe("the steps alone", () => {
  /** The steps over `provider`, with `database` in place of the file's schema when set. */
  const stepsOf = async (provider: Scripted, options: Parameters<typeof services>[1] = {}) =>
    RepoClone.steps(await services(provider, options))

  const failureOf = <A, E>(exit: Exit.Exit<A, E>) => (Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined)

  test("Inspect: a GitHub that doesn't answer is retried, with GitHub's wait when it gave one", async () => {
    const provider = scripted()
    provider.publish("octocat", "Spoon-Knife")
    const payload = await request("octocat", "Spoon-Knife")
    const steps = await stepsOf(provider)
    provider.failGitHub("head", new GitRemote.GitRemoteError({ code: "unavailable", status: 502 }))
    expect(failureOf(await Effect.runPromiseExit(steps.inspect(payload)))).toBeInstanceOf(RepoClone.CloneUnavailable)
    provider.failGitHub("size", new UpstreamUnavailable({ retryAfterMillis: 1_500 }), new UpstreamUnavailable({}))
    expect(failureOf(await Effect.runPromiseExit(steps.inspect(payload)))).toMatchObject({ retryAfterMillis: 1_500 })
    expect(failureOf(await Effect.runPromiseExit(steps.inspect(payload)))).not.toHaveProperty("retryAfterMillis", 1_500)
    const down = await stepsOf(provider, { database: unreachable })
    expect(failureOf(await Effect.runPromiseExit(down.inspect(payload)))).toBeInstanceOf(RepoClone.CloneUnavailable)
  })

  test("Inspect: a detached HEAD, or a repository the REST API doesn't have, fails the clone", async () => {
    const provider = scripted()
    provider.publish("octocat", "Detached", fixture({ branch: undefined }))
    const steps = await stepsOf(provider)
    expect(await Effect.runPromise(steps.inspect(await request("octocat", "Detached")))).toMatchObject({
      outcome: "failed",
      failure: "unavailable",
    })
    provider.publish("octocat", "Hidden")
    provider.failGitHub("size", { missing: true })
    expect(await Effect.runPromise(steps.inspect(await request("octocat", "Hidden")))).toMatchObject({
      outcome: "failed",
      failure: "not_found",
    })
  })

  test("Import, Pull and AwaitSync: transient failures retry with Code Storage's wait; the rest are refused", async () => {
    const provider = scripted()
    const steps = await stepsOf(provider)
    const target = { id: "github/a/b", owner: "a", name: "b", defaultBranch: "main" }
    expect(failureOf(await Effect.runPromiseExit(steps.importRepo({ ...target, defaultBranch: null })))).toBeInstanceOf(
      RepoClone.CloneRefused,
    )
    provider.fail("createRepo", provider.error("createRepo", "rate_limited", 429, { retryAfterMillis: 2_000 }))
    expect(failureOf(await Effect.runPromiseExit(steps.importRepo(target)))).toMatchObject({
      _tag: "@smthrs/mvp/repo/CloneUnavailable",
      retryAfterMillis: 2_000,
    })
    provider.fail("createRepo", provider.error("createRepo", "internal_error", 500))
    expect(failureOf(await Effect.runPromiseExit(steps.importRepo(target)))).toEqual(new RepoClone.CloneUnavailable({}))
    expect(await Effect.runPromise(steps.importRepo(target))).toEqual({ created: true })

    provider.fail("pullUpstream", provider.error("pullUpstream", "sync_in_progress", 409))
    expect(await Effect.runPromise(steps.pull({ id: "github/a/b" }))).toEqual({})
    provider.fail("pullUpstream", provider.error("pullUpstream", "forbidden", 403))
    expect(failureOf(await Effect.runPromiseExit(steps.pull({ id: "github/a/b" })))).toBeInstanceOf(RepoClone.CloneRefused)

    const sync = { id: "github/a/b", defaultBranch: "main", requestedAt: Date.now() }
    expect(failureOf(await Effect.runPromiseExit(steps.awaitSync({ ...sync, defaultBranch: null })))).toBeInstanceOf(
      RepoClone.CloneRefused,
    )
    // Not pulled yet: the branch isn't there, so it waits, with no wait of Code Storage's.
    expect(failureOf(await Effect.runPromiseExit(steps.awaitSync(sync)))).toEqual(new RepoClone.SyncPending({}))
    provider.fail("listCommits", provider.error("listCommits", "forbidden", 403))
    expect(failureOf(await Effect.runPromiseExit(steps.awaitSync(sync)))).toBeInstanceOf(RepoClone.CloneRefused)
    // A branch with no commits listed yet waits too.
    const empty = RepoClone.steps({
      ...(await services(provider)),
      codeStorage: {
        ...provider.client,
        listCommits: () => Effect.succeed({ commits: [], nextCursor: undefined, bytesRead: 0 }),
      },
    })
    expect(failureOf(await Effect.runPromiseExit(empty.awaitSync(sync)))).toEqual(new RepoClone.SyncPending({}))
  })

  test("Settle: a Postgres that refuses is retried, logged by its code", async () => {
    const provider = scripted()
    const steps = await stepsOf(provider, { database: unreachable })
    const logs: Array<StructuredLog> = []
    const exit = await Effect.runPromiseExit(
      steps.settle({
        id: "github/a/b",
        cloneId: crypto.randomUUID(),
        inspection: RepoClone.INSPECTION_UNAVAILABLE,
        synced: { status: "skipped", head: null },
      }).pipe(Effect.provide(Logger.layer([Logger.make((log) => void logs.push(StructuredLogger.formatStructured.log(log)))]))),
    )
    expect(failureOf(exit)).toBeInstanceOf(RepoClone.CloneUnavailable)
    expect(logs.find((log) => log.message === "repo.clone.settle")!.annotations).toMatchObject({
      errorCode: expect.stringMatching(/^sql:/),
    })
  })

  test("how a clone ends, from Inspect and the sync", () => {
    const admitted = { ...RepoClone.INSPECTION_UNAVAILABLE, outcome: "admitted" as const, defaultBranch: "main", failure: null }
    expect(RepoClone.outcomeOf(admitted, { status: "timed_out", head: null })).toEqual({ status: "failed", failure: "timed_out" })
    expect(RepoClone.outcomeOf(admitted, { status: "unavailable", head: null })).toEqual({
      status: "failed",
      failure: "unavailable",
    })
  })
})
