// The `todo` run (worker/flows/Todo.ts, decision 0016's factory simplified) on the Node host's engine over this file's
// schema of the compose Postgres (`pnpm db:up`), against the scripted GitHub on the `HttpClient` seam. Two stand-ins,
// each a seam the run takes as an Effect service: the branch's machine is a test `Machines` over an in-memory working
// copy of the branch it checks out, and the model behind the agent's `agent` seat is scripted, while its admission and
// metering are the model endpoint's own (`ModelEndpoint.local`). The writer, the engine, the GitHub client, the tokens
// and the projection are the real ones.
import { Agent } from "@smthrs/agent"
import { Model, type ModelEvent } from "@smthrs/model"
import { HostModel } from "@smthrs/model-host"
import type { SandboxTools } from "@smthrs/sandbox"
import { Cause, ConfigProvider, Context, Effect, Exit, Layer, Option, Redacted, Stream } from "effect"
import { beforeEach, describe, expect, test } from "vitest"
import * as Database from "../../db/Database.ts"
import * as TestDatabase from "../../db/TestDatabase.ts"
import { checkExecutionId, todoExecutionId } from "../../src/features/pulls/contract.ts"
import { Machines } from "../branch/Machines.ts"
import { REPOSITORY, reset, services as githubServices, sql } from "../github/test/fixtures.ts"
import { BOT_LOGIN, type ScriptedGitHub, scriptedGitHub } from "../github/test/scriptedGitHub.ts"
import * as ModelEndpoint from "../ModelEndpoint.ts"
import * as Stack from "../stack/Stack.ts"
import { runFlow } from "../test/flowHost.ts"
import { testFile } from "../test/harness.ts"
import { ChecksRun } from "./Checks.ts"
import * as Todo from "./Todo.ts"
import * as TodoAgent from "./TodoAgent.ts"
import * as TodoMachine from "./TodoMachine.ts"

const runtime = testFile("todo_run")
beforeEach(async () => {
  await reset(runtime)
  await sql(runtime, "TRUNCATE stack_ops, todo_attempts, todo_requests, todos, stacks, pulls, pull_commits, reviews, runs")
})

const maya = { id: "person-maya", login: "maya" }

const database = () => runtime.runPromise(Effect.map(Effect.service(TestDatabase.Scratch), (scratch) => scratch.database))

/** Commits a TODO on a host that runs TODOs, as a person's press does; answers its first attempt's start. */
const commit = (title: string, prompt: string, issue?: number) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const opId = crypto.randomUUID()
      const applied = yield* Stack.apply({
        opId,
        repoId: REPOSITORY.id,
        actor: maya,
        via: "person",
        op: { kind: "commit", title, prompt, acceptance: [], ...(issue === undefined ? {} : { issue }) },
      }, { runs: true })
      return applied.kind === "applied" ? applied.receipt.starts[0] : undefined
    }),
  )

/** A TODO's row. */
const todo = async (number = 1) =>
  ((await sql(
    runtime,
    `SELECT state, step, branch, base_sha AS "baseSha", head_sha AS "headSha", pr_number AS "prNumber", failure, note,
      merge_sha AS "mergeSha", position FROM todos WHERE repo_id = '${REPOSITORY.id}' AND number = ${number}`,
  )) as unknown as Array<Record<string, unknown>>)[0]!

