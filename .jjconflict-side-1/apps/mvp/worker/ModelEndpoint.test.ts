// The metered model endpoint (worker/ModelEndpoint.ts, docs/features/model-endpoint.md), through ChatApi's routes on
// this file's own schema of the compose Postgres. The model provider is the only scripted seam: the deployment's
// default model is a scripted `Model` (worker/test/harness.ts), and a model an admin sets is a real HostModel reaching
// a scripted provider on loopback HTTP. `admin/SetModel` runs on the Node host (worker/test/flowHost.ts).
import { Model, ModelError, ModelProxy, ModelRequest } from "@smthrs/model"
import { Effect, Exit, Layer, Redacted, Schema, Stream } from "effect"
import { FetchHttpClient } from "effect/http"
import { SqlClient } from "effect/sql"
import { createServer, type IncomingHttpHeaders, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import * as Database from "../db/Database.ts"
import * as TestDatabase from "../db/TestDatabase.ts"
import { type Actor, CurrentActor, Sessions, SessionsUnavailable } from "./Actor.ts"
import * as ModelEndpoint from "./ModelEndpoint.ts"
import * as ModelRoles from "./ModelRoles.ts"
import * as SetModel from "./SetModel.ts"
import { runFlow } from "./test/flowHost.ts"
import { delta, harness, recorded, stop, testFile, usage } from "./test/harness.ts"

const runtime = testFile("model_endpoint")

beforeEach(() =>
  runtime.runPromise(
    Effect.flatMap(SqlClient.SqlClient, (sql) => sql`TRUNCATE model_roles, model_role_changes, model_usage`),
  )
)

const admin: Actor = { subject: { kind: "person", id: "person-admin" }, role: "admin" }
const member: Actor = { subject: { kind: "person", id: "person-member" }, role: "member" }
const agentForAdmin: Actor = { ...admin, act: { kind: "agent", id: "agent-run-1" } }

const ask = (text: string, overrides: Partial<ConstructorParameters<typeof ModelRequest.ModelRequest>[0]> = {}) =>
  ModelRequest.ModelRequest.make({
    modelId: "browser-choice",
    system: [ModelRequest.SystemPart.make({ text: "browser system" })],
    messages: [ModelRequest.Message.user(text)],
    tools: [],
    params: ModelRequest.GenerationParams.make({ maxTokens: 999_999 }),
    ...overrides,
  })

const body = (request: ModelRequest.ModelRequest) =>
  JSON.stringify(Schema.encodeSync(ModelRequest.ModelRequest)(request))

type Harness = Awaited<ReturnType<typeof harness>>

/** One `POST /api/model/<role>`: its status, its NDJSON lines or error body. */
const call = async (h: Harness, request: ModelRequest.ModelRequest, role = "agent") => {
  const response = await h.fetch(`/api/model/${role}`, { method: "POST", body: body(request) })
  const text = await response.text()
  const lines = response.status === 200 ? text.split("\n").filter((line) => line !== "").map((line) => JSON.parse(line)) : []
  return { status: response.status, lines, error: response.status === 200 ? undefined : JSON.parse(text || "null") }
}

/** A default model that answers "default answer", reports usage and stops. */
const answering = () => Stream.make(delta("default answer"), usage, stop)

const usageRows = () =>
  runtime.runPromise(
    Effect.flatMap(
      SqlClient.SqlClient,
      (sql) =>
        sql<{
          readonly role: string
          readonly modelId: string
          readonly inputTokens: number
          readonly outputTokens: number
        }>`SELECT role, model_id AS "modelId", input_tokens AS "inputTokens", output_tokens AS "outputTokens"
          FROM model_usage ORDER BY created_at`,
    ),
  )

const scratchDatabase = () =>
  runtime.runPromise(Effect.map(TestDatabase.Scratch, (scratch) => scratch.database))

/** Runs `admin/SetModel` on the Node host as `actor`, writing to this file's schema. */
const setModel = async (actor: Actor, change: { readonly role: "agent" | "renderer" | "judge"; readonly model: ModelRoles.ModelRecord }) =>
  runFlow(
    SetModel.SetModel,
    change,
    SetModel.registration(await scratchDatabase()).pipe(Layer.provide(Layer.succeed(CurrentActor, actor))),
  )

// A scripted provider on loopback: an OpenAI-compatible chat endpoint that answers with `text`, or fails.
const servers: Array<Server> = []
afterEach(() => Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done)))))

