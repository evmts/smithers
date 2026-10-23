// The git loop's routes (worker/github/Api.ts, docs/features/issues.md#routes) through their real handler, over this
// file's schema of the compose Postgres and Electric (`pnpm db:up`), with remote flows recorded or run on the Node host
// against the scripted GitHub (worker/github/test/harness.ts). Unhappy paths give the routes a faulty service; nothing
// intercepts a request.
import { Effect, Layer, Option, Redacted } from "effect"
import { beforeAll, beforeEach, describe, expect, test } from "vitest"
import * as Database from "../../db/Database.ts"
import * as TestDatabase from "../../db/TestDatabase.ts"
import { LOCAL_ELECTRIC_URL } from "../../src/features/chat/contract.ts"
import {
  applyExecutionId,
  COMMENTS_SHAPE_ROUTE,
  GITHUB_WEBHOOK_ROUTE,
  ITEMS_SHAPE_ROUTE,
  MAX_WEBHOOK_BYTES,
  MAX_WRITE_BYTES,
  reconcileBucketStart,
  reconcileExecutionId,
  SYNC_SHAPE_ROUTE,
  writeExecutionId,
  writesRoute,
  WRITES_SHAPE_ROUTE,
} from "../../src/features/issues/contract.ts"
import * as Actor from "../Actor.ts"
import { FlowStarter, StartUnavailable } from "../Flows.ts"
import { testFile } from "../test/harness.ts"
import { handles, parseWritesPath } from "./Api.ts"
import * as Metrics from "./Metrics.ts"
import { comments, items, REPOSITORY, reset, signedIn, sql, writeRow } from "./test/fixtures.ts"
import { app, delivery, githubHarness, member, sign, WEBHOOK_SECRET } from "./test/harness.ts"
import { scriptedGitHub } from "./test/scriptedGitHub.ts"

const runtime = testFile("github_api")

beforeAll(async () => {
  const health = `${LOCAL_ELECTRIC_URL}/v1/health`
  const response = await fetch(health).catch((error: unknown) => {
    throw TestDatabase.explain("Electric", new URL(health).host)(error)
  })
  if (!response.ok) throw new Error(`Electric answered ${response.status} to ${health}`)
})

beforeEach(() => reset(runtime))

const SENTINEL = "sentinel-content-5c2e"

const unreachable = Database.layer(Effect.succeed(Redacted.make("postgresql://smithers:smithers@127.0.0.1:1/smithers")))

const issuesEvent = (number: number, full = "acme/widgets") => ({
  action: "opened",
  repository: { full_name: full },
  issue: { number, title: SENTINEL },
})

const post = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: typeof body === "string" ? body : JSON.stringify(body),
})

const createWrite = (overrides: Record<string, unknown> = {}) => ({
  writeId: crypto.randomUUID(),
  op: "issue/create",
  title: "Crash on empty body",
  body: "Steps",
  ...overrides,
})

describe("paths", () => {
  test("the writes path is /api/repos/<owner>/<name>/writes, and nothing else", () => {
    expect(parseWritesPath(writesRoute("acme", "widgets"))).toEqual({ owner: "acme", name: "widgets" })
    expect(parseWritesPath("/api/repos/acme/widgets")).toBeUndefined()
    expect(parseWritesPath("/api/repos/acme/widgets/tree")).toBeUndefined()
    expect(parseWritesPath("/api/other/acme/widgets/writes")).toBeUndefined()
    expect(parseWritesPath("/api/repos/%E0%A4%A/widgets/writes")).toBeUndefined()
    expect(handles(GITHUB_WEBHOOK_ROUTE) && handles(ITEMS_SHAPE_ROUTE) && handles(writesRoute("a", "b"))).toBe(true)
    expect(handles("/api/repos/acme/widgets/tree/abc")).toBe(false)
  })
})

