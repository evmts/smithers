// The stack's routes (worker/stack/Api.ts, decision 0016 §1 and §5) through the real handler on this file's schema of
// the compose Postgres and Electric (`pnpm db:up`): every refusal of `POST /api/repos/<owner>/<name>/stack`, a commit and
// a drop end to end, repeated ops, the run host's seam, the shapes' access, and records free of titles and prompts.
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { beforeEach, describe, expect, test } from "vitest"
import {
  MAX_ACCEPTANCE,
  MAX_PROMPT_BYTES,
  MAX_STACK_BODY_BYTES,
  MAX_TITLE_LENGTH,
  stackRoute,
  TODO_REQUESTS_SHAPE_ROUTE,
  TODOS_SHAPE_ROUTE,
} from "../../src/features/todos/contract.ts"
import { type Actor, Sessions, SessionsUnavailable } from "../Actor.ts"
import { eventually, testFile, uuid } from "../test/harness.ts"
import * as Api from "./Api.ts"
import * as Stack from "./Stack.ts"
import { runs, stackHarness, type StackHarness } from "./test/stack.ts"

const runtime = testFile("stack_api")
beforeEach(() =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql`TRUNCATE stack_ops, todo_attempts, todo_requests, todos, stacks`))
)

const member: Actor = { subject: { kind: "person", id: "person-member" }, role: "member", login: "maya" }
const guest: Actor = { subject: { kind: "person", id: "person-guest" }, role: "guest", login: "gus" }
const noLogin: Actor = { subject: { kind: "person", id: "person-nologin" }, role: "maintainer" }
/** The member's agent: what a session says when an agent acts for the person (decision 0008 §1, `act`). */
const agentForMember: Actor = { ...member, act: { kind: "agent", id: "answer-1" } }

const ROUTE = stackRoute("Octo", "hello")

const post = (h: StackHarness, body: unknown, init: RequestInit = {}, route = ROUTE) =>
  h.fetch(route, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: (typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body)) as BodyInit,
    ...init,
  })

const json = async (response: Response) => [response.status, await response.json()]

const commitBody = (fields: Record<string, unknown> = {}) => ({
  opId: uuid(),
  op: "commit",
  title: "Retry webhook delivery",
  prompt: "Retry a failed delivery three times.",
  ...fields,
})

const sql = <A extends object>(statement: string) =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, (client) => client.unsafe<A>(statement)))