/** The machine: one in-memory working copy per branch machine, cloned from the branch's head on GitHub on first use. */
const machines = (github: ScriptedGitHub, run: (command: string) => number = () => 0) => {
  const copies = new Map<string, { readonly initial: Map<string, string>; readonly files: Map<string, string> }>()
  const calls: Array<{ readonly branchId: string; readonly branch: string; readonly ownerId: string; readonly callId: string; readonly tool: string }> = []
  const service = Machines.of({
    tool: (branch, ownerId, callId, call) =>
      Effect.suspend(() => {
        calls.push({ branchId: branch.branchId, branch: branch.branch, ownerId, callId, tool: call.tool })
        let copy = copies.get(branch.branchId)
        if (copy === undefined) {
          const files = new Map(github.tree(branch.branch))
          copy = { initial: new Map(files), files }
          copies.set(branch.branchId, copy)
        }
        const { initial, files } = copy
        const done = (result: SandboxTools.Result) => Effect.succeed({ result, generation: 1 })
        switch (call.tool) {
          case "write":
            files.set(call.path, call.content)
            return done({ tool: "write", path: call.path, bytes: call.content.length })
          case "read": {
            const content = files.get(call.path)
            if (content === undefined) {
              return Effect.fail({ _tag: "@smthrs/sandbox/SandboxTools/ToolRefused", reason: "not_found" } as never)
            }
            return done({ tool: "read", path: call.path, content, bytes: content.length, truncated: false })
          }
          case "status": {
            const paths = [...new Set([...initial.keys(), ...files.keys()])].sort()
            const entries = paths.flatMap((path) => {
              const before = initial.get(path)
              const after = files.get(path)
              if (before === after) return []
              if (before === undefined) return [{ path, index: "?", worktree: "?" }]
              if (after === undefined) return [{ path, index: " ", worktree: "D" }]
              return [{ path, index: " ", worktree: "M" }]
            })
            return done({ tool: "status", branch: branch.branch, entries })
          }
          case "list": {
            const prefix = call.path === undefined ? "" : `${call.path}/`
            const names = [...files.keys()].filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length))
              .filter((name) => !name.includes("/"))
            return done({
              tool: "list",
              path: call.path ?? ".",
              entries: names.map((name) => ({ name, kind: "file" as const, bytes: files.get(`${prefix}${name}`)!.length })),
              truncated: false,
            })
          }
          case "run": {
            const exitCode = run(call.command)
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
          case "diff":
            return done({ tool: "diff", diff: "", bytes: 0, truncated: false })
        }
      }),
    sleepIfIdle: () => Effect.die("the todo run never puts a machine to sleep"),
  })
  return { calls, copies, layer: Layer.succeed(Machines, service) }
}

/** A model that answers each turn with the next cell, then the last one again. */
const cells = (...sources: ReadonlyArray<string>) => {
  let index = 0
  const requests: Array<string> = []
  const model = Model.make({
    stream: (request) =>
      Stream.suspend(() => {
        requests.push(JSON.stringify(request.messages))
        const source = sources[Math.min(index++, sources.length - 1)]!
        return Stream.fromIterable<ModelEvent.ModelEvent>([
          { type: "text-delta", id: "t", text: "```cell\n" + source + "\n```" },
          { type: "usage", inputTokens: 10, outputTokens: 10 },
          { type: "settle", stopReason: "stop" },
        ])
      }),
  })
  return { model, requests }
}

/** The agent writes a line into README.md, runs the repository's check, and answers. */
const WRITES_README = [
  `await ctx.call("sandbox/write", { path: "README.md", content: "# Widgets\\n\\nA line\\n" })`,
  `const r = await ctx.call("sandbox/run", { command: "sh .smithers/checks/readme.sh" })`,
  `ctx.done({ summary: "Added a line; the check exited " + r.exitCode + "." })`,
].join("\n")

/** The `agent` seat over `model`, admitted and metered as the endpoint's calls are. */
const agentSeat = async (model: Model.Model) => {
  const local = await Effect.runPromise(
    ModelEndpoint.local(await database()).pipe(
      Effect.provideService(
        HostModel,
        HostModel.of({ modelId: "agent-model", model, route: { prepare: () => Effect.die(new Error("unused")) } }),
      ),
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
    ),
  )
  return local("agent")
}

/** Everything one run needs: the scripted GitHub, the machine, the agent, and the starts it asked its host for. */
const setup = async (options: { readonly agent?: ReadonlyArray<string>; readonly run?: (command: string) => number } = {}) => {
  const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
  const machine = machines(github, options.run)
  const { services } = await githubServices(runtime, github)
  const starts: Array<{ readonly flow: string; readonly executionId: string; readonly payload: unknown }> = []
  const todoServices: Todo.Services<unknown, never> = {
    database: services.database,
    tokens: services.tokens,
    http: services.http,
    apiBaseUrl: services.apiBaseUrl,
    start: (flow, start) => Effect.sync(() => void starts.push({ flow: flow._tag, ...start })),
  }
  const agent = cells(...(options.agent ?? [WRITES_README]))
  const seat = await agentSeat(agent.model)
  const registration = Todo.registration(
    todoServices,
    TodoAgent.registration(seat, await database(), Agent.layerDefaults),
  ).pipe(Layer.provide(machine.layer))
  const run = (start: Stack.AttemptStart) =>
    runFlow(Todo.Todo, start, registration, { executionId: todoExecutionId(start.attemptId) })
  return { github, machine, starts, agent, run, services: todoServices, registration }
}