describe("POST /api/github/webhook", () => {
  test("a signed issues delivery starts github/Apply for its issue once, records it, and answers 200", async () => {
    const h = await githubHarness(runtime)
    const id = crypto.randomUUID()
    const first = await h.fetch(GITHUB_WEBHOOK_ROUTE, await delivery("issues", issuesEvent(7), { id }))
    expect(first.status).toBe(200)
    expect(h.starts).toEqual([
      {
        flow: "github/Apply",
        executionId: applyExecutionId(id),
        payload: { deliveryId: id, repo: "acme/widgets", number: 7, event: "issues" },
      },
    ])
    expect(await sql(runtime, `SELECT event, action, repo_id AS "repoId", subject FROM github_deliveries`)).toEqual([
      { event: "issues", action: "opened", repoId: REPOSITORY.id, subject: 7 },
    ])
    // GitHub redelivers: the same execution, which changes nothing, and the delivery counted as a duplicate.
    const again = await h.fetch(GITHUB_WEBHOOK_ROUTE, await delivery("issues", issuesEvent(7), { id }))
    expect(again.status).toBe(200)
    expect(h.count(Metrics.webhooks, { event: "issues", outcome: "applied" })).toBe(1)
    expect(h.count(Metrics.webhooks, { event: "issues", outcome: "duplicate" })).toBe(1)
    expect(h.line("github.webhook")[0]!.annotations).toMatchObject({ event: "issues", number: 7, outcome: "applied", status: 200 })
  })

  test("a comment delivery runs github/Apply to the end: GitHub's comment becomes a row", async () => {
    const h = await githubHarness(runtime, { run: true })
    h.github.open("On GitHub", "Body", "sam")
    h.github.comment(1, "Made on github.com", "maya")
    const response = await h.fetch(GITHUB_WEBHOOK_ROUTE, await delivery("issue_comment", { ...issuesEvent(1), action: "created" }))
    expect(response.status).toBe(200)
    await h.settled()
    expect(await items(runtime)).toEqual([expect.objectContaining({ number: 1, title: "On GitHub", comments: 1 })])
    expect(await comments(runtime)).toEqual([expect.objectContaining({ body: "Made on github.com", author: "maya" })])
  })

  test("deliveries naming no issue of this repository are recorded and answered, starting nothing", async () => {
    const h = await githubHarness(runtime)
    for (const sent of [
      await delivery("ping", { zen: "Keep it logically awesome." }),
      await delivery("issues", issuesEvent(1, "someone/else")),
      await delivery("issues", { action: "opened" }),
      await delivery("push", { ref: "refs/heads/main", repository: { full_name: "acme/widgets" } }),
    ]) {
      expect((await h.fetch(GITHUB_WEBHOOK_ROUTE, sent)).status).toBe(200)
    }
    expect(h.starts).toEqual([])
    expect(h.count(Metrics.webhooks, { event: "issues", outcome: "ignored" })).toBe(2)
    expect(await sql(runtime, `SELECT count(*)::int AS n FROM github_deliveries WHERE repo_id IS NULL`)).toEqual([{ n: 4 }])
  })

  test("refusals: a wrong or missing signature, no delivery id, a body too large, bad JSON, another method", async () => {
    const h = await githubHarness(runtime)
    const forged = await h.fetch(GITHUB_WEBHOOK_ROUTE, await delivery("issues", issuesEvent(1), { secret: "wrong" }))
    expect(forged.status).toBe(401)
    expect(await forged.json()).toEqual({ code: "invalid_signature" })
    const unsigned = await delivery("issues", issuesEvent(1), { signature: "" })
    expect((await h.fetch(GITHUB_WEBHOOK_ROUTE, unsigned)).status).toBe(401)
    const anonymous = await delivery("issues", issuesEvent(1))
    delete (anonymous.headers as Record<string, string>)["x-github-delivery"]
    expect((await h.fetch(GITHUB_WEBHOOK_ROUTE, anonymous)).status).toBe(400)
    const huge = "x".repeat(MAX_WEBHOOK_BYTES + 1)
    const tooLarge = await h.fetch(GITHUB_WEBHOOK_ROUTE, {
      method: "POST",
      headers: { "x-github-event": "issues", "x-github-delivery": "d1", "x-hub-signature-256": "sha256=00" },
      body: huge,
    })
    expect(tooLarge.status).toBe(413)
    const brokenUtf8 = await h.fetch(GITHUB_WEBHOOK_ROUTE, {
      method: "POST",
      headers: { "x-github-event": "issues", "x-github-delivery": "d2" },
      body: new Uint8Array([0xff, 0xfe]),
    })
    expect(brokenUtf8.status).toBe(400)
    const notJson = "not json"
    const signedGarbage = await h.fetch(GITHUB_WEBHOOK_ROUTE, {
      method: "POST",
      headers: {
        "x-github-event": "issues",
        "x-github-delivery": "d3",
        "x-hub-signature-256": await sign(notJson),
      },
      body: notJson,
    })
    expect(signedGarbage.status).toBe(400)
    const noEvent = await delivery("issues", issuesEvent(1))
    delete (noEvent.headers as Record<string, string>)["x-github-event"]
    expect((await h.fetch(GITHUB_WEBHOOK_ROUTE, noEvent)).status).toBe(400)
    const get = await h.fetch(GITHUB_WEBHOOK_ROUTE)
    expect(get.status).toBe(405)
    expect(h.starts).toEqual([])
    expect(h.count(Metrics.webhooks, { event: "issues", outcome: "refused" })).toBe(2)
    expect(h.count(Metrics.webhooks, { event: "issues", outcome: "too_large" })).toBe(1)
  })

  test("without the App's webhook secret the route refuses every delivery: 503 not_configured", async () => {
    for (const configured of [null, app({ webhookSecret: Option.none() })]) {
      const h = await githubHarness(runtime, { app: configured })
      const response = await h.fetch(GITHUB_WEBHOOK_ROUTE, await delivery("issues", issuesEvent(1)))
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({ code: "not_configured" })
    }
  })

  test("a start or Postgres that fails answers 503, so GitHub shows the delivery failed", async () => {
    const refusing = await githubHarness(runtime, {
      starter: FlowStarter.of({ start: () => Effect.fail(new StartUnavailable({ errorCode: "down" })) }),
    })
    expect((await refusing.fetch(GITHUB_WEBHOOK_ROUTE, await delivery("issues", issuesEvent(1)))).status).toBe(503)
    const offline = await githubHarness(runtime, { database: unreachable })
    expect((await offline.fetch(GITHUB_WEBHOOK_ROUTE, await delivery("ping", {}))).status).toBe(503)
    expect(offline.line("github.webhook")[0]!.annotations).toMatchObject({ outcome: "unavailable", status: 503 })
  })

  test("no record carries the payload or the secret", async () => {
    const h = await githubHarness(runtime)
    await h.fetch(GITHUB_WEBHOOK_ROUTE, await delivery("issues", issuesEvent(3)))
    await h.fetch(GITHUB_WEBHOOK_ROUTE, await delivery("issues", issuesEvent(3), { secret: "wrong" }))
    const text = JSON.stringify({ logs: h.logs, spans: h.spans.map((span) => [...span.attributes]) })
    expect(text).toContain("github.webhook")
    expect(text).not.toContain(SENTINEL)
    expect(text).not.toContain(WEBHOOK_SECRET)
  })
})

