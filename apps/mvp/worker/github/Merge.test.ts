// A person's merge (worker/github/Merge.ts, decision 0012 decision 6) on the Node host's engine over this file's schema
// of the compose Postgres, against the scripted GitHub: the write is admitted as the writes route admits it, then
// `pr/Merge` rechecks what the person saw and merges with their own token, or settles why not.
import { Cause, Effect, Exit, Metric, Redacted } from "effect"
import { beforeEach, describe, expect, test } from "vitest"
import * as Database from "../../db/Database.ts"
import { mergeExecutionId } from "../../src/features/pulls/contract.ts"
import { runFlow } from "../test/flowHost.ts"
import { testFile } from "../test/harness.ts"
import * as Merge from "./Merge.ts"
import * as Metrics from "./Metrics.ts"
import { TokenUnavailable } from "./Tokens.ts"
import * as Write from "./Write.ts"
import { admit, REPOSITORY, reset, services, signedIn, sql, writeRow } from "./test/fixtures.ts"
import { BOT_LOGIN, type ScriptedGitHub, scriptedGitHub } from "./test/scriptedGitHub.ts"

const runtime = testFile("github_merge")
beforeEach(async () => {
  await reset(runtime)
  await sql(runtime, "TRUNCATE pulls, pull_commits, reviews")
})

/** A pull request that adds a line to README.md, opened by the App; with what a person's page shows of it. */
const opened = (github: ScriptedGitHub) => {
  const baseSha = github.refs.get("main")!
  const headSha = github.push("smithers/t1-readme", { "README.md": "# Widgets\n\nA line\n" })
  const pull = github.openPull("smithers/t1-readme", "T1: README", BOT_LOGIN)
  return { number: pull.number, headSha, baseSha }
}

/** Maya, a Maintainer signed in, and her merge of `seen`, admitted. */
const merging = async (github: ScriptedGitHub, seen: ReturnType<typeof opened>, sessionId?: string | null) => {
  const maya = await signedIn(runtime, { login: "maya", token: github.userToken("maya") })
  const writeId = await admit(runtime, {
    actorId: maya.personId,
    sessionId: sessionId === undefined ? maya.sessionId : sessionId,
    via: "person",
    payload: { op: "pr/merge", number: seen.number, headSha: seen.headSha, baseSha: seen.baseSha, method: "squash" },
  })
  return { maya, writeId }
}

const run = async (github: ScriptedGitHub, writeId: string) => {
  const { services: built } = await services(runtime, github)
  return runFlow(Merge.Merge, { writeId }, Merge.registration(built), { executionId: mergeExecutionId(writeId) })
}