// A run on the Node host takes 15 to 30 seconds: the engine, the agent's QuickJS realm and Postgres at each step.
describe("the todo run", { timeout: 120_000 }, () => {
  test("takes a TODO from an issue to a merged pull request: branch, change, commit, PR with Fixes #n, merge", async () => {
    const ctx = await setup()
    const issue = ctx.github.open("README needs a line", "Please add one.")
    ctx.github.files.set(".smithers/checks/readme.sh", "test -s README.md\n")
    const start = (await commit("Add a line to README", "Add a line to the README.", issue.number))!
    const second = await commit("Second", "Then this.")
    expect(second).toBeUndefined()
    // A person merges the pull request on github.com as soon as it opens.
    ctx.github.onPullOpened = (number) => void ctx.github.merge(number, "maya")

    const ran = await ctx.run(start)

    expect(ran.exit).toEqual(Exit.succeed({ state: "merged" }))
    expect(ran.status).toBe("completed")
    const branch = "smithers/t1-add-a-line-to-readme"
    const pull = [...ctx.github.pulls.values()][0]!
    expect([pull.head, pull.base, pull.merged]).toEqual([branch, "main", true])
    const body = ctx.github.issues.get(pull.number)!.body!
    expect(body).toContain("Add a line to the README.")
    expect(body).toContain(`Fixes #${issue.number}`)
    expect(body).toContain("Smithers for @maya")
    expect(body).toContain(`<!-- smithers:write=${start.attemptId} -->`)
    // The commit: one, on the base, written as the App with whom it acted for; main has the squash.
    const head = ctx.github.commits.get(pull.mergeSha!)!
    expect(ctx.github.tree("main").get("README.md")).toBe("# Widgets\n\nA line\n")
    expect(head.parents).toHaveLength(1)
    const branchCommit = [...ctx.github.commits.values()].find((found) => found.message.startsWith("T1: "))!
    expect([branchCommit.message, branchCommit.login]).toEqual(["T1: Add a line to README\n\nSmithers for @maya", BOT_LOGIN])
    // The TODO settled merged, and the next one started.
    expect(await todo(1)).toMatchObject({
      state: "merged",
      branch,
      prNumber: pull.number,
      mergeSha: pull.mergeSha,
      position: null,
      failure: null,
    })
    expect(await todo(2)).toMatchObject({ state: "working", position: 1 })
    expect(ctx.starts.map(({ flow }) => flow)).toEqual([ChecksRun._tag, Todo.Todo._tag])
    expect(ctx.starts[0]!.executionId).toBe(checkExecutionId(REPOSITORY.id, branchCommit.sha, "all"))
    // The agent's tools ran on the attempt's own machine, on its branch, as the person who committed the TODO.
    const tools = ctx.machine.calls.filter((call) => call.callId.length === 36)
    expect(new Set(tools.map((call) => `${call.branchId} ${call.branch} ${call.ownerId}`))).toEqual(
      new Set([`${TodoMachine.machineId(start.attemptId)} ${branch} ${maya.id}`]),
    )
    expect(ctx.machine.calls.map((call) => call.tool)).toEqual(["write", "run", "status", "read"])
    // The pull request is in the projection, merged.
    expect(await sql(runtime, `SELECT number, merged, head_ref AS "headRef" FROM pulls`)).toEqual([
      { number: pull.number, merged: true, headRef: branch },
    ])
  })

  test("a pull request closed on GitHub drops the TODO", async () => {
    const ctx = await setup()
    const start = (await commit("Close me", "Anything."))!
    ctx.github.onPullOpened = (number) => ctx.github.close(number)
    const ran = await ctx.run(start)
    expect(ran.exit).toEqual(Exit.succeed({ state: "dropped" }))
    expect(await todo()).toMatchObject({ state: "dropped", note: "closed_on_github", position: null })
  })

  test("an agent that changes nothing fails the TODO empty_change, and the next one starts", async () => {
    const ctx = await setup({ agent: [`ctx.done({ summary: "Nothing to do." })`] })
    const start = (await commit("Nothing", "Change nothing."))!
    await commit("Next", "Then this.")
    const ran = await ctx.run(start)
    expect(ran.exit).toEqual(Exit.succeed({ state: "failed" }))
    expect(await todo(1)).toMatchObject({ state: "failed", failure: "empty_change", position: 1 })
    expect(await todo(2)).toMatchObject({ state: "working" })
    expect(ctx.github.pulls.size).toBe(0)
    expect(ctx.starts.map(({ flow }) => flow)).toEqual([Todo.Todo._tag])
  })

  test("an agent that never answers in the schema fails the TODO implement", async () => {
    const ctx = await setup({ agent: [`ctx.done({ nonsense: true })`] })
    const start = (await commit("Bad answer", "Anything."))!
    const ran = await ctx.run(start)
    expect(ran.exit).toEqual(Exit.succeed({ state: "failed" }))
    expect(await todo()).toMatchObject({ state: "failed", failure: "implement" })
  })

  test("without the App installed the TODO fails app_not_installed before any branch", async () => {
    const ctx = await setup()
    ctx.github.installed = false
    const start = (await commit("No App", "Anything."))!
    const ran = await ctx.run(start)
    expect(ran.exit).toEqual(Exit.succeed({ state: "failed" }))
    expect(await todo()).toMatchObject({ state: "failed", failure: "app_not_installed", branch: null })
  })

  test("a TODO dropped before its run starts ends the run with nothing made", async () => {
    const ctx = await setup()
    const start = (await commit("Dropped", "Anything."))!
    await runtime.runPromise(Stack.apply({
      opId: crypto.randomUUID(),
      repoId: REPOSITORY.id,
      actor: maya,
      via: "person",
      op: { kind: "drop", number: 1 },
    }, { runs: true }))
    const ran = await ctx.run(start)
    expect(ran.exit).toEqual(Exit.succeed({ state: "ended" }))
    expect(ctx.github.refs.size).toBe(1)
    expect(await todo()).toMatchObject({ state: "dropped" })
  })

  test("a branch name someone else holds takes the next suffix; a lost commit and a lost PR are adopted, not repeated", async () => {
    const ctx = await setup()
    ctx.github.push("smithers/t1-adopt", { "OTHER.md": "theirs\n" })
    const start = (await commit("Adopt", "Anything."))!
    ctx.github.faults.push(
      { match: (method, path) => method === "POST" && path === "/graphql", lost: true },
      { match: (method, path) => method === "POST" && path.endsWith("/pulls"), lost: true },
    )
    ctx.github.onPullOpened = (number) => void ctx.github.merge(number)
    const ran = await ctx.run(start)
    expect(ran.exit).toEqual(Exit.succeed({ state: "merged" }))
    expect(await todo()).toMatchObject({ branch: "smithers/t1-adopt-2", state: "merged" })
    expect(ctx.github.seen("POST", /^\/graphql$/)).toHaveLength(1)
    expect(ctx.github.seen("POST", /\/pulls$/)).toHaveLength(1)
    expect(ctx.github.pulls.size).toBe(1)
  })
})