describe("POST /api/repos/<owner>/<name>/writes", () => {
  test("a person's write: recorded with their session, github/Write started under its id, 202 with the txid", async () => {
    const actor = member()
    const h = await githubHarness(runtime, { actor })
    const write = createWrite()
    const response = await h.fetch(writesRoute("acme", "widgets"), post(write))
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ txid: expect.any(Number), writeId: write.writeId })
    expect(h.starts).toEqual([
      { flow: "github/Write", executionId: writeExecutionId(write.writeId), payload: { writeId: write.writeId } },
    ])
    expect(
      await sql(runtime, `SELECT actor_id AS "actorId", session_id::text AS "sessionId", via, op, payload, status FROM github_writes`),
    ).toEqual([
      {
        actorId: actor.subject.id,
        sessionId: actor.session,
        via: "person",
        op: "issue/create",
        payload: { op: "issue/create", title: "Crash on empty body", body: "Steps" },
        status: "pending",
      },
    ])
    expect(h.line("github.write.request")[0]!.annotations).toMatchObject({
      op: "issue/create",
      via: "person",
      writeId: write.writeId,
      outcome: "started",
      status: 202,
    })
  })

  test("a resend answers the row and starts the same execution again; another payload under the id is 409", async () => {
    const h = await githubHarness(runtime)
    const write = createWrite()
    await h.fetch(writesRoute("acme", "widgets"), post(write))
    const again = await h.fetch(writesRoute("Acme", "Widgets"), post(write))
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ txid: null, writeId: write.writeId, status: "pending" })
    expect(h.starts.map((start) => start.executionId)).toEqual([
      writeExecutionId(write.writeId),
      writeExecutionId(write.writeId),
    ])
    const changed = await h.fetch(writesRoute("acme", "widgets"), post({ ...write, title: "Something else" }))
    expect(changed.status).toBe(409)
    expect(await changed.json()).toEqual({ code: "conflict" })
    // A settled write's resend starts nothing.
    await sql(runtime, `UPDATE github_writes SET status = 'done', item_number = 1, settled_at = now()`)
    const settled = await h.fetch(writesRoute("acme", "widgets"), post(write))
    expect(await settled.json()).toEqual({ txid: null, writeId: write.writeId, status: "done" })
    expect(h.starts).toHaveLength(2)
    expect(h.count(Metrics.writeRequests, { op: "issue/create", outcome: "existing" })).toBe(2)
  })

  test("end to end on the Node host: a person's issue and the agent's comment reach GitHub and settle with their rows", async () => {
    const github = scriptedGitHub("acme", "widgets")
    const token = github.userToken("maya")
    const person = await signedIn(runtime, { login: "maya", token })
    const actor = member(person.personId, person.sessionId)
    const h = await githubHarness(runtime, { actor, run: true, github })
    const issue = createWrite({ title: "Opened from Smithers" })
    expect((await h.fetch(writesRoute("acme", "widgets"), post(issue))).status).toBe(202)
    await h.settled()
    expect(await writeRow(runtime, issue.writeId)).toMatchObject({ status: "done", itemNumber: 1 })
    expect(github.issues.get(1)!.login).toBe("maya")
    // The agent's comment comes with its run credential: it acts for Maya, as the App.
    const agent = await githubHarness(runtime, { actor: { ...actor, act: { kind: "agent", id: "answer-1" } }, run: true, github })
    const reply = { writeId: crypto.randomUUID(), op: "issue/comment", number: 1, body: "On it" }
    expect((await agent.fetch(writesRoute("acme", "widgets"), post(reply))).status).toBe(202)
    await agent.settled()
    expect(github.issues.get(1)!.comments.map((comment) => [comment.login, comment.body.split("\n")[0]])).toEqual([
      ["smithers[bot]", "On it"],
    ])
    expect(await comments(runtime)).toEqual([expect.objectContaining({ writeId: reply.writeId, author: "smithers[bot]" })])
  })

  test.each([
    ["signed out", { actor: null }, 401, "authentication"],
    ["no role on the repository", { actor: { ...member(), role: null } }, 403, "forbidden"],
    ["no GitHub App", { app: null }, 503, "not_configured"],
  ] as const)("%s: %i %s, nothing recorded", async (_, options, status, code) => {
    const h = await githubHarness(runtime, options)
    const response = await h.fetch(writesRoute("acme", "widgets"), post(createWrite()))
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ code })
    expect(h.starts).toEqual([])
    expect(await sql(runtime, `SELECT * FROM github_writes`)).toEqual([])
  })

  test("a Guest's write goes as the Guest, never as the bot: their own write is taken, an agent's refused", async () => {
    const guest: Actor.Actor = { ...member(), role: "guest" }
    const h = await githubHarness(runtime, { actor: guest })
    // Opening an issue and commenting are Guest acts, with the Guest's own GitHub token.
    expect((await h.fetch(writesRoute("acme", "widgets"), post(createWrite()))).status).toBe(202)
    const comment = { writeId: crypto.randomUUID(), op: "issue/comment", number: 1, body: "Me too" }
    expect((await h.fetch(writesRoute("acme", "widgets"), post(comment))).status).toBe(202)
    // The App's token is the agent's, and a Guest has no agent: refused, nothing recorded or started.
    const agent = await githubHarness(runtime, { actor: { ...guest, act: { kind: "agent", id: "answer-1" } } })
    for (const write of [createWrite(), { ...comment, writeId: crypto.randomUUID() }]) {
      const refused = await agent.fetch(writesRoute("acme", "widgets"), post(write))
      expect(refused.status).toBe(403)
      expect(await refused.json()).toEqual({ code: "forbidden" })
    }
    expect(await sql(runtime, `SELECT via FROM github_writes ORDER BY created_at`)).toEqual([{ via: "person" }, { via: "person" }])
    expect(h.starts).toHaveLength(2)
    expect(agent.count(Metrics.writeRequests, { op: "issue/create", outcome: "forbidden" })).toBe(1)
  })

  test("a body that names who acts claims nothing: the request's session or run credential says", async () => {
    const h = await githubHarness(runtime)
    expect((await h.fetch(writesRoute("acme", "widgets"), post(createWrite({ via: "agent" })))).status).toBe(202)
    expect(await sql(runtime, `SELECT via FROM github_writes`)).toEqual([{ via: "person" }])
  })

  test("bounds: another repository, a bad body, a blank title, a write too large, a person with no session", async () => {
    const h = await githubHarness(runtime)
    expect((await h.fetch(writesRoute("someone", "else"), post(createWrite()))).status).toBe(404)
    for (const body of [
      "not json",
      createWrite({ writeId: "not-a-uuid" }),
      createWrite({ title: "   " }),
      createWrite({ title: "x".repeat(257) }),
      createWrite({ op: "issue/delete" }),
      { writeId: crypto.randomUUID(), op: "issue/comment", number: 0, body: "Hi" },
      { writeId: crypto.randomUUID(), op: "issue/comment", number: 1, body: " " },
    ]) {
      const response = await h.fetch(writesRoute("acme", "widgets"), post(body))
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ code: "invalid" })
    }
    const huge = await h.fetch(writesRoute("acme", "widgets"), post(createWrite({ body: "x".repeat(MAX_WRITE_BYTES) })))
    expect(huge.status).toBe(413)
    const broken = await h.fetch(writesRoute("acme", "widgets"), { method: "POST", body: new Uint8Array([0xc3, 0x28]) })
    expect(broken.status).toBe(400)
    expect((await h.fetch(writesRoute("acme", "widgets"))).status).toBe(405)
    const sessionless = await githubHarness(runtime, { actor: member(crypto.randomUUID(), null) })
    expect((await sessionless.fetch(writesRoute("acme", "widgets"), post(createWrite()))).status).toBe(401)
    // The agent acts as the App, so it needs no session.
    const agent = await githubHarness(runtime, {
      actor: { ...member(crypto.randomUUID(), null), act: { kind: "agent", id: "answer-1" } },
    })
    expect((await agent.fetch(writesRoute("acme", "widgets"), post(createWrite()))).status).toBe(202)
    expect(h.starts).toEqual([])
  })

  test("Postgres, sessions or the start failing answers 503, and the device sends again", async () => {
    const offline = await githubHarness(runtime, { database: unreachable })
    expect((await offline.fetch(writesRoute("acme", "widgets"), post(createWrite()))).status).toBe(503)
    const sessionsDown = await githubHarness(runtime, {
      sessions: Layer.succeed(Actor.Sessions, Actor.Sessions.of({ resolve: Effect.fail(new Actor.SessionsUnavailable()) })),
    })
    expect((await sessionsDown.fetch(writesRoute("acme", "widgets"), post(createWrite()))).status).toBe(503)
    const refusing = await githubHarness(runtime, {
      starter: FlowStarter.of({ start: () => Effect.fail(new StartUnavailable({ errorCode: "down" })) }),
    })
    const write = createWrite()
    const response = await refusing.fetch(writesRoute("acme", "widgets"), post(write))
    expect(response.status).toBe(503)
    expect(refusing.line("github.write.request")[0]!.annotations).toMatchObject({
      outcome: "unavailable",
      errorCode: "@smthrs/mvp/flows/StartUnavailable",
    })
    // The row stayed pending: the resend starts it.
    const h = await githubHarness(runtime)
    expect((await h.fetch(writesRoute("acme", "widgets"), post(write))).status).toBe(200)
    expect(h.starts).toHaveLength(1)
  })

  test("no record carries a title or a body", async () => {
    const h = await githubHarness(runtime)
    await h.fetch(writesRoute("acme", "widgets"), post(createWrite({ title: SENTINEL, body: SENTINEL })))
    const text = JSON.stringify({ logs: h.logs, spans: h.spans.map((span) => [...span.attributes]) })
    expect(text).toContain("github.write.request")
    expect(text).not.toContain(SENTINEL)
  })
})