describe("POST /api/repos/<owner>/<name>/stack", () => {
  test("a commit is taken 202 with its transaction and number; the same op again answers 200 with no transaction", async () => {
    const h = await stackHarness(runtime, { actor: member })
    const body = commitBody({ title: "  Retry webhook delivery  ", acceptance: ["three tries"], issue: 7 })

    const [status, taken] = await json(await post(h, body))
    expect([status, taken]).toEqual([202, { txid: expect.any(Number), opId: body.opId, outcome: "committed", number: 1 }])
    expect(await json(await post(h, body))).toEqual([200, { txid: null, opId: body.opId, outcome: "committed", number: 1 }])
    expect(await sql(`SELECT id, repo_id AS "repoId", title, created_login AS "login", state FROM todos`)).toEqual([
      { id: body.opId, repoId: "github/octo/hello", title: "Retry webhook delivery", login: "maya", state: "queued" },
    ])
    expect(await sql(`SELECT acceptance FROM todo_requests`)).toEqual([{ acceptance: ["three tries"] }])
    expect(await sql(`SELECT issue_number AS issue FROM todos`)).toEqual([{ issue: 7 }])
    expect(h.line("stack.request").map((line) => line.annotations.outcome)).toEqual(["committed", "repeated"])
    expect(h.count(Api.requests, { op: "commit", outcome: "committed" })).toBe(1)
  })

  test("an op id is case-blind, and another payload under it is 409 conflict", async () => {
    const h = await stackHarness(runtime, { actor: member })
    const body = commitBody()
    await post(h, body)
    expect((await post(h, { ...body, opId: body.opId.toUpperCase() })).status).toBe(200)
    expect(await json(await post(h, { ...body, title: "Another" }))).toEqual([409, { code: "conflict" }])
  })

  test("a drop is taken, then the stack refuses a merged TODO 409 and an unknown number 404", async () => {
    const h = await stackHarness(runtime, { actor: member })
    await post(h, commitBody())
    await post(h, commitBody())

    expect(await json(await post(h, { opId: uuid(), op: "drop", number: 1 })))
      .toEqual([202, { txid: expect.any(Number), opId: expect.any(String), outcome: "dropped", number: 1 }])
    await sql(`UPDATE todos SET state = 'merged', position = NULL, settled_at = now() WHERE number = 2`)
    expect(await json(await post(h, { opId: uuid(), op: "drop", number: 2 }))).toEqual([409, { code: "merged" }])
    expect(await json(await post(h, { opId: uuid(), op: "drop", number: 9 }))).toEqual([404, { code: "not_found" }])
  })

  test("a full stack refuses a commit 409 stack_full, and again for the same op", async () => {
    const h = await stackHarness(runtime, { actor: member })
    await post(h, commitBody())
    await sql(`UPDATE stacks SET max_open = 1`)
    const full = commitBody()
    expect(await json(await post(h, full))).toEqual([409, { code: "stack_full" }])
    expect(await json(await post(h, full))).toEqual([409, { code: "stack_full" }])
  })

  test("refuses who may not change a stack", async () => {
    const cases: ReadonlyArray<[Parameters<typeof stackHarness>[1], unknown, number, string]> = [
      [{}, commitBody(), 401, "authentication"],
      [{ actor: guest }, commitBody(), 403, "forbidden"],
      [{ actor: agentForMember }, commitBody(), 403, "forbidden"],
      [{ actor: agentForMember }, { opId: uuid(), op: "drop", number: 1 }, 403, "forbidden"],
      [{ actor: { ...member, act: { kind: "flow", id: "flow-1" } } }, commitBody(), 403, "forbidden"],
      [
        { sessions: Layer.succeed(Sessions, Sessions.of({ resolve: Effect.fail(new SessionsUnavailable()) })) },
        commitBody(),
        503,
        "unavailable",
      ],
    ]
    for (const [options, body, status, code] of cases) {
      const h = await stackHarness(runtime, options)
      expect(await json(await post(h, body))).toEqual([status, { code }])
    }
    expect(await sql(`SELECT id FROM todos`)).toEqual([])
  })

  test("refuses a body that isn't a change, 400, and one over the limit, 413", async () => {
    const h = await stackHarness(runtime, { actor: member })
    const invalid: ReadonlyArray<unknown> = [
      "not json",
      {},
      commitBody({ opId: "not-a-uuid" }),
      commitBody({ op: "move" }),
      commitBody({ title: "   " }),
      commitBody({ title: "x".repeat(MAX_TITLE_LENGTH + 1) }),
      commitBody({ prompt: " \n" }),
      commitBody({ prompt: "é".repeat(MAX_PROMPT_BYTES / 2 + 1) }),
      commitBody({ acceptance: Array.from({ length: MAX_ACCEPTANCE + 1 }, () => "ok") }),
      commitBody({ acceptance: [" "] }),
      { opId: uuid(), op: "drop", number: 0 },
      { opId: uuid(), op: "drop", number: 1.5 },
    ]
    for (const body of invalid) expect([body, (await post(h, body)).status]).toEqual([body, 400])
    expect((await post(h, "x".repeat(MAX_STACK_BODY_BYTES + 1))).status).toBe(413)
    expect(
      (await post(h, "{}", { headers: { "content-type": "application/json", "content-length": String(MAX_STACK_BODY_BYTES + 1) } }))
        .status,
    ).toBe(413)
    // Malformed UTF-8.
    expect((await post(h, new Uint8Array([0xc3, 0x28]))).status).toBe(400)
    expect(h.count(Api.requests, { op: "unknown", outcome: "invalid" })).toBeGreaterThan(0)
  })

  test("who acts is the session's to say, never the body's: the agent's door can't commit or drop", async () => {
    const person = await stackHarness(runtime, { actor: member })
    await post(person, commitBody())
    const agent = await stackHarness(runtime, { actor: agentForMember })

    // The agent's session claiming to be the person in the body is still the agent.
    expect(await json(await post(agent, commitBody({ via: "person" })))).toEqual([403, { code: "forbidden" }])
    expect(await json(await post(agent, { opId: uuid(), op: "drop", number: 1, via: "person" }))).toEqual([403, { code: "forbidden" }])
    expect(agent.line("stack.request").map((line) => line.annotations.via)).toEqual(["agent", "agent"])
    expect(await sql(`SELECT number, state FROM todos`)).toEqual([{ number: 1, state: "queued" }])

    // A person's body claiming the agent claims nothing either: the change is the person's.
    const claimed = commitBody({ via: "agent" })
    expect((await post(person, claimed)).status).toBe(202)
    expect(await sql(`SELECT via FROM stack_ops WHERE id = '${claimed.opId}'`)).toEqual([{ via: "person" }])
  })

  test("answers 405 to anything but POST", async () => {
    const h = await stackHarness(runtime, { actor: member })
    const response = await h.fetch(ROUTE)
    expect([response.status, response.headers.get("allow")]).toEqual([405, "POST"])
  })

  test("a person without a login commits under their id", async () => {
    const h = await stackHarness(runtime, { actor: noLogin })
    expect((await post(h, commitBody())).status).toBe(202)
    expect(await sql(`SELECT created_login AS login FROM todos`)).toEqual([{ login: "person-nologin" }])
  })

  test("Postgres down is 503 unavailable with its code, never the text", async () => {
    const h = await stackHarness(runtime, { actor: member })
    await sql(`ALTER TABLE stack_ops RENAME TO stack_ops_gone`)
    try {
      expect(await json(await post(h, commitBody()))).toEqual([503, { code: "unavailable" }])
      expect(h.only("stack.request").annotations).toMatchObject({ errorCode: expect.stringMatching(/^sql:/) })
    } finally {
      await sql(`ALTER TABLE stack_ops_gone RENAME TO stack_ops`)
    }
  })
})