describe("pr/Merge", { timeout: 60_000 }, () => {
  test("a person's merge squashes the head they saw onto main, as them, and settles with the pull request merged", async () => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    const seen = opened(github)
    const { writeId } = await merging(github, seen)
    const ran = await run(github, writeId)
    const pull = github.pulls.get(seen.number)!
    expect(ran.exit).toEqual(Exit.succeed({ status: "done", mergeSha: pull.mergeSha }))
    expect([pull.merged, pull.mergedBy]).toEqual([true, "maya"])
    expect(github.commits.get(github.refs.get("main")!)!.message).toBe(`T1: README (#${seen.number})`)
    expect(github.tree("main").get("README.md")).toBe("# Widgets\n\nA line\n")
    expect(github.seen("PUT", /\/merge$/).map((call) => call.token)).toEqual(["user"])
    expect(await writeRow(runtime, writeId)).toMatchObject({ status: "done", itemNumber: seen.number })
    expect(await sql(runtime, `SELECT merged, merged_by AS "by" FROM pulls`)).toEqual([{ merged: true, by: "maya" }])
  })

  /** What changes on GitHub after the person saw the pull request. */
  type Change = (github: ScriptedGitHub, number: number) => void
  test.each<readonly [string, Change]>([
    ["head_moved", (github) => void github.push("smithers/t1-readme", { "B.md": "b\n" })],
    // The scripted GitHub reports a pull request's base as its base branch's head, so main moving moves it.
    ["base_moved", (github) => void github.push("main", { "C.md": "c\n" })],
    ["merged", (github, number) => void github.merge(number)],
    ["closed", (github, number) => github.close(number)],
    ["not_mergeable", (github) => void (github.unmergeable = true)],
  ])("refuses %s: nothing merged, the write settled refused", async (failure, change) => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    const seen = opened(github)
    const { writeId } = await merging(github, seen)
    change(github, seen.number)
    const moved = github.refs.get("main")
    const ran = await run(github, writeId)
    expect(ran.exit).toEqual(Exit.succeed({ status: "refused", mergeSha: null }))
    expect(await writeRow(runtime, writeId)).toMatchObject({ status: "refused", failure })
    expect(github.refs.get("main")).toBe(moved)
  })

  test("a draft is refused draft", async () => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    const seen = opened(github)
    github.pulls.set(seen.number, { ...github.pulls.get(seen.number)!, draft: true })
    const { writeId } = await merging(github, seen)
    await run(github, writeId)
    expect(await writeRow(runtime, writeId)).toMatchObject({ status: "refused", failure: "draft" })
  })

  test("a merge whose answer was lost is read back: merged at that head is this merge, done once", async () => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    const seen = opened(github)
    const { writeId } = await merging(github, seen)
    github.faults.push({ match: (method, path) => method === "PUT" && path.endsWith("/merge"), lost: true })
    const ran = await run(github, writeId)
    expect(ran.exit).toEqual(Exit.succeed({ status: "done", mergeSha: github.pulls.get(seen.number)!.mergeSha }))
    expect(github.seen("PUT", /\/merge$/)).toHaveLength(1)
    expect(await writeRow(runtime, writeId)).toMatchObject({ status: "done", attempts: 1 })
  })

  test("a session that ended is sign_in_required; a write with no session is too", async () => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    const seen = opened(github)
    const { maya, writeId } = await merging(github, seen)
    await sql(runtime, `UPDATE sessions SET revoked_at = now() WHERE id = '${maya.sessionId}'`)
    await run(github, writeId)
    expect(await writeRow(runtime, writeId)).toMatchObject({ status: "refused", failure: "sign_in_required" })
    expect(github.seen("PUT", /\/merge$/)).toHaveLength(0)
  })

  test("GitHub's other refusals: a revoked token, a pull request it no longer has", async () => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    const seen = opened(github)
    const { writeId } = await merging(github, seen)
    github.faults.push({ match: (method, path) => method === "GET" && path.endsWith(`/pulls/${seen.number}`), status: 404 })
    await run(github, writeId)
    expect(await writeRow(runtime, writeId)).toMatchObject({ status: "refused", failure: "not_found" })
  })

  test("a run started again after it settled answers what it settled; an unknown write is missing", async () => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    const seen = opened(github)
    const { writeId } = await merging(github, seen)
    await run(github, writeId)
    const again = await run(github, writeId)
    expect(again.exit).toEqual(Exit.succeed({ status: "done", mergeSha: null }))
    expect(github.seen("PUT", /\/merge$/)).toHaveLength(1)
    const missing = await run(github, crypto.randomUUID())
    expect(missing.exit).toEqual(Exit.succeed({ status: "missing", mergeSha: null }))
  })

  test("giving up settles the write failed unavailable", async () => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    const seen = opened(github)
    const { writeId } = await merging(github, seen)
    const { services: built } = await services(runtime, github)
    const settled = await runtime.runPromise(Merge.steps(built).giveUp({ writeId }))
    expect(settled).toEqual({ status: "failed", mergeSha: null })
    expect(await writeRow(runtime, writeId)).toMatchObject({ status: "failed", failure: "unavailable" })
    expect(await runtime.runPromise(Merge.steps(built).giveUp({ writeId: crypto.randomUUID() }))).toEqual({
      status: "missing",
      mergeSha: null,
    })
  })

  test("a merge row with no person's session, which the route never admits, is sign_in_required; nothing reaches GitHub", async () => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    const seen = opened(github)
    const writeId = await admit(runtime, {
      actorId: "agent",
      sessionId: null,
      via: "agent",
      payload: { op: "pr/merge", number: seen.number, headSha: seen.headSha, baseSha: seen.baseSha, method: "squash" },
    })
    await run(github, writeId)
    expect(await writeRow(runtime, writeId)).toMatchObject({ status: "refused", failure: "sign_in_required" })
    expect(github.seen("PUT", /\/merge$/)).toHaveLength(0)
  })

  describe("a step that can't finish now is tried again, keeping the wait it was told", () => {
    const unreachable = Database.layer(Effect.succeed(Redacted.make("postgresql://smithers:smithers@127.0.0.1:1/smithers")))
    /** Step `send` once over `built`: the wait of the `MergeUnavailable` it failed with, `none` for none. */
    const sendOnce = async (built: Awaited<ReturnType<typeof services>>["services"], writeId: string) => {
      const exit = await runtime.runPromise(Effect.exit(Merge.steps(built).send({ writeId })))
      const error = exit._tag === "Failure" ? Cause.squash(exit.cause) : undefined
      if (!(error instanceof Merge.MergeUnavailable)) throw new Error(`send didn't fail MergeUnavailable: ${String(error)}`)
      return error.retryAfterMillis ?? "none"
    }

    test("a token being refreshed waits as told; a token GitHub or Postgres couldn't give waits the policy's time", async () => {
      const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
      const { writeId } = await merging(github, opened(github))
      const { services: built } = await services(runtime, github)
      const failing = (failure: TokenUnavailable) => ({ ...built, tokens: { ...built.tokens, forSession: () => Effect.fail(failure) } })
      expect(await sendOnce(failing(new TokenUnavailable({ reason: "refreshing", retryAfterMillis: 5_000 })), writeId))
        .toBe(5_000)
      expect(await sendOnce(failing(new TokenUnavailable({ reason: "unavailable" })), writeId)).toBe("none")
      expect(await writeRow(runtime, writeId)).toMatchObject({ status: "pending" })
    })

    test("GitHub down waits the policy's time, and GitHub's rate limit waits as GitHub said", async () => {
      const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
      const seen = opened(github)
      const { writeId } = await merging(github, seen)
      const { services: built } = await services(runtime, github)
      const pull = (method: string, path: string) => method === "GET" && path.endsWith(`/pulls/${seen.number}`)
      github.faults.push({ match: pull, status: 502 })
      expect(await sendOnce(built, writeId)).toBe("none")
      github.faults.push({ match: pull, status: 429, headers: { "retry-after": "3" } })
      expect(await sendOnce(built, writeId)).toBe(3_000)
      expect(github.seen("PUT", /\/merge$/)).toHaveLength(0)
    })

    test("Postgres down fails send and give-up alike, as unavailable", async () => {
      const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
      const { writeId } = await merging(github, opened(github))
      const { services: built } = await services(runtime, github)
      const down = { ...built, database: unreachable }
      expect(await sendOnce(down, writeId)).toBe("none")
      const gaveUp = await runtime.runPromise(Effect.exit(Merge.steps(down).giveUp({ writeId })))
      expect(gaveUp._tag === "Failure" && String(gaveUp.cause)).toContain("MergeUnavailable")
      expect(await writeRow(runtime, writeId)).toMatchObject({ status: "pending" })
    })
  })

  test("merged without the App's read-back settles done, and its row waits for the webhook", async () => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    const seen = opened(github)
    const { writeId } = await merging(github, seen)
    const { services: built } = await services(runtime, github)
    const noApp = {
      ...built,
      tokens: { ...built.tokens, forInstallation: () => Effect.fail(new TokenUnavailable({ reason: "app_not_installed" })) },
    }
    const merged = await runtime.runPromise(Merge.steps(noApp).send({ writeId }))
    expect(merged).toEqual({ status: "done", mergeSha: github.pulls.get(seen.number)!.mergeSha })
    expect(await writeRow(runtime, writeId)).toMatchObject({ status: "done" })
    expect(await sql(runtime, `SELECT number FROM pulls`)).toEqual([])
  })

  test("giving up on a write already settled changes nothing", async () => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    const seen = opened(github)
    const { writeId } = await merging(github, seen)
    await run(github, writeId)
    const { services: built } = await services(runtime, github)
    await runtime.runPromise(Merge.steps(built).giveUp({ writeId }))
    expect(await writeRow(runtime, writeId)).toMatchObject({ status: "done" })
  })

  test("github/Write never runs a merge: a merge write handed to it settles refused, and nothing merges", async () => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    const { writeId } = await merging(github, opened(github))
    const { services: built } = await services(runtime, github)
    const ran = await runFlow(Write.Write, { writeId }, Write.registration(built), { maxConnections: 2 })
    expect(ran.exit).toEqual(Exit.succeed({ status: "refused", itemNumber: null }))
    expect(await writeRow(runtime, writeId)).toMatchObject({ status: "refused", failure: "invalid" })
    expect(github.seen("PUT", /\/merge$/)).toHaveLength(0)
  })

  test("GitHub's statuses as a merge's refusal", () => {
    expect([405, 409, 401, 404, 422, 403].map(Merge.refusalOf)).toEqual([
      "not_mergeable",
      "head_moved",
      "sign_in_required",
      "not_found",
      "invalid",
      "not_allowed",
    ])
  })
})