describe("the shapes", () => {
  const shape = (h: Awaited<ReturnType<typeof githubHarness>>, route: string) =>
    h.fetch(`${route}?offset=-1`).then(async (response) => ({ status: response.status, rows: (await response.json()) as Array<{ value?: Record<string, unknown> }> }))
  const values = (rows: Array<{ value?: Record<string, unknown> }>) => rows.flatMap((row) => (row.value === undefined ? [] : [row.value]))

  const seed = async () => {
    await sql(
      runtime,
      `INSERT INTO items (id, repo_id, number, kind, github_id, title, body, state, created_at, updated_at,
        source_updated_at, fetched_at)
      VALUES ('${REPOSITORY.id}#1', '${REPOSITORY.id}', 1, 'issue', 11, 'One', 'Body', 'open', now(), now(), now(), now()),
        ('github/someone/else#1', 'github/someone/else', 1, 'issue', 12, 'Other', '', 'open', now(), now(), now(), now())`,
    )
    await sql(
      runtime,
      `INSERT INTO comments (id, repo_id, item_id, github_id, body, created_at, updated_at, source_updated_at, fetched_at)
      VALUES ('${REPOSITORY.id}/comment/5', '${REPOSITORY.id}', '${REPOSITORY.id}#1', 5, 'Hi', now(), now(), now(), now())`,
    )
  }

  test("items and comments: this repository's rows, with only their listed columns", async () => {
    await seed()
    const h = await githubHarness(runtime)
    const listed = await shape(h, ITEMS_SHAPE_ROUTE)
    expect(listed.status).toBe(200)
    const [item] = values(listed.rows)
    expect(values(listed.rows)).toHaveLength(1)
    expect(item).toMatchObject({ id: `${REPOSITORY.id}#1`, title: "One" })
    expect(Object.keys(item!)).not.toContain("source_updated_at")
    expect(Object.keys(item!)).not.toContain("fetched_at")
    const listedComments = values((await shape(h, COMMENTS_SHAPE_ROUTE)).rows)
    expect(listedComments).toEqual([expect.objectContaining({ id: `${REPOSITORY.id}/comment/5`, body: "Hi" })])
    expect(Object.keys(listedComments[0]!)).not.toContain("fetched_at")
  })

  test("a read of stale issues starts github/Reconcile once per 5 minutes; fresh ones start nothing", async () => {
    const h = await githubHarness(runtime)
    await shape(h, ITEMS_SHAPE_ROUTE)
    await shape(h, ITEMS_SHAPE_ROUTE)
    await expect.poll(() => h.starts.map((start) => start.flow), { timeout: 10_000 }).toEqual(["github/Reconcile", "github/Reconcile"])
    expect(new Set(h.starts.map((start) => start.executionId)).size).toBe(1)
    expect(h.starts[0]!.executionId).toBe(reconcileExecutionId(REPOSITORY.id, Date.now()))
    // Every read in the bucket asks with the bucket's start, so their starts are one intent.
    expect(h.starts.map((start) => start.payload)).toEqual([0, 1].map(() => ({
      repo: `${REPOSITORY.owner}/${REPOSITORY.name}`,
      requestedAtMs: reconcileBucketStart(Date.now()),
    })))
    await sql(runtime, `INSERT INTO github_sync (repo_id, stream, synced_at, complete) VALUES ('${REPOSITORY.id}', 'issues', now(), true)`)
    await shape(h, ITEMS_SHAPE_ROUTE)
    expect(h.starts).toHaveLength(2)
    const synced = values((await shape(h, SYNC_SHAPE_ROUTE)).rows)
    expect(synced).toEqual([{ repo_id: REPOSITORY.id, stream: "issues", synced_at: expect.any(String), complete: "true", failure: null }])
    // Without the App nothing starts, and a failed start still serves the rows.
    const off = await githubHarness(runtime, { app: null })
    await sql(runtime, `UPDATE github_sync SET synced_at = now() - interval '1 hour'`)
    expect((await shape(off, ITEMS_SHAPE_ROUTE)).status).toBe(200)
    expect(off.starts).toEqual([])
    const refusing = await githubHarness(runtime, {
      starter: FlowStarter.of({ start: () => Effect.fail(new StartUnavailable({ errorCode: "down" })) }),
    })
    expect((await shape(refusing, ITEMS_SHAPE_ROUTE)).status).toBe(200)
    await expect.poll(() => refusing.line("github.reconcile.start")[0]?.annotations, { timeout: 10_000 }).toMatchObject({ outcome: "not_started" })
  })

  test("github-writes: only the signed-in person's own writes, their status only; signed out, none; sessions down, 503", async () => {
    const mine = member()
    const h = await githubHarness(runtime, { actor: mine })
    const ours = createWrite()
    await h.fetch(writesRoute("acme", "widgets"), post(ours))
    const theirs = await githubHarness(runtime)
    await theirs.fetch(writesRoute("acme", "widgets"), post(createWrite()))
    const listed = values((await shape(h, WRITES_SHAPE_ROUTE)).rows)
    expect(listed).toEqual([
      {
        id: ours.writeId,
        repo_id: REPOSITORY.id,
        op: "issue/create",
        status: "pending",
        failure: null,
        item_number: null,
        created_at: expect.any(String),
        settled_at: null,
      },
    ])
    const nobody = await githubHarness(runtime, { actor: null })
    expect(values((await shape(nobody, WRITES_SHAPE_ROUTE)).rows)).toEqual([])
    const sessionsDown = await githubHarness(runtime, {
      sessions: Layer.succeed(Actor.Sessions, Actor.Sessions.of({ resolve: Effect.fail(new Actor.SessionsUnavailable()) })),
    })
    // Sessions down: refused, never the shape of nobody under the device's handle.
    const refused = await sessionsDown.fetch(`${WRITES_SHAPE_ROUTE}?offset=-1&handle=h-1`)
    expect([refused.status, refused.headers.get("retry-after")]).toEqual([503, "5"])
  })

  test("signed out: a repository GitHub said is private, or hasn't said, is refused; a public one's rows are served", async () => {
    await seed()
    const visitor = await githubHarness(runtime, { actor: null })
    // Not yet known: refused, though the read still starts the sync that will find out.
    for (const route of [ITEMS_SHAPE_ROUTE, COMMENTS_SHAPE_ROUTE, SYNC_SHAPE_ROUTE]) {
      const response = await visitor.fetch(`${route}?offset=-1`)
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ code: "authentication" })
    }
    await expect.poll(() => visitor.starts.map((start) => start.flow), { timeout: 10_000 }).toEqual(["github/Reconcile"])
    // Private: refused to a visitor and to a person with no role on it; served to a Member, whom GitHub lets see it.
    await sql(runtime, `INSERT INTO github_repositories (repo_id, github_id, private) VALUES ('${REPOSITORY.id}', 1, true)`)
    expect((await shape(visitor, ITEMS_SHAPE_ROUTE)).status).toBe(401)
    expect((await shape(visitor, COMMENTS_SHAPE_ROUTE)).status).toBe(401)
    const outsider = await githubHarness(runtime, { actor: { ...member(), role: null } })
    const forbidden = await outsider.fetch(`${ITEMS_SHAPE_ROUTE}?offset=-1`)
    expect(forbidden.status).toBe(403)
    expect(await forbidden.json()).toEqual({ code: "forbidden" })
    const insider = await githubHarness(runtime)
    expect(values((await shape(insider, ITEMS_SHAPE_ROUTE)).rows)).toEqual([expect.objectContaining({ title: "One" })])
    expect(visitor.count(Metrics.shapes, { table: "items", status: "401", live: "false" })).toBe(2)
    // Public: anyone reads.
    await sql(runtime, `UPDATE github_repositories SET private = false`)
    expect(values((await shape(visitor, ITEMS_SHAPE_ROUTE)).rows)).toEqual([expect.objectContaining({ title: "One" })])
    expect(values((await shape(visitor, COMMENTS_SHAPE_ROUTE)).rows)).toEqual([expect.objectContaining({ body: "Hi" })])
    // Sessions or Postgres down: neither signed in nor signed out, so nothing is served.
    const sessionsDown = await githubHarness(runtime, {
      sessions: Layer.succeed(Actor.Sessions, Actor.Sessions.of({ resolve: Effect.fail(new Actor.SessionsUnavailable()) })),
    })
    expect((await shape(sessionsDown, ITEMS_SHAPE_ROUTE)).status).toBe(503)
    const offline = await githubHarness(runtime, { actor: null, database: unreachable })
    expect((await shape(offline, COMMENTS_SHAPE_ROUTE)).status).toBe(503)
  })

  test("any other path under the routes is 404", async () => {
    const h = await githubHarness(runtime)
    expect((await h.fetch("/api/shapes/elsewhere")).status).toBe(404)
  })
})