describe("the run host's seam", () => {
  test("a commit's start and a drop's stop are handed to the host, and a repeated op hands them again", async () => {
    const host = runs()
    const h = await stackHarness(runtime, { actor: member, runs: host })
    const first = commitBody()
    await post(h, first)
    await post(h, commitBody())
    expect(host.started.map(({ number, ordinal }) => [number, ordinal])).toEqual([[1, 1]])

    const dropping = { opId: uuid(), op: "drop", number: 1 }
    expect((await post(h, dropping)).status).toBe(202)
    expect(host.stopped).toEqual([{ attemptId: host.started[0]!.attemptId, todoId: first.opId }])
    expect(host.started.map(({ number }) => number)).toEqual([1, 2])

    expect((await post(h, dropping)).status).toBe(200)
    expect(host.stopped).toHaveLength(2)
    expect(host.started.map(({ number }) => number)).toEqual([1, 2, 2])
  })

  test("a host that can't take a start answers 503; the outbox's resend starts the same attempt", async () => {
    const host = runs()
    const h = await stackHarness(runtime, { actor: member, runs: host })
    const body = commitBody()
    host.refuse(1)
    expect(await json(await post(h, body))).toEqual([503, { code: "unavailable" }])
    expect(h.only("stack.request").annotations).toMatchObject({ errorCode: "no_host" })
    expect(await json(await post(h, body))).toEqual([200, { txid: null, opId: body.opId, outcome: "committed", number: 1 }])
    expect(host.started).toHaveLength(1)
    expect(await sql(`SELECT count(*)::int AS n FROM todo_attempts`)).toEqual([{ n: 1 }])
  })

  test("drop cancels the old run even when admission of its successor fails", async () => {
    const host = runs()
    const h = await stackHarness(runtime, { actor: member, runs: host })
    await post(h, commitBody())
    await post(h, commitBody())
    const stopped: Array<Stack.AttemptStop> = []
    const failed = await stackHarness(runtime, { actor: member, runs: {
      ...host,
      layer: Layer.succeed(Stack.TodoRuns, Stack.TodoRuns.of({
        start: () => Effect.fail(new Stack.RunsUnavailable({ errorCode: "admission_down" })),
        stop: (attempt) => Effect.sync(() => { stopped.push(attempt) }),
      })),
    } })
    expect((await post(failed, { opId: uuid(), op: "drop", number: 1 })).status).toBe(503)
    expect(stopped).toHaveLength(1)
  })

  test("a drop whose stop is refused answers 503", async () => {
    const host = runs()
    const h = await stackHarness(runtime, { actor: member, runs: host })
    await post(h, commitBody())
    host.refuse(1)
    expect((await post(h, { opId: uuid(), op: "drop", number: 1 })).status).toBe(503)
  })
})