describe("the run's steps", () => {
  test("await closes the pull request a dropped TODO's run opened, as the App, and ends", async () => {
    const ctx = await setup()
    const start = (await commit("Open", "Anything."))!
    ctx.github.push("feature", { "A.md": "a\n" })
    // A pull request the run opened, then the TODO dropped in Smithers.
    const issue = ctx.github.openPull("feature")
    await runtime.runPromise(Stack.apply({
      opId: crypto.randomUUID(),
      repoId: REPOSITORY.id,
      actor: maya,
      via: "person",
      op: { kind: "drop", number: 1 },
    }, { runs: true }))
    const awaited = await runtime.runPromise(
      Todo.steps(ctx.services).await({ request: start, published: { headSha: "a".repeat(40), prNumber: issue.number } }).pipe(
        Effect.provide(ctx.machine.layer),
      ),
    )
    expect(awaited).toEqual({ state: "ended", mergeSha: null })
    expect(ctx.github.issues.get(issue.number)!.state).toBe("closed")
  })

  test("await answers StillOpen while a person hasn't merged, so the engine asks again", async () => {
    const ctx = await setup()
    const start = (await commit("Wait", "Anything."))!
    ctx.github.push("feature", { "A.md": "a\n" })
    const issue = ctx.github.openPull("feature")
    const exit = await runtime.runPromise(
      Effect.exit(Todo.steps(ctx.services).await({ request: start, published: { headSha: "a".repeat(40), prNumber: issue.number } })),
    )
    expect(exit._tag === "Failure" && String(exit.cause)).toContain("StillOpen")
  })

  test("TODO_RUNS: a deployment runs TODOs unless it is set to false", async () => {
    const read = (env: Record<string, string>) =>
      Effect.runPromise(Effect.gen(function* () {
        return yield* Todo.enabled
      }).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env)))))
    expect(await read({})).toBe(true)
    expect(await read({ TODO_RUNS: "false" })).toBe(false)
    expect(await read({ TODO_RUNS: "true" })).toBe(true)
  })

  test("failureOf names each step's code", () => {
    expect(Todo.failureOf(new Todo.TodoFailed({ failure: "budget" }))).toBe("budget")
    expect(Todo.failureOf(new Todo.TodoUnavailable({ step: "begin" }))).toBe("publish_refused")
    expect(Todo.failureOf(new Todo.TodoUnavailable({ step: "publish" }))).toBe("publish_refused")
    expect(Todo.failureOf(new Todo.TodoUnavailable({ step: "collect" }))).toBe("implement")
    expect(Todo.failureOf(new Todo.TodoUnavailable({ step: "await" }))).toBe("pr_refused")
    expect(Todo.failureOf(new Todo.StillOpen())).toBe("implement")
  })

  test("the branch, the commit's message, the PR's body and base64", () => {
    expect(Todo.branchNameOf(4, "Retry webhook delivery!")).toBe("smithers/t4-retry-webhook-delivery")
    expect(Todo.branchNameOf(4, "!!!")).toBe("smithers/t4")
    expect(Todo.branchNameOf(4, "x".repeat(80), "-2")).toBe(`smithers/t4-${"x".repeat(40)}-2`)
    expect(Todo.branchNameOf(4, "Ünïcode tïtle")).toBe("smithers/t4-unicode-title")
    expect(Todo.commitMessageOf(2, "Fix it", "maya")).toEqual({ headline: "T2: Fix it", body: "Smithers for @maya" })
    const begun = {
      branch: "b",
      baseSha: "a".repeat(40),
      defaultBranch: "main",
      title: "t",
      prompt: "Do it.",
      acceptance: [],
      issueNumber: null,
      ownerId: "p",
      ownerLogin: "maya",
    }
    expect(Todo.pullBodyOf(begun)).toBe("Do it.\n\nSmithers for @maya")
    expect(Todo.pullBodyOf({ ...begun, issueNumber: 7 })).toBe("Do it.\n\nFixes #7\n\nSmithers for @maya")
    expect(Todo.base64Of("é\n")).toBe(btoa(String.fromCharCode(0xc3, 0xa9, 0x0a)))
    expect(atob(Todo.base64Of("x".repeat(70_000))).length).toBe(70_000)
  })

  test("the machine of a run's execution: its attempt's branch and committer, none for any other run", async () => {
    const start = (await commit("Machine", "Anything."))!
    const of = (executionId: string) =>
      runtime.runPromise(TodoMachine.ofExecution(executionId).pipe(Effect.map(Option.getOrUndefined)))
    expect(await of(todoExecutionId(start.attemptId))).toBeUndefined()
    await sql(runtime, `UPDATE todos SET branch = 'smithers/t1-machine'`)
    expect(await of(todoExecutionId(start.attemptId))).toEqual({
      branch: {
        branchId: TodoMachine.machineId(start.attemptId),
        owner: REPOSITORY.owner,
        name: REPOSITORY.name,
        branch: "smithers/t1-machine",
      },
      ownerId: maya.id,
    })
    expect(await of("chat:123")).toBeUndefined()
    expect(await of("todo:not-a-uuid")).toBeUndefined()
    expect(await of(todoExecutionId(crypto.randomUUID()))).toBeUndefined()
  })
})