const provider = async (respond: { readonly text?: string; readonly status?: number; readonly error?: string }) => {
  const seen: Array<{ readonly headers: IncomingHttpHeaders; readonly body: Record<string, unknown> }> = []
  const server = createServer((request, response) => {
    let raw = ""
    request.on("data", (chunk) => (raw += chunk))
    request.on("end", () => {
      seen.push({ headers: request.headers, body: JSON.parse(raw) })
      if (respond.status !== undefined) {
        response.writeHead(respond.status, { "content-type": "application/json" })
        return response.end(JSON.stringify({ error: { message: respond.error } }))
      }
      response.writeHead(200, { "content-type": "text/event-stream" })
      const chunk = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`
      response.end(
        chunk({ id: "c1", choices: [{ index: 0, delta: { content: respond.text } }] }) +
          chunk({ id: "c1", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }) +
          chunk({ id: "c1", choices: [], usage: { prompt_tokens: 3, completion_tokens: 2 } }) +
          "data: [DONE]\n\n",
      )
    })
  })
  servers.push(server)
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return { origin, seen }
}

/** A record for a model behind `origin`, whose key the Worker holds as `FIXTURE`. */
const rowModel = (origin: string, modelId = "row-model"): ModelRoles.ModelRecord => ({
  protocol: "openai-chat",
  baseUrl: origin,
  modelId,
  credential: "FIXTURE",
})

const keyConfig = (origin: string, key = "row-key") => ({
  SMITHERS_MODEL_KEY_FIXTURE: key,
  SMITHERS_MODEL_KEY_FIXTURE_ORIGIN: origin,
})

describe("sign-in", () => {
  test("a signed-out call is refused with 401 and never reaches a model", async () => {
    const h = await harness(runtime, answering)

    const { status, error } = await call(h, ask("hi"))

    expect(status).toBe(401)
    expect(error).toMatchObject({ code: "authentication", message: "Sign in to ask Smithers." })
    expect(h.requests).toEqual([])
    expect(await usageRows()).toEqual([])
    expect(h.only("model.proxy.serve").annotations).toMatchObject({ role: "agent", outcome: "refused", status: 401 })
  })

  test.each([
    ["a Guest", "guest" as const],
    ["a person with no role", null],
  ])("%s is refused with 403, never reaches a model, and nothing is metered", async (_, role) => {
    const h = await harness(runtime, answering, { actor: { subject: { kind: "person", id: "person-other" }, role } })

    const { status, error } = await call(h, ask("hi"))

    expect(status).toBe(403)
    expect(error).toMatchObject({ code: "authentication", message: "Asking Smithers needs the Member role." })
    expect(h.requests).toEqual([])
    expect(await usageRows()).toEqual([])
    expect(h.only("model.proxy.serve").annotations).toMatchObject({ role: "agent", outcome: "refused", status: 403 })
  })

  test("sessions that can't be read are 503 provider_internal, logged by their code, and never reach a model", async () => {
    const h = await harness(runtime, answering, {
      sessions: Layer.succeed(Sessions, Sessions.of({ resolve: Effect.fail(new SessionsUnavailable()) })),
    })

    const { status, error } = await call(h, ask("hi"))

    expect(status).toBe(503)
    expect(error).toMatchObject({ code: "provider_internal" })
    expect(h.requests).toEqual([])
    expect(h.only("model.endpoint").annotations).toMatchObject({
      role: "agent",
      errorCode: "@smthrs/mvp/auth/SessionsUnavailable",
    })
  })

  test("a signed-in call streams the role's model and ends with the end line", async () => {
    const h = await harness(runtime, answering, { actor: member })

    const { status, lines } = await call(h, ask("hi"))

    expect(status).toBe(200)
    expect(lines).toEqual([
      { type: "text-delta", id: "t", text: "default answer" },
      { type: "usage", inputTokens: 12, outputTokens: 34 },
      { type: "settle", stopReason: "stop" },
      { type: "end" },
    ])
  })

  test("the browser's ModelProxy client reads the endpoint as a Model", async () => {
    const h = await harness(runtime, answering, { actor: member })
    const fetch: typeof globalThis.fetch = (input, init) =>
      h.fetch(new URL(String(input)).pathname, init as RequestInit)

    const events = await Effect.runPromise(
      Effect.gen(function* () {
        const model = yield* Model.Model
        return yield* Stream.runCollect(model.stream(ask("hi")))
      }).pipe(
        Effect.provide(ModelProxy.layerClient({ url: "http://chat.test/api/model/agent" })),
        Effect.provide(FetchHttpClient.layer),
        Effect.provideService(FetchHttpClient.Fetch, fetch),
      ),
    )

    expect(Array.from(events).flatMap((event) => event.type === "text-delta" ? [event.text] : [])).toEqual([
      "default answer",
    ])
  })

  test("an unknown role is 404", async () => {
    const h = await harness(runtime, answering, { actor: member })

    expect((await call(h, ask("hi"), "poet")).status).toBe(404)
    expect((await h.fetch("/api/model", { method: "POST", body: body(ask("hi")) })).status).toBe(404)
  })
})

describe("what the model receives", () => {
  test("the role's model id and bounded output, with the caller's conversation, system prompt and tools", async () => {
    const h = await harness(runtime, answering, { actor: member, config: { MODEL_MAX_OUTPUT_TOKENS: "500" } })
    const tools = [ModelRequest.ToolDefinition.make({ name: "open_file", description: "Open a file", parameters: {} })]

    await call(h, ask("hi", { tools, params: ModelRequest.GenerationParams.make({ thinkingBudget: 9_000 }) }))
    await call(h, ask("again", { params: ModelRequest.GenerationParams.make({ maxTokens: 100 }) }))

    const [first, second] = h.requests
    expect(first!.modelId).toBe("test-model")
    expect(first!.system.map((part) => part.text)).toEqual(["browser system"])
    expect(first!.tools.map((tool) => tool.name)).toEqual(["open_file"])
    expect(first!.params).toMatchObject({ maxTokens: 500, thinkingBudget: 500 })
    expect(second!.params.maxTokens).toBe(100)
    expect(second!.params.thinkingBudget).toBeUndefined()
  })

  test.each([
    ["provider-run tools", ask("q", { serverTools: [{ type: "web_search" }] }), "Send no provider-run tools."],
    ["no messages", ask("q", { messages: [] }), "Send at least one message."],
    [
      "more messages than MODEL_MAX_MESSAGES",
      ask("q", { messages: [ModelRequest.Message.user("a"), ModelRequest.Message.user("b"), ModelRequest.Message.user("c")] }),
      "Send at most 2 messages.",
    ],
  ] as const)("refuses %s with 400", async (_, request, message) => {
    const h = await harness(runtime, answering, { actor: member, config: { MODEL_MAX_MESSAGES: "2" } })

    const { status, error } = await call(h, request)

    expect(status).toBe(400)
    expect(error).toMatchObject({ code: "invalid_request", message })
    expect(h.requests).toEqual([])
  })
})

describe("roles", () => {
  test("a role with no setting uses the deployment's default model", async () => {
    const h = await harness(runtime, answering, { actor: member, modelId: "default-model" })

    await call(h, ask("hi"), "renderer")

    expect(h.requests[0]!.modelId).toBe("default-model")
    expect(h.only("model.proxy.serve").annotations).toMatchObject({ role: "renderer", modelId: "default-model" })
  })

  test("a role change made by admin/SetModel applies on the next call, with no deploy", async () => {
    const upstream = await provider({ text: "row answer" })
    const h = await harness(runtime, answering, { actor: member, config: keyConfig(upstream.origin) })

    const before = await call(h, ask("first"))
    const ran = await setModel(admin, { role: "agent", model: rowModel(upstream.origin) })
    const after = await call(h, ask("second"))

    expect(before.lines[0]).toEqual({ type: "text-delta", id: "t", text: "default answer" })
    expect(Exit.isSuccess(ran.exit) && ran.exit.value).toEqual({ role: "agent", modelId: "row-model" })
    expect(ran.status).toBe("completed")
    expect(after.lines.filter((line) => line.type === "text-delta")).toEqual([
      { type: "text-delta", id: expect.any(String), text: "row answer" },
    ])
    expect(upstream.seen).toHaveLength(1)
    expect(upstream.seen[0]!.body.model).toBe("row-model")
    expect(upstream.seen[0]!.headers.authorization).toBe("Bearer row-key")
    expect(h.requests).toHaveLength(1)
    // The other roles keep the default.
    await call(h, ask("third"), "judge")
    expect(h.requests).toHaveLength(2)
  })

  test("admin/SetModel records who changed what, once per step", async () => {
    const ran = await setModel(admin, { role: "judge", model: rowModel("https://models.example", "judge-1") })

    const [row] = await runtime.runPromise(
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) =>
          sql<{ readonly model: unknown; readonly updatedBy: string }>`
            SELECT model, updated_by AS "updatedBy" FROM model_roles WHERE role = 'judge'`,
      ),
    )
    const changes = await runtime.runPromise(
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql<{ readonly role: string; readonly changedBy: string }>`
          SELECT role, changed_by AS "changedBy" FROM model_role_changes`,
      ),
    )
    expect(Exit.isSuccess(ran.exit)).toBe(true)
    expect(row).toEqual({ model: rowModel("https://models.example", "judge-1"), updatedBy: "person-admin" })
    expect(changes).toEqual([{ role: "judge", changedBy: "person-admin" }])
  })

  test.each([
    ["an agent acting for an admin", agentForAdmin, "delegated"],
    ["a member", member, "not_admin"],
  ] as const)("%s can't run admin/SetModel, and nothing is written", async (_, actor, reason) => {
    const ran = await setModel(actor, { role: "agent", model: rowModel("https://models.example") })

    expect(Exit.isFailure(ran.exit)).toBe(true)
    expect(Exit.isFailure(ran.exit) && JSON.stringify(ran.exit.cause)).toContain(reason)
    expect(ran.status).toBe("failed")
    const counts = await runtime.runPromise(
      Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql<{ readonly settings: number; readonly changes: number }>`
          SELECT (SELECT count(*)::int FROM model_roles) AS settings,
            (SELECT count(*)::int FROM model_role_changes) AS changes`),
    )
    expect(counts).toEqual([{ settings: 0, changes: 0 }])
  })

  test("a setting the Worker can't use is refused with 503 no_route, logged by its reason", async () => {
    const h = await harness(runtime, answering, { actor: member })
    await setModel(admin, { role: "agent", model: rowModel("https://models.example") })
    await runtime.runPromise(
      Effect.flatMap(SqlClient.SqlClient, (sql) => sql`
        INSERT INTO model_roles (role, model, updated_by) VALUES ('judge', '{"modelId": 1}'::jsonb, 'person-admin')`),
    )

    const missingKey = await call(h, ask("hi"))
    const notARecord = await call(h, ask("hi"), "judge")

    for (const { status, error } of [missingKey, notARecord]) {
      expect(status).toBe(503)
      expect(error).toMatchObject({ code: "no_route", message: "This model isn't available." })
    }
    expect(h.line("model.endpoint").map(({ annotations }) => [annotations.role, annotations.errorCode])).toEqual([
      ["agent", "unusable:credential_unknown"],
      ["judge", "unusable:invalid"],
    ])
    expect(h.requests).toEqual([])
  })
})

describe("database failures", () => {
  test("a role lookup Postgres refuses is a 503 provider_internal, logged by its SQL reason", async () => {
    const sql = (statement: string) =>
      runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, (client) => client.unsafe(statement)))
    await sql("ALTER TABLE model_roles RENAME TO model_roles_away")
    const h = await harness(runtime, answering, { actor: member })

    try {
      const { status, error } = await call(h, ask("hi"))

      expect(status).toBe(503)
      expect(error).toMatchObject({ code: "provider_internal" })
      expect(h.only("model.endpoint").annotations).toMatchObject({ role: "agent", errorCode: expect.stringMatching(/^sql:/) })
    } finally {
      await sql("ALTER TABLE model_roles_away RENAME TO model_roles")
    }
  })
})

describe("budget and metering", () => {
  test("each served call records what it spent, by role and model, as a row and a metric", async () => {
    const h = await harness(runtime, answering, { actor: member })

    await call(h, ask("hi"))
    await call(h, ask("hi"), "renderer")

    expect(await usageRows()).toEqual([
      { role: "agent", modelId: "test-model", inputTokens: 12, outputTokens: 34 },
      { role: "renderer", modelId: "test-model", inputTokens: 12, outputTokens: 34 },
    ])
    expect(h.count(ModelProxy.tokens, { role: "agent", type: "output", model: "test-model" })).toBe(34)
    expect(h.count(ModelProxy.tokens, { role: "renderer", type: "input", model: "test-model" })).toBe(12)
    expect(h.count(ModelEndpoint.usageWrites, { outcome: "recorded" })).toBe(2)
  })

  test("calls that repeat one request id each book what they spent, against the budget", async () => {
    // One call spends 46 tokens (12 in, 34 out); the budget allows two.
    const h = await harness(runtime, answering, { actor: member, config: { MODEL_DAILY_TOKEN_BUDGET: "92" } })
    const repeat = () =>
      h.fetch("/api/model/agent", {
        method: "POST",
        headers: { [ModelProxy.requestIdHeader]: "same" },
        body: body(ask("hi")),
      }).then((response) => response.text().then(() => response.status))

    expect([await repeat(), await repeat(), await repeat()]).toEqual([200, 200, 429])
    expect(h.requests).toHaveLength(2)
    const rows = await runtime.runPromise(
      Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql<{ readonly invocationId: string; readonly requestId: string; readonly tokens: number }>`
          SELECT invocation_id AS "invocationId", request_id AS "requestId", input_tokens + output_tokens AS tokens
          FROM model_usage ORDER BY created_at`),
    )
    expect(rows.map(({ requestId, tokens }) => ({ requestId, tokens }))).toEqual([
      { requestId: "same", tokens: 46 },
      { requestId: "same", tokens: 46 },
    ])
    // Each row is keyed by the call the server served, the id its log line carries, never by the caller's id.
    expect(rows.map((row) => row.invocationId)).toEqual(
      h.line("model.proxy.serve").filter((line) => line.annotations.status === 200).map((line) =>
        line.annotations.invocationId
      ),
    )
  })

  test("a call is refused with 429 quota_exceeded once today's spend reaches the budget", async () => {
    // One call spends 46 tokens (12 in, 34 out).
    const h = await harness(runtime, answering, { actor: member, config: { MODEL_DAILY_TOKEN_BUDGET: "46" } })

    const first = await call(h, ask("hi"))
    const second = await call(h, ask("hi"))

    expect(first.status).toBe(200)
    expect(second.status).toBe(429)
    expect(second.error).toMatchObject({ code: "quota_exceeded", message: "Today's model budget is spent." })
    expect(h.requests).toHaveLength(1)
  })

  test("yesterday's spend doesn't count against today's budget", async () => {
    await runtime.runPromise(
      Effect.flatMap(SqlClient.SqlClient, (sql) => sql`
        INSERT INTO model_usage (invocation_id, request_id, role, model_id, input_tokens, output_tokens, created_at)
        VALUES ('old', 'old', 'agent', 'test-model', 1000, 1000, now() - interval '2 days')`),
    )
    const h = await harness(runtime, answering, { actor: member, config: { MODEL_DAILY_TOKEN_BUDGET: "50" } })

    expect((await call(h, ask("hi"))).status).toBe(200)
  })

  test("a usage row that can't be written is logged and counted, and the answer still ends cleanly", async () => {
    await runtime.runPromise(
      Effect.flatMap(SqlClient.SqlClient, (sql) =>
        Effect.andThen(
          sql`CREATE FUNCTION refuse_usage() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'refused'; END $$`,
          sql`CREATE TRIGGER refuse_usage BEFORE INSERT ON model_usage FOR EACH ROW EXECUTE FUNCTION refuse_usage()`,
        )),
    )
    const h = await harness(runtime, answering, { actor: member })

    try {
      const { lines } = await call(h, ask("hi"))

      expect(lines.at(-1)).toEqual({ type: "end" })
      expect(h.count(ModelEndpoint.usageWrites, { outcome: "error" })).toBe(1)
      expect(h.only("model.usage").annotations).toMatchObject({ role: "agent", errorCode: expect.stringMatching(/^sql:/) })
    } finally {
      await runtime.runPromise(
        Effect.flatMap(SqlClient.SqlClient, (sql) =>
          Effect.andThen(sql`DROP TRIGGER refuse_usage ON model_usage`, sql`DROP FUNCTION refuse_usage()`)),
      )
    }
  })

  test("Postgres being unreachable refuses with 503 provider_internal, logged by its SQL reason", async () => {
    const unreachable = Database.layer(Effect.succeed(Redacted.make("postgresql://nobody:nothing@127.0.0.1:1/none")))
    const h = await harness(runtime, answering, { actor: member, database: unreachable })

    const { status, error } = await call(h, ask("hi"))

    expect(status).toBe(503)
    expect(error).toMatchObject({ code: "provider_internal" })
    expect(h.only("model.endpoint").annotations).toMatchObject({ errorCode: expect.stringMatching(/^sql:/) })
    expect(h.requests).toEqual([])
  })
})

describe("telemetry", () => {
  test("never carries the prompt, the answer, the provider's error text or the key", async () => {
    const sentinel = "SENTINEL-model-endpoint-41c9"
    const key = "sk-SENTINEL-key-77d0"
    const upstream = await provider({ status: 400, error: `provider says ${sentinel}` })
    const h = await harness(
      runtime,
      (request) =>
        Stream.make(delta(`echo ${JSON.stringify(request.messages)}`), usage).pipe(
          Stream.concat(Stream.fail(new ModelError.ModelError({ code: "provider_internal", message: sentinel }))),
        ),
      { actor: member, config: keyConfig(upstream.origin, key) },
    )

    const echoed = await call(h, ask(`tell me about ${sentinel}`))
    await setModel(admin, { role: "renderer", model: rowModel(upstream.origin) })
    const failed = await call(h, ask(`tell me about ${sentinel}`), "renderer")

    expect(JSON.stringify(echoed.lines)).toContain(sentinel)
    expect(JSON.stringify(failed.lines)).not.toContain(sentinel)
    expect(upstream.seen[0]!.headers.authorization).toBe(`Bearer ${key}`)
    const exported = recorded(h)
    expect(exported).not.toContain(sentinel)
    expect(exported).not.toContain(key)
  })
})