describe("the shapes", () => {
  /**
   * Reads `route` for `repo` from its start until `count` rows are in: Electric may still be replicating them, and on a
   * loaded machine may answer a request with a retryable status or `409 must-refetch`, after which it reads from the
   * start again. Every answer it reads is `200` and never cached.
   */
  const values = async (h: StackHarness, route: string, repo: string, count: number) => {
    const rows: Array<Record<string, unknown>> = []
    const statuses: Array<number> = []
    let at = "offset=-1"
    await eventually(async () => {
      const response = await h.fetch(`${route}?repo=${repo}&${at}`)
      statuses.push(response.status)
      if (response.status === 409) {
        rows.length = 0
        at = "offset=-1"
        return false
      }
      if (response.status !== 200) return false
      expect(response.headers.get("cache-control")).toBe("private, no-store")
      for (const message of (await response.json()) as Array<{ readonly value?: Record<string, unknown> }>) {
        if (message.value !== undefined) rows.push(message.value)
      }
      at = `offset=${response.headers.get("electric-offset")}&handle=${response.headers.get("electric-handle")}`
      return rows.length >= count
    }, 20_000).catch((error) => {
      throw new Error(`${route} answered ${statuses.join(", ")}`, { cause: error })
    })
    return rows
  }

  test("a Member syncs one repository's TODOs and prompts, with the listed columns only", async () => {
    const h = await stackHarness(runtime, { actor: member })
    const body = commitBody({ acceptance: ["a", "b"] })
    await post(h, body)
    await post(h, commitBody(), {}, stackRoute("octo", "other"))

    const todos = await values(h, TODOS_SHAPE_ROUTE, "Octo/Hello", 1)
    expect(todos).toEqual([expect.objectContaining({ id: body.opId, repo_id: "github/octo/hello", number: "1", state: "queued" })])
    expect(Object.keys(todos[0]!)).not.toContain("created_by")
    const requests = await values(h, TODO_REQUESTS_SHAPE_ROUTE, "octo/hello", 1)
    expect(requests).toEqual([expect.objectContaining({ todo_id: body.opId, revision: "1", acceptance: "{a,b}" })])
    expect(Object.fromEntries(h.electric[0]!.searchParams)).toMatchObject({
      table: "todos",
      where: "repo_id = $1",
      "params[1]": "github/octo/hello",
    })
  })

  test("signed out 401, a Guest 403, sessions unreadable 503; Electric is never asked", async () => {
    const cases: ReadonlyArray<[Parameters<typeof stackHarness>[1], number]> = [
      [{}, 401],
      [{ actor: guest }, 403],
      [{ sessions: Layer.succeed(Sessions, Sessions.of({ resolve: Effect.fail(new SessionsUnavailable()) })) }, 503],
    ]
    for (const [options, status] of cases) {
      const h = await stackHarness(runtime, options)
      for (const route of [TODOS_SHAPE_ROUTE, TODO_REQUESTS_SHAPE_ROUTE]) {
        expect([route, (await h.fetch(`${route}?repo=octo/hello&offset=-1`)).status]).toEqual([route, status])
      }
      expect(h.electric).toEqual([])
    }
  })

  test("a request that names no repository reads no repository's rows", async () => {
    const h = await stackHarness(runtime, { actor: member })
    await post(h, commitBody())
    for (const query of ["", "repo=octo", "repo=octo/hello/x", "repo=app/flows"]) {
      const response = await h.fetch(`${TODOS_SHAPE_ROUTE}?offset=-1&${query}`)
      expect(response.status).toBe(200)
      expect(((await response.json()) as Array<{ readonly value?: unknown }>).filter((row) => row.value !== undefined))
        .toEqual([])
      expect(h.electric.at(-1)!.searchParams.get("params[1]")).toBe("-")
    }
  })
})

describe("routing", () => {
  test("handles the stack route and the two shapes, and nothing else", () => {
    for (const path of [ROUTE, "/api/repos/octo/hello/stack", "/api/repos/a%2Db/c/stack", TODOS_SHAPE_ROUTE, TODO_REQUESTS_SHAPE_ROUTE]) {
      expect([path, Api.handles(path)]).toEqual([path, true])
    }
    for (
      const path of [
        "/api/repos/octo/hello/writes",
        "/api/repos/octo/hello/stack/1",
        "/api/repos/octo/stack",
        "/api/repos/app/flows/stack",
        "/api/repos/%E0%A4%A/hello/stack",
        "/api/stack",
        "/api/shapes/todo",
      ]
    ) {
      expect([path, Api.handles(path)]).toEqual([path, false])
    }
  })

  test("a path it doesn't handle is 404", async () => {
    const h = await stackHarness(runtime, { actor: member })
    expect((await h.fetch("/api/nothing-here")).status).toBe(404)
  })
})