test("a failed preflight read cannot claim another person's subsequent merge", async () => {
  const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
  const seen = opened(github)
  const { writeId } = await merging(github, seen)
  const { services: built } = await services(runtime, github)
  github.faults.push({ match: (method, path) => method === "GET" && path.endsWith(`/pulls/${seen.number}`), status: 502 })
  await runtime.runPromise(Effect.exit(Merge.steps(built).send({ writeId })))
  expect(github.seen("PUT", /\/merge$/)).toHaveLength(0)
  github.merge(seen.number)
  expect(await runtime.runPromise(Merge.steps(built).send({ writeId }))).toEqual({ status: "refused", mergeSha: null })
  expect(await writeRow(runtime, writeId)).toMatchObject({ status: "refused", failure: "merged" })
})

test("projection failure after GitHub merged cannot turn success into a failed write", async () => {
  const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
  const seen = opened(github)
  const { writeId } = await merging(github, seen)
  const { services: built } = await services(runtime, github)
  const registry: Metric.MetricRegistry = new Map()
  // A real database constraint fails only projection; admission and settlement remain usable.
  await sql(runtime, "ALTER TABLE pulls ADD CONSTRAINT reject_projection CHECK (number < 0)")
  try {
    await runtime.runPromise(Effect.exit(Merge.steps(built).send({ writeId })).pipe(
      Effect.provideService(Metric.MetricRegistry, registry),
    ))
    const failures = await runtime.runPromise(Metric.value(Metric.withAttributes(Metrics.projectionFailures, { op: "pr/merge" })).pipe(
      Effect.provideService(Metric.MetricRegistry, registry),
    ))
    expect(failures.count).toBe(1)
    expect(github.pulls.get(seen.number)!.merged).toBe(true)
    await runtime.runPromise(Merge.steps(built).giveUp({ writeId }))
    expect(await writeRow(runtime, writeId)).toMatchObject({ status: "done" })
  } finally {
    await sql(runtime, "ALTER TABLE pulls DROP CONSTRAINT reject_projection")
  }
})