describe("the run's steps, case by case", { timeout: 60_000 }, () => {
  const unreachable = Database.layer(Effect.succeed(Redacted.make("postgresql://smithers:smithers@127.0.0.1:1/smithers")))
  const BASE = () => "0".repeat(40)
  /** Runs one step of `ctx`'s services, answering its exit. */
  const step = <A, E, R>(ctx: Awaited<ReturnType<typeof setup>>, effect: (steps: ReturnType<typeof Todo.steps>) => Effect.Effect<A, E, R>) =>
    runtime.runPromise(
      Effect.exit((effect(Todo.steps(ctx.services)) as Effect.Effect<A, E, Machines>).pipe(Effect.provide(ctx.machine.layer))),
    )
  const failure = (exit: Exit.Exit<unknown, unknown>) =>
    exit._tag === "Failure" ? JSON.parse(JSON.stringify(Cause.squash(exit.cause))) : undefined
  const begun = (ctx: Awaited<ReturnType<typeof setup>>, branch: string): Todo.Begun => ({
    branch,
    baseSha: ctx.github.refs.get("main")!,
    defaultBranch: "main",
    title: "Step",
    prompt: "Do it.",
    acceptance: [],
    issueNumber: null,
    ownerId: maya.id,
    ownerLogin: maya.login,
  })

  test("begin: a step run again takes the branch it recorded; an attempt it doesn't know ends", async () => {
    const ctx = await setup()
    const start = (await commit("Step", "Do it."))!
    await sql(runtime, `UPDATE todos SET branch = 'smithers/t1-recorded', base_sha = '${ctx.github.refs.get("main")}'`)
    const again = await step(ctx, (steps) => steps.begin({ request: start }))
    expect(again._tag === "Success" && again.value.branch).toBe("smithers/t1-recorded")
    expect(ctx.github.seen("POST", /\/git\/refs$/)).toHaveLength(0)
    const unknown = await step(ctx, (steps) => steps.begin({ request: { ...start, attemptId: crypto.randomUUID() } }))
    expect(failure(unknown)).toMatchObject({ failure: "ended" })
  })

  test("begin: five names taken, or no default branch, is publish_refused; a lost race takes the next name", async () => {
    const ctx = await setup()
    const start = (await commit("Taken", "Do it."))!
    for (const suffix of ["", "-2", "-3", "-4", "-5"]) ctx.github.push(`smithers/t1-taken${suffix}`, { "X.md": "x\n" })
    expect(failure(await step(ctx, (steps) => steps.begin({ request: start })))).toMatchObject({ failure: "publish_refused" })
    const raced = await setup()
    await sql(runtime, "TRUNCATE stack_ops, todo_attempts, todo_requests, todos, stacks")
    const second = (await commit("Raced", "Do it."))!
    raced.github.faults.push({ match: (method, path) => method === "POST" && path.endsWith("/git/refs"), status: 422 })
    const exit = await step(raced, (steps) => steps.begin({ request: second }))
    expect(exit._tag === "Success" && exit.value.branch).toBe("smithers/t1-raced-2")
  })

  test("begin: a branch GitHub fails to create, or a token it fails to mint, is tried again", async () => {
    const ctx = await setup()
    const start = (await commit("Down", "Do it."))!
    ctx.github.faults.push({ match: (method, path) => method === "POST" && path.endsWith("/git/refs"), status: 500 })
    expect(failure(await step(ctx, (steps) => steps.begin({ request: start })))).toMatchObject({ step: "begin" })
    ctx.github.faults.push({ match: (method, path) => method === "POST" && path.endsWith("/access_tokens"), status: 500 })
    expect(failure(await step(ctx, (steps) => steps.begin({ request: start })))).toMatchObject({ step: "begin" })
    ctx.github.refs.delete("main")
    expect(failure(await step(ctx, (steps) => steps.begin({ request: start })))).toMatchObject({ failure: "publish_refused" })
  })

  test("collect: deletions, too many files, a cut read or a refused tool fail implement; a machine down is retried", async () => {
    const ctx = await setup()
    const start = (await commit("Collect", "Do it."))!
    await sql(runtime, `UPDATE todos SET branch = 'main'`)
    const machine = TodoMachine.machineOf({ ...start, branch: "main", ownerId: maya.id })
    const tools = Context.get(await Effect.runPromise(Layer.build(ctx.machine.layer).pipe(Effect.scoped)), Machines)
    await Effect.runPromise(tools.tool(machine.branch, maya.id, "w", { tool: "write", path: "NEW.md", content: "n\n" }))
    ctx.machine.copies.get(machine.branch.branchId)!.files.delete("README.md")
    const collected = await step(ctx, (steps) => steps.collect({ request: start, begun: begun(ctx, "main") }))
    expect(collected._tag === "Success" && collected.value).toEqual({
      additions: [{ path: "NEW.md", contents: btoa("n\n") }],
      deletions: ["README.md"],
    })
    const files = ctx.machine.copies.get(machine.branch.branchId)!.files
    for (let index = 0; index < Todo.MAX_FILES; index++) files.set(`f${index}.md`, "x")
    expect(failure(await step(ctx, (steps) => steps.collect({ request: start, begun: begun(ctx, "main") }))))
      .toMatchObject({ failure: "implement" })
    for (let index = 0; index < Todo.MAX_FILES; index++) files.delete(`f${index}.md`)
    files.set("BIG.md", "x".repeat(Todo.MAX_CHANGE_BYTES + 1))
    expect(failure(await step(ctx, (steps) => steps.collect({ request: start, begun: begun(ctx, "main") }))))
      .toMatchObject({ failure: "implement" })
  })

  test("collect: a tool the machine refuses, a checkout that failed or a read it cut fails implement; a machine down is retried", async () => {
    const ctx = await setup()
    const start = (await commit("Tools", "Do it."))!
    /** `ctx` over a machine whose every call answers `answer`. */
    const on = (answer: (call: SandboxTools.Call) => ReturnType<Machines["Service"]["tool"]>) => ({
      ...ctx,
      machine: {
        ...ctx.machine,
        layer: Layer.succeed(
          Machines,
          Machines.of({ tool: (_branch, _owner, _id, call) => answer(call), sleepIfIdle: () => Effect.die("unused") }),
        ),
      },
    })
    const collect = (target: Awaited<ReturnType<typeof setup>>) =>
      step(target, (steps) => steps.collect({ request: start, begun: begun(ctx, "main") }))
    const failing = (tag: string) => on(() => Effect.fail({ _tag: tag, reason: "not_found" } as never))
    expect(failure(await collect(failing("@smthrs/sandbox/SandboxTools/ToolRefused")))).toMatchObject({ failure: "implement" })
    expect(failure(await collect(failing("@smthrs/mvp/branch/CheckoutFailed")))).toMatchObject({ failure: "implement" })
    expect(failure(await collect(failing("@smthrs/mvp/branch/SandboxUnavailable")))).toMatchObject({ step: "collect" })
    const cut = on((call) => {
      const result: SandboxTools.Result = call.tool === "status"
        ? { tool: "status", branch: "main", entries: [{ path: "BIG.md", index: "?", worktree: "?" }] }
        : { tool: "read", path: "BIG.md", content: "x", bytes: 1, truncated: true }
      return Effect.succeed({ result, generation: 1 })
    })
    expect(failure(await collect(cut))).toMatchObject({ failure: "implement" })
  })

  test("begin: GitHub's or the token's wait is kept for the retry; a branch already at the base is taken, not made again", async () => {
    const ctx = await setup()
    const start = (await commit("Wait", "Do it."))!
    const repository = `/repos/${REPOSITORY.owner}/${REPOSITORY.name}`
    ctx.github.faults.push({
      match: (method, path) => method === "GET" && path.endsWith(repository),
      status: 429,
      headers: { "retry-after": "7" },
    })
    expect(failure(await step(ctx, (steps) => steps.begin({ request: start })))).toMatchObject({ step: "begin", retryAfterMillis: 7_000 })
    ctx.github.faults.push({ match: (_method, path) => path.endsWith("/access_tokens"), status: 429, headers: { "retry-after": "5" } })
    expect(failure(await step(ctx, (steps) => steps.begin({ request: start })))).toMatchObject({ step: "begin", retryAfterMillis: 5_000 })
    ctx.github.refs.set("smithers/t1-wait", ctx.github.refs.get("main")!)
    const taken = await step(ctx, (steps) => steps.begin({ request: start }))
    expect(taken._tag === "Success" && taken.value.branch).toBe("smithers/t1-wait")
    expect(ctx.github.seen("POST", /\/git\/refs$/)).toHaveLength(0)
  })

  test("publish: a report the writer finds stale ends the run before anything is written", async () => {
    const ctx = await setup()
    const start = (await commit("Stale", "Do it."))!
    const collected = { additions: [{ path: "A.md", contents: btoa("a\n") }], deletions: [] }
    const stale = await step(ctx, (steps) => steps.publish({ request: { ...start, ordinal: 9 }, begun: begun(ctx, "main"), collected }))
    expect(failure(stale)).toMatchObject({ failure: "ended" })
    expect(ctx.github.seen("POST", /^\/graphql$/)).toHaveLength(0)
  })

  test("await: an attempt the writer no longer has closes the pull request its run opened, and ends", async () => {
    const ctx = await setup()
    const start = (await commit("Gone", "Do it."))!
    ctx.github.push("feature", { "G.md": "g\n" })
    const pull = ctx.github.openPull("feature")
    const gone = await step(ctx, (steps) =>
      steps.await({ request: { ...start, attemptId: crypto.randomUUID() }, published: { headSha: BASE(), prNumber: pull.number } })
    )
    expect(gone._tag === "Success" && gone.value).toEqual({ state: "ended", mergeSha: null })
    expect(ctx.github.issues.get(pull.number)!.state).toBe("closed")
  })

  test("publish: a missing branch, or a head someone else moved, is publish_refused; GitHub refusing the PR, pr_refused", async () => {
    const ctx = await setup()
    const start = (await commit("Publish", "Do it."))!
    const collected = { additions: [{ path: "A.md", contents: btoa("a\n") }], deletions: [] }
    expect(failure(await step(ctx, (steps) => steps.publish({ request: start, begun: begun(ctx, "smithers/gone"), collected }))))
      .toMatchObject({ failure: "publish_refused" })
    ctx.github.push("smithers/theirs", { "T.md": "t\n" })
    expect(failure(await step(ctx, (steps) => steps.publish({ request: start, begun: begun(ctx, "smithers/theirs"), collected }))))
      .toMatchObject({ failure: "publish_refused" })
    ctx.github.push("smithers/refused", {})
    ctx.github.refs.set("smithers/refused", ctx.github.refs.get("main")!)
    ctx.github.faults.push({ match: (method, path) => method === "POST" && path.endsWith("/pulls"), status: 422 })
    expect(failure(await step(ctx, (steps) => steps.publish({ request: start, begun: begun(ctx, "smithers/refused"), collected }))))
      .toMatchObject({ failure: "pr_refused" })
  })

  test("await: a pull request GitHub no longer has, or closed, ends closed", async () => {
    const ctx = await setup()
    const start = (await commit("Await", "Do it."))!
    ctx.github.push("feature", { "F.md": "f\n" })
    const pull = ctx.github.openPull("feature")
    ctx.github.close(pull.number)
    const closed = await step(ctx, (steps) => steps.await({ request: start, published: { headSha: BASE(), prNumber: pull.number } }))
    expect(closed._tag === "Success" ? closed.value : failure(closed)).toEqual({ state: "closed", mergeSha: null })
    ctx.github.remove(pull.number)
    const gone = await step(ctx, (steps) => steps.await({ request: start, published: { headSha: BASE(), prNumber: pull.number } }))
    expect(gone._tag === "Success" ? gone.value : failure(gone)).toEqual({ state: "closed", mergeSha: null })
  })

  test("settle and fail: an ended run changes nothing, a stale report ends it, and Postgres down is retried", async () => {
    const ctx = await setup()
    const start = (await commit("Settle", "Do it."))!
    const ended = await step(ctx, (steps) => steps.settle({ request: start, awaited: { state: "ended", mergeSha: null } }))
    expect(ended._tag === "Success" && ended.value).toEqual({ state: "ended" })
    const stale = { ...start, ordinal: 9 }
    const settled = await step(ctx, (steps) => steps.settle({ request: stale, awaited: { state: "merged", mergeSha: BASE() } }))
    expect(settled._tag === "Success" && settled.value).toEqual({ state: "ended" })
    const failed = await step(ctx, (steps) => steps.fail({ request: stale, error: new Todo.TodoFailed({ failure: "implement" }) }))
    expect(failed._tag === "Success" && failed.value).toEqual({ state: "ended" })
    const endedFail = await step(ctx, (steps) => steps.fail({ request: start, error: new Todo.TodoFailed({ failure: "ended" }) }))
    expect(endedFail._tag === "Success" && endedFail.value).toEqual({ state: "ended" })
    const down = { ...ctx, services: { ...ctx.services, database: unreachable } }
    expect(failure(await step(down, (steps) => steps.settle({ request: start, awaited: { state: "merged", mergeSha: null } }))))
      .toMatchObject({ step: "settle" })
    expect(failure(await step(down, (steps) => steps.fail({ request: start, error: new Todo.StillOpen() }))))
      .toMatchObject({ step: "settle" })
    expect(failure(await step(down, (steps) => steps.await({ request: start, published: { headSha: BASE(), prNumber: 1 } }))))
      .toMatchObject({ step: "await" })
  })
})