describe("observability", () => {
  test("no title, prompt or acceptance reaches a log line, span or metric", async () => {
    const h = await stackHarness(runtime, { actor: member })
    const secret = `sentinel-${uuid()}`
    await post(h, commitBody({ title: secret, prompt: secret, acceptance: [secret] }))
    await post(h, commitBody({ title: secret, prompt: "x".repeat(10) }), {}, ROUTE)
    const recorded = JSON.stringify({
      logs: h.logs,
      spans: h.spans.map((span) => [...span.attributes]),
      metrics: h.snapshot().map((metric) => metric.attributes),
    })
    expect(recorded).not.toContain(secret)
    expect(h.line("stack.apply")).toHaveLength(2)
    expect(h.spans.filter((span) => span.name === "stack.request")).toHaveLength(2)
  })
})

describe("Stack.TodoRuns", () => {
  test("is absent unless a host provides it", async () => {
    const h = await stackHarness(runtime, { actor: member })
    await post(h, commitBody())
    expect(await sql(`SELECT state FROM todos`)).toEqual([{ state: "queued" }])
    expect(Stack.TodoRuns.key).toBe("@smthrs/mvp/stack/TodoRuns")
  })
})


test("a valid prompt survives worst-case JSON escaping at its byte limit", async () => {
  const h = await stackHarness(runtime, { actor: member })
  const body = commitBody({ prompt: "x" + "\u0001".repeat(MAX_PROMPT_BYTES - 1) })
  expect((await post(h, body)).status).toBe(202)
})

test("retry after failed implement keeps identity and history, deduplicates, publishes attempt two", async () => {
  const host = runs()
  const h = await stackHarness(runtime, { actor: member, runs: host })
  const body = commitBody({ issue: 4430 })
  expect((await post(h, body)).status).toBe(202)
  const first = host.started[0]!
  await runtime.runPromise(Stack.report(first, { kind: "finished", state: "failed", failure: "implement" }, { runs: true }))
  const press = { opId: uuid(), op: "retry", number: 1 }
  expect((await post(h, press)).status).toBe(202)
  expect((await post(h, press)).status).toBe(200)
  const second = host.started[1]!
  expect(second).toMatchObject({ todoId: first.todoId, ordinal: 2, revision: 1 })
  expect(host.started[2]).toEqual(second)
  expect((await post(h, { ...press, opId: uuid() })).status).toBe(409)
  await runtime.runPromise(Stack.report(second, { kind: "published", headSha: "b".repeat(40), prNumber: 22, draft: false }, { runs: true }))
  expect(await sql('SELECT title, issue_number, position, attempt, state, failure FROM todos')).toEqual([
    { title: body.title, issue_number: 4430, position: 1, attempt: 2, state: "in_review", failure: null },
  ])
  expect(await sql('SELECT ordinal, status FROM todo_attempts ORDER BY ordinal')).toEqual([
    { ordinal: 1, status: "failed" }, { ordinal: 2, status: "published" },
  ])
})

test("Guest cannot retry; Member retries own, Maintainer anyone; agent uses same route", async () => {
  const host = runs()
  const h = await stackHarness(runtime, { actor: member, runs: host })
  await post(h, commitBody())
  await runtime.runPromise(Stack.report(host.started[0]!, { kind: "finished", state: "failed", failure: "implement" }, { runs: true }))
  for (const actor of [guest, { ...member, subject: { kind: "person" as const, id: "other" } }]) {
    const denied = await stackHarness(runtime, { actor, runs: host })
    expect((await post(denied, { opId: uuid(), op: "retry", number: 1 })).status).toBe(403)
  }
  const agent = await stackHarness(runtime, { actor: agentForMember, runs: host })
  expect((await post(agent, { opId: uuid(), op: "retry", number: 1 })).status).toBe(202)
  await runtime.runPromise(Stack.report(host.started[1]!, { kind: "finished", state: "failed", failure: "implement" }, { runs: true }))
  const maintainer = await stackHarness(runtime, { actor: noLogin, runs: host })
  expect((await post(maintainer, { opId: uuid(), op: "retry", number: 1 })).status).toBe(202)
  expect(host.started[2]).toMatchObject({ ordinal: 3 })
})