test.each(["octocat", "maya"])("a definitive merge refusal cannot recover a later merge by %s", async (login) => {
  const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
  const seen = opened(github)
  const { writeId } = await merging(github, seen)
  const { services: built } = await services(runtime, github)
  github.faults.push({ match: (method, path) => method === "PUT" && path.endsWith("/merge"), status: 429, headers: { "retry-after": "1" } })
  const sent = await runtime.runPromise(Effect.exit(Merge.steps(built).send({ writeId })))
  expect(sent._tag).toBe("Failure")
  expect(github.seen("PUT", /\/merge$/)).toHaveLength(1)
  github.merge(seen.number, login)
  expect(await runtime.runPromise(Merge.steps(built).send({ writeId }))).toEqual({ status: "refused", mergeSha: null })
  expect(await writeRow(runtime, writeId)).toMatchObject({ status: "refused", failure: "merged" })
})


test("a malformed successful merge response retains recovery of the person's actual merge", async () => {
  const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
  const seen = opened(github)
  const { writeId } = await merging(github, seen)
  const { services: built } = await services(runtime, github)
  github.faults.push({ match: (method, path) => method === "PUT" && path.endsWith("/merge"), malformed: true })
  expect((await runtime.runPromise(Effect.exit(Merge.steps(built).send({ writeId }))))._tag).toBe("Failure")
  expect(github.pulls.get(seen.number)!.merged).toBe(true)
  expect(await runtime.runPromise(Merge.steps(built).send({ writeId }))).toEqual({ status: "done", mergeSha: github.pulls.get(seen.number)!.mergeSha })
  expect(github.seen("PUT", /\/merge$/)).toHaveLength(1)
})

test("an unknown merge outcome cannot claim a different GitHub person's merge", async () => {
  const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
  const seen = opened(github)
  const { writeId } = await merging(github, seen)
  const { services: built } = await services(runtime, github)
  github.faults.push({ match: (method, path) => method === "PUT" && path.endsWith("/merge"), status: 503 })
  expect((await runtime.runPromise(Effect.exit(Merge.steps(built).send({ writeId }))))._tag).toBe("Failure")
  expect(await sql(runtime, `SELECT merge_unknown FROM github_writes WHERE id = '${writeId}'`)).toEqual([{ merge_unknown: true }])
  github.merge(seen.number, "octocat")
  expect(await runtime.runPromise(Merge.steps(built).send({ writeId }))).toEqual({ status: "refused", mergeSha: null })
  expect(await writeRow(runtime, writeId)).toMatchObject({ status: "refused", failure: "merged" })
})
