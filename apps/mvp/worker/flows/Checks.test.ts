// A pull request head's checks (worker/flows/Checks.ts, decision 0012 decision 12) on the Node host's engine over this
// file's schema of the compose Postgres, against the scripted GitHub. The branch's machine is a test `Machines` over an
// in-memory checkout of the head, and the judge behind the review is a scripted model admitted and metered by the
// model endpoint's own `ModelEndpoint.local`: the only stand-ins. Each check is a `runs` row on the head's SHA.
import { Model, ModelError, type ModelEvent } from "@smthrs/model"
import type { SandboxTools } from "@smthrs/sandbox"
import { Effect, Exit, Layer, Redacted, Stream } from "effect"
import { beforeEach, describe, expect, test } from "vitest"
import * as Database from "../../db/Database.ts"
import { checkExecutionId } from "../../src/features/pulls/contract.ts"
import { Machines } from "../branch/Machines.ts"
import { judgeSeat, REPOSITORY, reset, services as githubServices, signedIn, sql } from "../github/test/fixtures.ts"
import { BOT_LOGIN, scriptedGitHub } from "../github/test/scriptedGitHub.ts"
import { runFlow } from "../test/flowHost.ts"
import { testFile } from "../test/harness.ts"
import * as Checks from "./Checks.ts"

const runtime = testFile("checks_run")
beforeEach(async () => {
  await reset(runtime)
  await sql(runtime, "TRUNCATE pulls, pull_commits, reviews, runs")
})

/** A machine whose checkout holds `files`, whose `sh <path>` exits with `exits[path]` (0 unless set). */
const machine = (files: Readonly<Record<string, string>>, exits: Readonly<Record<string, number>> = {}, sync = 0) => {
  const commands: Array<string> = []
  const service = Machines.of({
    tool: (_branch, _owner, _callId, call) => {
      const done = (result: SandboxTools.Result) => Effect.succeed({ result, generation: 1 })
      if (call.tool === "list") {
        const prefix = `${call.path}/`
        const names = Object.keys(files).filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length))
        if (names.length === 0) {
          return Effect.fail({ _tag: "@smthrs/sandbox/SandboxTools/ToolRefused", reason: "not_found" } as never)
        }
        return done({
          tool: "list",
          path: call.path!,
          entries: [...names.map((name) => ({ name, kind: "file" as const, bytes: 1 })), {
            name: "nested",
            kind: "directory" as const,
            bytes: 0,
          }],
          truncated: false,
        })
      }
      if (call.tool === "run") {
        commands.push(call.command)
        const path = call.command.replace(/^sh /, "")
        const exitCode = call.command.startsWith("git ") ? sync : exits[path] ?? 0
        return done({
          tool: "run",
          exitCode,
          timedOut: false,
          stdout: "",
          stderr: "",
          stdoutBytes: 0,
          stderrBytes: 0,
          truncated: false,
        })
      }
      return Effect.die(`checks never call ${call.tool}`)
    },
    sleepIfIdle: () => Effect.die("checks never put a machine to sleep"),
  })
  return { commands, layer: Layer.succeed(Machines, service) }
}

/** A judge that answers `text` once per call. */
const judge = (text: string) => () =>
  Stream.fromIterable<ModelEvent.ModelEvent>([
    { type: "text-delta", id: "t", text },
    { type: "usage", inputTokens: 30, outputTokens: 5 },
    { type: "settle", stopReason: "stop" },
  ])

/** A pull request from `feature` that adds a line to README.md, opened by the App; answers the request for its checks. */
const opened = async (github: ReturnType<typeof scriptedGitHub>, owner: { readonly personId: string }) => {
  const base = github.refs.get("main")!
  const head = github.push("smithers/t1-readme", { "README.md": "# Widgets\n\nA line\n" })
  const pull = github.openPull("smithers/t1-readme", "T1: README", BOT_LOGIN)
  return {
    repoId: REPOSITORY.id,
    sha: head,
    prNumber: pull.number,
    baseSha: base,
    attemptId: crypto.randomUUID(),
    branch: "smithers/t1-readme",
    ownerId: owner.personId,
  } satisfies Checks.ChecksRequest
}