test("untrusted webhook event names have bounded metric attributes", async () => {
  const h = await githubHarness(runtime)
  const event = "untrusted-" + crypto.randomUUID()
  expect((await h.fetch(GITHUB_WEBHOOK_ROUTE, await delivery(event, {}, { signature: "sha256=bad" }))).status).toBe(401)
  expect(h.count(Metrics.webhooks, { event, outcome: "refused" })).toBe(0)
  expect(h.count(Metrics.webhooks, { event: "unknown", outcome: "refused" })).toBe(1)
})

test("Apply starts only after its delivery's received time is durable", async () => {
  const seen: unknown[] = []
  const h = await githubHarness(runtime, {
    starter: FlowStarter.of({ start: () => Effect.promise(async () => {
      seen.push(await sql(runtime, "SELECT delivery_id FROM github_deliveries"))
    }) }),
  })
  const id = crypto.randomUUID()
  expect((await h.fetch(GITHUB_WEBHOOK_ROUTE, await delivery("issues", issuesEvent(7), { id }))).status).toBe(200)
  expect(seen).toEqual([[{ delivery_id: id }]])
})

test("item reads finish while reconciliation launch remains unresolved", async () => {
  let launchPending = false
  const h = await githubHarness(runtime, {
    starter: FlowStarter.of({ start: () => Effect.sync(() => { launchPending = true }).pipe(Effect.andThen(Effect.never)) }),
  })
  const controller = new AbortController()
  try {
    const response = await h.fetch(`${ITEMS_SHAPE_ROUTE}?offset=-1`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
    })
    expect(response.status).toBe(200)
    await expect.poll(() => launchPending, { timeout: 10_000 }).toBe(true)
  } finally {
    controller.abort()
  }
})