const runs = () =>
  sql(runtime, `SELECT flow, status, sha, launched_by AS "launchedBy" FROM runs ORDER BY flow`) as unknown as Promise<
    Array<{ flow: string; status: string; sha: string; launchedBy: string }>
  >

describe("checks/Run", { timeout: 60_000 }, () => {
  test("runs each .smithers/checks script on the head, then the review, each a run on the head's SHA", async () => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    const maya = await signedIn(runtime, { login: "maya", token: github.userToken("maya") })
    const { seat, requests } = await judgeSeat(runtime, judge("- README.md: the line has no period."))
    const { services } = await githubServices(runtime, github, { judge: seat })
    const request = await opened(github, maya)
    const box = machine({ ".smithers/checks/readme.sh": "", ".smithers/checks/lint.sh": "", ".smithers/checks/x.txt": "" }, {
      ".smithers/checks/lint.sh": 1,
    })
    const ran = await runFlow(Checks.ChecksRun, request, Checks.registration({ ...services, judge: seat }).pipe(
      Layer.provide(box.layer),
    ), { executionId: checkExecutionId(request.repoId, request.sha, "all") })

    expect(ran.exit).toEqual(Exit.succeed({
      statuses: [
        { name: "lint", state: "failure", outcome: "sent" },
        { name: "readme", state: "success", outcome: "sent" },
        { name: "review", state: "success", outcome: "sent" },
      ],
    }))
    // Each check reports running, then its result, on the head as the App (GH-10); Smithers never reads one back.
    expect(github.statuses.get(request.sha)!.map(({ context, state, description, login }) => [context, state, description, login]))
      .toEqual([
        ["smithers/lint", "pending", "Running", BOT_LOGIN],
        ["smithers/readme", "pending", "Running", BOT_LOGIN],
        ["smithers/lint", "failure", "Failed", BOT_LOGIN],
        ["smithers/readme", "success", "Passed", BOT_LOGIN],
        ["smithers/review", "pending", "Running", BOT_LOGIN],
        ["smithers/lint", "failure", "Failed", BOT_LOGIN],
        ["smithers/readme", "success", "Passed", BOT_LOGIN],
        ["smithers/review", "success", "Passed", BOT_LOGIN],
      ])
    expect(github.shownStatuses(request.sha)).toEqual({
      "smithers/lint": "failure",
      "smithers/readme": "success",
      "smithers/review": "success",
    })
    expect(github.seen("GET", /statuses/)).toEqual([])
    // Its token may write commit statuses and nothing else.
    expect(github.minted.map(({ body }) => (body as { permissions: unknown }).permissions)).toContainEqual({ statuses: "write" })
    expect(await runs()).toEqual([
      { flow: "checks/lint", status: "failed", sha: request.sha, launchedBy: maya.personId },
      { flow: "checks/readme", status: "done", sha: request.sha, launchedBy: maya.personId },
      { flow: "checks/review", status: "done", sha: request.sha, launchedBy: maya.personId },
    ])
    expect(box.commands).toEqual([
      `git fetch --quiet origin 'smithers/t1-readme' && git reset --quiet --hard ${request.sha} && git clean -fdq`,
      "sh .smithers/checks/lint.sh",
      "sh .smithers/checks/readme.sh",
    ])
    // One comment review as the App, on the head, never an approval; its body names whom it acted for.
    const reviews = github.pulls.get(request.prNumber)!.reviews
    expect(reviews.map((review) => [review.event, review.login, review.commitId])).toEqual([["COMMENT", BOT_LOGIN, request.sha]])
    expect(reviews[0]!.body).toContain("- README.md: the line has no period.")
    expect(reviews[0]!.body).toContain("Reviewed by Smithers for @maya (review).")
    // The judge read the diff.
    expect(JSON.stringify(requests[0])).toContain("+A line")
    // The pull request's page shows the review from the projection.
    expect(await sql(runtime, `SELECT state, author_login AS "author", commit_sha AS "commitSha" FROM reviews`)).toEqual([
      { state: "COMMENTED", author: BOT_LOGIN, commitSha: request.sha },
    ])
  })

  test("with no checks directory only the review runs; a run again changes nothing", async () => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    const maya = await signedIn(runtime, { login: "maya", token: github.userToken("maya") })
    const { seat } = await judgeSeat(runtime, judge("No findings."))
    const { services } = await githubServices(runtime, github, { judge: seat })
    const request = await opened(github, maya)
    const registration = Checks.registration({ ...services, judge: seat }).pipe(Layer.provide(machine({}, {}, 128).layer))
    await runFlow(Checks.ChecksRun, request, registration)
    await runFlow(Checks.ChecksRun, request, registration)
    expect((await runs()).map(({ flow, status }) => [flow, status])).toEqual([["checks/review", "done"]])
    expect(github.pulls.get(request.prNumber)!.reviews).toHaveLength(1)
  })

  test("a judge that fails, or answers nothing, fails the review check and posts nothing", async () => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    const maya = await signedIn(runtime, { login: "maya", token: github.userToken("maya") })
    const { seat } = await judgeSeat(runtime, judge("   "))
    const { services } = await githubServices(runtime, github, { judge: seat })
    const request = await opened(github, maya)
    const ran = await runFlow(Checks.ChecksRun, request, Checks.registration({ ...services, judge: seat }).pipe(
      Layer.provide(machine({}).layer),
    ))
    expect(ran.exit).toEqual(Exit.succeed({ statuses: [{ name: "review", state: "failure", outcome: "sent" }] }))
    expect(github.shownStatuses(request.sha)).toEqual({ "smithers/review": "failure" })
    expect(await runs()).toEqual([{ flow: "checks/review", status: "failed", sha: request.sha, launchedBy: maya.personId }])
    expect(github.pulls.get(request.prNumber)!.reviews).toHaveLength(0)
  })

  test("without the App, the review fails, and the scripts still run", async () => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    const maya = await signedIn(runtime, { login: "maya", token: github.userToken("maya") })
    const { seat } = await judgeSeat(runtime, judge("x"))
    const { services } = await githubServices(runtime, github, { judge: seat })
    const request = await opened(github, maya)
    github.installed = false
    await runFlow(Checks.ChecksRun, request, Checks.registration({ ...services, judge: seat }).pipe(
      Layer.provide(machine({ ".smithers/checks/a.sh": "" }).layer),
    ))
    expect((await runs()).map(({ flow, status }) => [flow, status])).toEqual([["checks/a", "done"], ["checks/review", "failed"]])
    // No App, no token: no status is sent, and the runs keep the results.
    expect(github.statuses.size).toBe(0)
  })

  test("a judge the provider refuses fails the review check and posts nothing", async () => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    const maya = await signedIn(runtime, { login: "maya", token: github.userToken("maya") })
    const { seat } = await judgeSeat(runtime, () =>
      Stream.fail(new ModelError.ModelError({ code: "content_policy", message: "refused" })))
    const { services } = await githubServices(runtime, github, { judge: seat })
    const request = await opened(github, maya)
    const ran = await runFlow(Checks.ChecksRun, request, Checks.registration({ ...services, judge: seat }).pipe(
      Layer.provide(machine({}).layer),
    ))
    expect(ran.exit).toEqual(Exit.succeed({ statuses: [{ name: "review", state: "failure", outcome: "sent" }] }))
    expect(github.pulls.get(request.prNumber)!.reviews).toHaveLength(0)
  })

  test("a branch or head that isn't one syncs nothing; a check the machine can't run fails; an unknown owner is named so", async () => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    const { seat } = await judgeSeat(runtime, judge("- a finding"))
    const { services } = await githubServices(runtime, github, { judge: seat })
    const request = { ...(await opened(github, { personId: crypto.randomUUID() })), branch: "not a branch" }
    const commands: Array<string> = []
    const box = Machines.of({
      tool: (_branch, _owner, _callId, call) => {
        if (call.tool === "list") {
          return Effect.succeed({
            result: { tool: "list", path: call.path!, entries: [{ name: "a.sh", kind: "file", bytes: 1 }], truncated: false },
            generation: 1,
          })
        }
        if (call.tool === "run" && call.command === "false") {
          commands.push(call.command)
          return Effect.succeed({
            result: {
              tool: "run",
              exitCode: 1,
              timedOut: false,
              stdout: "",
              stderr: "",
              stdoutBytes: 0,
              stderrBytes: 0,
              truncated: false,
            },
            generation: 1,
          })
        }
        return Effect.fail({ _tag: "@smthrs/mvp/branch/SandboxUnavailable" } as never)
      },
      sleepIfIdle: () => Effect.die("checks never put a machine to sleep"),
    })
    await runFlow(Checks.ChecksRun, request, Checks.registration({ ...services, judge: seat }).pipe(
      Layer.provide(Layer.succeed(Machines, box)),
    ))
    expect(commands).toEqual(["false"])
    expect((await runs()).map(({ flow, status }) => [flow, status])).toEqual([["checks/a", "failed"], ["checks/review", "done"]])
    expect(github.pulls.get(request.prNumber)!.reviews[0]!.body).toContain("Reviewed by Smithers for @unknown (review).")
  })

  test("Postgres down fails the scripts step for its retry policy", async () => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    const { seat } = await judgeSeat(runtime, judge("x"))
    const { services } = await githubServices(runtime, github, { judge: seat })
    const request = await opened(github, { personId: "p" })
    const unreachable = Database.layer(Effect.succeed(Redacted.make("postgresql://smithers:smithers@127.0.0.1:1/smithers")))
    const exit = await Effect.runPromise(
      Effect.exit(Checks.steps({ ...services, judge: seat, database: unreachable }).scripts({ request })).pipe(
        Effect.provide(machine({ ".smithers/checks/a.sh": "" }).layer),
      ),
    )
    expect(exit._tag === "Failure" && String(exit.cause)).toContain("ChecksUnavailable")
  })

  test("a review whose answer was lost is found by its marker, not posted twice", async () => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    const maya = await signedIn(runtime, { login: "maya", token: github.userToken("maya") })
    const { seat } = await judgeSeat(runtime, judge("- one finding"))
    const { services } = await githubServices(runtime, github, { judge: seat })
    const request = await opened(github, maya)
    github.faults.push({ match: (method, path) => method === "POST" && path.endsWith("/reviews"), lost: true })
    await runFlow(Checks.ChecksRun, request, Checks.registration({ ...services, judge: seat }).pipe(
      Layer.provide(machine({}).layer),
    ))
    expect(github.pulls.get(request.prNumber)!.reviews).toHaveLength(1)
    expect((await runs()).map(({ status }) => status)).toEqual(["done"])
  })
})

describe("checks/Run's commit statuses (GH-10)", { timeout: 60_000 }, () => {
  const statusWrite = (method: string, path: string) => method === "POST" && path.includes("/statuses/")

  test("without the Commit statuses permission every check still runs; each status is refused once and counted, never retried", async () => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    github.statusesGranted = false
    const maya = await signedIn(runtime, { login: "maya", token: github.userToken("maya") })
    const { seat } = await judgeSeat(runtime, judge("No findings."))
    const { services } = await githubServices(runtime, github, { judge: seat })
    const request = await opened(github, maya)
    const ran = await runFlow(Checks.ChecksRun, request, Checks.registration({ ...services, judge: seat }).pipe(
      Layer.provide(machine({ ".smithers/checks/lint.sh": "" }).layer),
    ))
    expect(ran.exit).toEqual(Exit.succeed({
      statuses: [
        { name: "lint", state: "success", outcome: "refused" },
        { name: "review", state: "success", outcome: "refused" },
      ],
    }))
    expect((await runs()).map(({ flow, status }) => [flow, status])).toEqual([["checks/lint", "done"], ["checks/review", "done"]])
    expect(github.statuses.size).toBe(0)
    expect(github.seen("POST", /statuses/)).toEqual([])
  })

  test("a commit GitHub doesn't have refuses the report, and the runs keep the results", async () => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    const maya = await signedIn(runtime, { login: "maya", token: github.userToken("maya") })
    const { seat } = await judgeSeat(runtime, judge("No findings."))
    const { services } = await githubServices(runtime, github, { judge: seat })
    const request = await opened(github, maya)
    const report = await Effect.runPromise(
      Checks.steps({ ...services, judge: seat }).report({ request: { ...request, sha: "f".repeat(40) }, after: "scripts" }),
    )
    expect(report).toEqual({ statuses: [] })
    await sql(runtime, `INSERT INTO runs (id, flow, status, launched_by, repo_id, sha)
      VALUES (gen_random_uuid(), 'checks/lint', 'done', '${maya.personId}', '${request.repoId}', '${"f".repeat(40)}')`)
    expect(
      await Effect.runPromise(
        Checks.steps({ ...services, judge: seat }).report({ request: { ...request, sha: "f".repeat(40) }, after: "scripts" }),
      ),
    ).toEqual({ statuses: [{ name: "lint", state: "success", outcome: "refused" }] })
    expect(github.statuses.size).toBe(0)
  })

  test("GitHub's 502 drops a pending status and fails the report for its retry policy; retried, the head shows each result", async () => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    const maya = await signedIn(runtime, { login: "maya", token: github.userToken("maya") })
    const { seat } = await judgeSeat(runtime, judge("No findings."))
    const { services } = await githubServices(runtime, github, { judge: seat })
    const request = await opened(github, maya)
    // The first status write is lint's pending, dropped; the second is the scripts' report, which the engine retries.
    github.faults.push({ match: statusWrite, status: 502 }, { match: statusWrite, status: 502 })
    const ran = await runFlow(Checks.ChecksRun, request, Checks.registration({ ...services, judge: seat }).pipe(
      Layer.provide(machine({ ".smithers/checks/lint.sh": "" }, { ".smithers/checks/lint.sh": 2 }).layer),
    ))
    expect(Exit.isSuccess(ran.exit)).toBe(true)
    expect(github.statuses.get(request.sha)!.map(({ context, state }) => `${context} ${state}`)).toEqual([
      "smithers/lint failure",
      "smithers/review pending",
      "smithers/lint failure",
      "smithers/review success",
    ])
    expect(github.shownStatuses(request.sha)).toEqual({ "smithers/lint": "failure", "smithers/review": "success" })
  })

  test("a report whose answer was lost fails for its retry policy; sent again, it says the same thing", async () => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    const maya = await signedIn(runtime, { login: "maya", token: github.userToken("maya") })
    const { seat } = await judgeSeat(runtime, judge("No findings."))
    const { services } = await githubServices(runtime, github, { judge: seat })
    const request = await opened(github, maya)
    await sql(runtime, `INSERT INTO runs (id, flow, status, launched_by, repo_id, sha)
      VALUES (gen_random_uuid(), 'checks/lint', 'failed', '${maya.personId}', '${request.repoId}', '${request.sha}')`)
    github.faults.push({ match: statusWrite, lost: true })
    const steps = Checks.steps({ ...services, judge: seat })
    const first = await Effect.runPromise(Effect.exit(steps.report({ request, after: "scripts" })))
    expect(first._tag === "Failure" && String(first.cause)).toContain("ChecksUnavailable")
    expect(await Effect.runPromise(steps.report({ request, after: "scripts" }))).toEqual({
      statuses: [{ name: "lint", state: "failure", outcome: "sent" }],
    })
    expect(github.statuses.get(request.sha)!.map(({ state }) => state)).toEqual(["failure", "failure"])
    expect(github.shownStatuses(request.sha)).toEqual({ "smithers/lint": "failure" })
    // GitHub failing to mint the token fails the report for its retry policy too.
    github.faults.push({ match: (method, path) => method === "POST" && path.endsWith("/access_tokens"), status: 502 })
    const unminted = await Effect.runPromise(Effect.exit(steps.report({ request, after: "review" })))
    expect(unminted._tag === "Failure" && String(unminted.cause)).toContain("ChecksUnavailable")
    expect(github.statuses.get(request.sha)).toHaveLength(2)
  })

  test("each head's statuses are its own: a newer head starts with none, and an older head's failure never shows on it", async () => {
    const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
    const maya = await signedIn(runtime, { login: "maya", token: github.userToken("maya") })
    const { seat } = await judgeSeat(runtime, judge("No findings."))
    const { services } = await githubServices(runtime, github, { judge: seat })
    const older = await opened(github, maya)
    await runFlow(Checks.ChecksRun, older, Checks.registration({ ...services, judge: seat }).pipe(
      Layer.provide(machine({ ".smithers/checks/lint.sh": "" }, { ".smithers/checks/lint.sh": 1 }).layer),
    ), { executionId: checkExecutionId(older.repoId, older.sha, "all") })
    const newer = { ...older, sha: github.push("smithers/t1-readme", { "README.md": "# Widgets\n\nA line.\n" }) }
    expect(github.shownStatuses(newer.sha)).toEqual({})
    await runFlow(Checks.ChecksRun, newer, Checks.registration({ ...services, judge: seat }).pipe(
      Layer.provide(machine({ ".smithers/checks/lint.sh": "" }).layer),
    ), { executionId: checkExecutionId(newer.repoId, newer.sha, "all") })
    expect(github.shownStatuses(older.sha)).toEqual({ "smithers/lint": "failure", "smithers/review": "success" })
    expect(github.shownStatuses(newer.sha)).toEqual({ "smithers/lint": "success", "smithers/review": "success" })
  })

  test("a check run's status is GitHub's: passed is success, anything else failure; the words are the Checks tab's", () => {
    expect([Checks.statusStateOf("done"), Checks.statusStateOf("failed")]).toEqual(["success", "failure"])
    expect(Checks.STATUS_DESCRIPTIONS).toEqual({ pending: "Running", success: "Passed", failure: "Failed" })
  })
})