test("cached public visibility cannot authorize rows after GitHub becomes private", async () => {
  await sql(runtime, `INSERT INTO github_repositories (repo_id, github_id, private) VALUES ('${REPOSITORY.id}', 1, false)`)
  const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
  github.private = true
  const h = await githubHarness(runtime, { actor: null, github, app: app({ privateKey: await import("./test/scriptedGitHub.ts").then((m) => m.appKey()) }) })
  for (const route of [ITEMS_SHAPE_ROUTE, COMMENTS_SHAPE_ROUTE, SYNC_SHAPE_ROUTE]) {
    expect((await h.fetch(`${route}?offset=-1`)).status).toBe(401)
  }
  expect(h.count(Metrics.visibilityReads, { outcome: "private" })).toBe(3)
  expect(h.line("github.visibility")).toHaveLength(3)
})


test("a cached public grant fails closed when current GitHub metadata is unavailable", async () => {
  await sql(runtime, `INSERT INTO github_repositories (repo_id, github_id, private) VALUES ('${REPOSITORY.id}', 1, false)`)
  const github = scriptedGitHub(REPOSITORY.owner, REPOSITORY.name)
  github.faults.push({ match: (method, path) => method === "GET" && path === "/repos/acme/widgets", status: 502 })
  const h = await githubHarness(runtime, { actor: null, github })
  expect((await h.fetch(`${COMMENTS_SHAPE_ROUTE}?offset=-1`)).status).toBe(503)
  expect(h.count(Metrics.visibilityReads, { outcome: "unavailable" })).toBe(1)
  expect(h.line("github.visibility")[0]!.annotations).toMatchObject({ outcome: "unavailable" })
})