describe("the review's text", () => {
  test("drops mentions and links from the findings, and says whom it acted for", () => {
    expect(Checks.reviewBodyOf(" - ping @everyone, see https://x.test/a ", "maya")).toBe(
      "- ping @​everyone, see (link removed)\n\nReviewed by Smithers for @maya (review).",
    )
  })

  test("the judge reads each file's patch, within the budget; a binary file says so", () => {
    const request = Checks.reviewRequest([
      { filename: "a.md", status: "modified", additions: 1, deletions: 0, patch: "+a" },
      { filename: "b.png", status: "added", additions: 0, deletions: 0 },
    ])
    const text = JSON.stringify(request.messages)
    expect(text).toContain("--- a.md (modified, +1 -0)\\n+a")
    expect(text).toContain("--- b.png (added, +0 -0)\\n(no textual diff)")
    const huge = Checks.reviewRequest([
      { filename: "big.md", status: "modified", additions: 1, deletions: 0, patch: "x".repeat(Checks.MAX_REVIEW_DIFF_CHARS + 10) },
      { filename: "late.md", status: "modified", additions: 1, deletions: 0, patch: "+late" },
    ])
    const hugeText = JSON.stringify(huge.messages)
    expect(hugeText).not.toContain("+late")
    expect(hugeText).toContain("--- late.md")
  })
})
