import { afterEach, expect, test } from "bun:test"
import { createAppStore } from "../AppStore"
import { createHostedChangeSeam, codingResultOf, codingActivityOf } from "./HostedChangeSeam"
import type { SeamContext } from "./SeamContext"
import type { HostedSession } from "./HostedChange"
import { HostedSessionSchema } from "./HostedChangeSchema"
const session: HostedSession = {
  id: "session",
  status: "completed",
  reason_code: null,
  reason: null,
  retryable: false,
  workspace: { id: "box", name: "agent", status: "ready" },
  run: { id: 42, status: "success", model: "provider:model", started_at: null, finished_at: null }
}
const result = { head_commit: "abc", head_change_id: "change", test_receipt: null }
const stops: (() => void)[] = []
afterEach(() => {
  for (const stop of stops.splice(0)) stop()
})
const setup = async (http: SeamContext["http"]) => {
  const data = new Map<string, string>()
  const store = await createAppStore({
    kind: "localStorage",
    storage: {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => {
        data.set(k, v)
      },
      removeItem: (k) => {
        data.delete(k)
      }
    }
  })
  await store.dispatch({
    type: "identity.session.loaded",
    actor: "system",
    state: "signed-in",
    login: "maya",
    admin: false,
    scopesPlain: null
  }).isPersisted.promise
  let disposed = false
  stops.push(() => {
    disposed = true
  })
  let work: Promise<unknown> | undefined
  const ctx: SeamContext = {
    store,
    http,
    baseUrl: "",
    dispatch: store.dispatch,
    actor: () => "user",
    nextOrdinal: store.nextOrdinal,
    isDisposed: () => disposed,
    withToast: async (_key, _title, _done, run) => {
      const pending = run()
      work = pending
      return pending
    }
  }
  return { store, seam: createHostedChangeSeam(ctx), done: () => work, ctx, data }
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
test("start, dedupe, follow to done, and opened pull", async () => {
  const hits: string[] = []
  const h = await setup(async (url, init) => {
    hits.push(`${init?.method ?? "GET"} ${url}`)
    if (url.endsWith("/landing"))
      return json(
        {
          landing_number: 12,
          branch: "smithers/landing-12",
          pull_number: 37,
          pull_url: "https://github.com/maya/tinyhttp/pull/37",
          head_commit: "abc",
          tested: false,
          passed: false
        },
        201
      )
    if (url.endsWith("/files")) return json([{ path: "src/slug.ts", additions: 18, deletions: 0 }])
    if (url.split("?")[0]!.endsWith("/messages"))
      return json(
        init?.method === "POST" ? {} : [{ role: "assistant", parts: [{ type: "coding_result", content: result }] }]
      )
    return json(init?.method === "POST" ? { id: "session" } : session)
  })
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "add slugify" })
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "add slugify" })
  await h.done()
  expect(hits.filter((hit) => hit === "POST /api/repos/maya/tinyhttp/agent/sessions")).toHaveLength(1)
  const row = h.store.session().hostedChanges![0]!
  expect(row.phase).toBe("done")
  expect(row.files).toEqual([{ path: "src/slug.ts", additions: 18, deletions: 0 }])
  expect(h.store.collections.cards.get(`hosted-change-${row.id}`)?.payload).toEqual({
    repo: row.repo,
    sessionId: "session",
    request: row.request
  })
  await h.seam.openHostedPull({ repo: row.repo, session: row.id })
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(h.store.session().hostedChanges![0]!.pull?.pull_number).toBe(37)
})
test("failed session retains its reason and retryable signal", async () => {
  const h = await setup(async (url, init) =>
    json(
      url.split("?")[0]!.endsWith("/messages")
        ? []
        : init?.method === "POST"
          ? { id: "session" }
          : { ...session, status: "failed", reason: "No machine is free.", retryable: true }
    )
  )
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "change" })
  await h.done()
  expect(h.store.session().hostedChanges![0]).toMatchObject({
    phase: "failed",
    session: { reason: "No machine is free.", retryable: true }
  })
})
test("unresolved launch returns after durable admission and keeps toast running", async () => {
  let release!: (response: Response) => void
  const response = new Promise<Response>((resolve) => {
    release = resolve
  })
  const h = await setup(async () => response)
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "change" })
  expect(h.store.session().hostedChanges![0]?.phase).toBe("starting")
  let finished = false
  void h.done()?.then(() => {
    finished = true
  })
  await new Promise((resolve) => setTimeout(resolve, 5))
  expect(finished).toBe(false)
  stops.splice(0).forEach((stop) => stop())
  release(json({ id: "session" }))
  await h.done()
})
test("reload reconnects a recorded session without creating or posting again", async () => {
  const hits: string[] = []
  const h = await setup(async (url, init) => {
    hits.push(init?.method ?? "GET")
    return json(
      url.split("?")[0]!.endsWith("/messages")
        ? [{ role: "assistant", parts: [{ type: "coding_result", content: result }] }]
        : url.endsWith("/files")
          ? []
          : session
    )
  })
  await h.store.dispatch({
    type: "hosted.changes.changed",
    actor: "system",
    requests: [
      {
        id: "saved",
        repo: "maya/tinyhttp",
        request: "change",
        sessionId: "session",
        owner: "maya",
        phase: "running",
        accepted: true,
        session: null,
        result: null,
        pull: null,
        files: [],
        error: null,
        stages: {}
      }
    ]
  }).isPersisted.promise
  h.seam.resume()
  await h.done()
  expect(hits.every((hit) => hit === "GET")).toBe(true)
  expect(h.store.session().hostedChanges![0]?.phase).toBe("done")
})
test("already_landed restores the existing pull instead of showing an error", async () => {
  const pull = {
    landing_number: 12,
    branch: "smithers/landing-12",
    pull_number: 37,
    pull_url: "https://github.com/maya/tinyhttp/pull/37",
    head_commit: "abc",
    tested: false,
    passed: false
  }
  const h = await setup(async () =>
    json({ code: "already_landed", message: "Pull request #37 already exists", details: pull }, 409)
  )
  await h.store.dispatch({
    type: "hosted.changes.changed",
    actor: "system",
    requests: [
      {
        id: "saved",
        repo: "maya/tinyhttp",
        request: "change",
        sessionId: "session",
        owner: "maya",
        phase: "done",
        accepted: true,
        session,
        result,
        pull: null,
        files: [],
        error: null,
        stages: {}
      }
    ]
  }).isPersisted.promise
  await h.seam.openHostedPull({ repo: "maya/tinyhttp", session: "saved" })
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(h.store.session().hostedChanges![0]).toMatchObject({ pull, error: null })
})
test("landing receipt drift preserves the ready change and states the refusal", async () => {
  const h = await setup(async () => json({ code: "head_receipt_mismatch" }, 409))
  await h.store.dispatch({
    type: "hosted.changes.changed",
    actor: "system",
    requests: [
      {
        id: "saved",
        repo: "maya/tinyhttp",
        request: "change",
        sessionId: "session",
        owner: "maya",
        phase: "done",
        accepted: true,
        session,
        result,
        pull: null,
        files: [{ path: "src/slug.ts" }],
        error: null,
        stages: {}
      }
    ]
  }).isPersisted.promise
  await h.seam.openHostedPull({ repo: "maya/tinyhttp", session: "saved" })
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(h.store.session().hostedChanges![0]).toMatchObject({
    phase: "done",
    pull: null,
    files: [{ path: "src/slug.ts" }],
    error: "Tests not run at this commit. Run the change again before opening a pull request."
  })
})

test("a new store restores the session observation and resumes with GET only", async () => {
  const hits: string[] = []
  const h = await setup(async (url, init) => {
    hits.push(init?.method ?? "GET")
    return json(
      url.split("?")[0]!.endsWith("/messages")
        ? [{ role: "assistant", parts: [{ type: "coding_result", content: result }] }]
        : url.endsWith("/files")
          ? []
          : session
    )
  })
  await h.store.dispatch({
    type: "hosted.changes.changed",
    actor: "system",
    requests: [
      {
        id: "saved",
        repo: "maya/tinyhttp",
        request: "change",
        sessionId: "session",
        owner: "maya",
        phase: "running",
        accepted: true,
        session,
        result: null,
        pull: null,
        files: [],
        error: null,
        stages: { Admitted: 100 }
      }
    ]
  }).isPersisted.promise
  const restored = await createAppStore({
    kind: "localStorage",
    storage: {
      getItem: (key) => h.data.get(key) ?? null,
      setItem: (key, value) => {
        h.data.set(key, value)
      },
      removeItem: (key) => {
        h.data.delete(key)
      }
    }
  })
  expect(restored.session().hostedChanges?.[0]?.stages).toEqual({ Admitted: 100 })
  const seam = createHostedChangeSeam({
    ...h.ctx,
    store: restored,
    dispatch: restored.dispatch,
    nextOrdinal: restored.nextOrdinal
  })
  seam.resume()
  await h.done()
  expect(restored.session().hostedChanges?.[0]?.phase).toBe("done")
  expect(hits.every((method) => method === "GET")).toBe(true)
})

test("an unacknowledged launch never replays a POST after reload", async () => {
  let calls = 0
  const h = await setup(async () => {
    calls++
    return json({})
  })
  for (const sessionId of [null, "session"]) {
    await h.store.dispatch({
      type: "hosted.changes.changed",
      actor: "system",
      requests: [
        {
          id: "uncertain",
          repo: "maya/tinyhttp",
          request: "change",
          sessionId,
          owner: "maya",
          phase: "starting",
          accepted: false,
          session: null,
          result: null,
          pull: null,
          files: [],
          error: null,
          stages: {}
        }
      ]
    }).isPersisted.promise
    h.seam.resume()
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(h.store.session().hostedChanges?.[0]).toMatchObject({
      phase: "failed",
      error: "The launch was interrupted before acceptance was recorded."
    })
  }
  expect(calls).toBe(0)
})

test("coding_result belongs to the last assistant reply, never an older reply", () => {
  const reply = { role: "assistant", parts: [{ type: "coding_result", content: result }] }
  expect(
    codingResultOf([reply, { role: "assistant", parts: [{ type: "text", content: { value: "No change" } }] }])
  ).toBeNull()
  expect(codingResultOf([{ role: "user", parts: [] }, reply])).toEqual(result)
  expect(codingResultOf([{ role: "user", parts: [{ type: "coding_result", content: result }] }])).toBeNull()
})

test.each(["cancelled", "timed_out"] as const)("%s is terminal and retains the backend reason", async (status) => {
  const h = await setup(async (url, init) =>
    json(
      url.split("?")[0]!.endsWith("/messages")
        ? []
        : init?.method === "POST"
          ? { id: "session" }
          : {
              ...session,
              status,
              reason: "The machine stopped.",
              retryable: true,
              run: { ...session.run!, status: "cancelled" }
            }
    )
  )
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "change" })
  await h.done()
  expect(h.store.session().hostedChanges![0]).toMatchObject({
    phase: "failed",
    error: "The machine stopped.",
    session: { status, retryable: true }
  })
})
test("an observed GitHub merge survives in durable state; no merge request is sent", async () => {
  const hits: string[] = []
  const h = await setup(async (url, init) => {
    hits.push(`${init?.method ?? "GET"} ${url}`)
    return json({
      state: "closed",
      merged: true,
      merged_by: { login: "maya" },
      merge_commit_sha: "9c1e2ab",
      base: { ref: "main" }
    })
  })
  await h.store.dispatch({
    type: "hosted.changes.changed",
    actor: "system",
    requests: [
      {
        id: "saved",
        repo: "maya/tinyhttp",
        request: "change",
        sessionId: "session",
        owner: "maya",
        phase: "done",
        accepted: true,
        session,
        result,
        pull: {
          landing_number: 12,
          branch: "smithers/landing-12",
          pull_number: 37,
          pull_url: "https://github.com/maya/tinyhttp/pull/37",
          head_commit: "abc",
          tested: false,
          passed: false
        },
        files: [],
        error: null,
        stages: {}
      }
    ]
  }).isPersisted.promise
  h.seam.resume()
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(h.store.session().hostedChanges![0]?.merged).toEqual({ by: "maya", commit: "9c1e2ab" })
  expect(hits).toEqual(["GET /api/user/github-repos/maya/tinyhttp/pulls/37"])
})

test("message envelopes and malformed content cannot borrow an older coding result", () => {
  expect(
    codingResultOf({ messages: [{ role: "assistant", parts: [{ type: "coding_result", content: result }] }] })
  ).toEqual(result)
  for (const invalid of [null, { messages: [null] }, [{ role: "assistant", parts: [null] }], { messages: "bad" }])
    expect(codingResultOf(invalid)).toBeNull()
})
test("GitHub's refusal sentence stays on the ready card", async () => {
  const h = await setup(async () =>
    json({ code: "github_unavailable", message: "GitHub couldn't open the pull request. Try again." }, 502)
  )
  await h.store.dispatch({
    type: "hosted.changes.changed",
    actor: "system",
    requests: [
      {
        id: "saved",
        repo: "maya/tinyhttp",
        request: "change",
        sessionId: "session",
        owner: "maya",
        phase: "done",
        accepted: true,
        session,
        result,
        pull: null,
        files: [],
        error: null,
        stages: {}
      }
    ]
  }).isPersisted.promise
  await h.seam.openHostedPull({ repo: "maya/tinyhttp", session: "saved" })
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(h.store.session().hostedChanges![0]).toMatchObject({
    phase: "done",
    error: "GitHub couldn't open the pull request. Try again.",
    pull: null
  })
})

test("model disclosures use observed assistant activity only", () => {
  expect(
    codingActivityOf([{ role: "user", parts: [{ type: "text", content: { value: "user request" } }] }])
  ).toBeUndefined()
  expect(
    codingActivityOf([
      { role: "assistant", parts: [{ type: "text", content: { value: "Writing src/slug.ts and its test" } }] }
    ])
  ).toBe("Writing src/slug.ts and its test")
  expect(codingActivityOf([{ role: "assistant", parts: [{ type: "text", content: { value: 4 } }] }])).toBeUndefined()
})

// Wire fixtures follow lane A services/agent.go AgentSessionResponse/AgentMessageResponse,
// agent_session_read.go AgentSessionRun, and routes/agent_sessions.go ListMessages.
const backendSession = {
  id: "session",
  repository_id: 1,
  user_id: 7,
  title: "change",
  status: "completed",
  message_count: 131,
  created_at: "2026-10-19T10:00:00Z",
  updated_at: "2026-10-19T10:01:12Z",
  metadata: {},
  workspace: null,
  run: { id: 42, status: "success" },
  reason_code: null,
  reason: null,
  retryable: false
}
const backendMessage = (sequence: number) => ({
  id: sequence,
  session_id: "session",
  role: sequence === 131 ? "assistant" : "user",
  sequence,
  parts: [
    {
      part_index: 0,
      type: sequence === 131 ? "coding_result" : "text",
      content: sequence === 131 ? result : { value: `Message ${sequence}` }
    }
  ],
  created_at: "2026-10-19T10:01:12Z"
})
test("lane A numeric run without metadata and nullable records survive parsing with extra fields", () => {
  const parsed = HostedSessionSchema.parse({ ...backendSession, run: { ...backendSession.run, future: true } })
  expect(parsed.run).toEqual({ id: 42, status: "success", future: true })
  expect(parsed.message_count).toBe(131)
  expect(parsed.repository_id).toBe(1)
  expect(HostedSessionSchema.parse({ ...backendSession, run: null }).run).toBeNull()
  expect(parsed.workspace).toBeNull()
  expect(
    HostedSessionSchema.parse({
      ...backendSession,
      run: { ...backendSession.run, model: null, started_at: null, finished_at: null }
    }).run
  ).toMatchObject({ model: null, started_at: null, finished_at: null })
})
for (const count of [131, 100, 1])
  test(`reads the newest reply of 131 backend messages with observed count ${count}`, async () => {
    const cursors: number[] = []
    const h = await setup(async (url, init) => {
      const at = new URL(url, "https://smithers.test")
      if (at.pathname.endsWith("/messages")) {
        if (init?.method === "POST") return json(backendMessage(1), 201)
        expect(at.searchParams.get("limit")).toBe("100")
        const cursor = Number(at.searchParams.get("cursor"))
        expect(cursor % 100).toBe(0)
        cursors.push(cursor)
        return json(Array.from({ length: 131 }, (_, i) => backendMessage(i + 1)).slice(cursor, cursor + 100))
      }
      if (url.endsWith("/files")) return json([{ path: "src/slug.ts" }])
      if (url.endsWith("/diff")) return json({ diff: "+slugify" })
      return json(
        init?.method === "POST" ? { ...backendSession, status: "active" } : { ...backendSession, message_count: count }
      )
    })
    await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "change" })
    await h.done()
    expect(cursors).toEqual(count === 131 ? [100] : [0, 100])
    expect(h.store.session().hostedChanges![0]).toMatchObject({ phase: "done", result, session: { run: { id: 42 } } })
    expect(h.store.session().hostedChanges![0]!.error).toBeNull()
  })
test("an unusable session response becomes a visible failure rather than a stranded run", async () => {
  const h = await setup(async (_url, init) =>
    json(init?.method === "POST" ? { id: "session" } : { ...backendSession, run: { id: false, status: "success" } })
  )
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "change" })
  await h.done()
  expect(h.store.session().hostedChanges![0]).toMatchObject({
    phase: "failed",
    error: "The agent run could not be read."
  })
})

test("a full final page follows appended replies until the short page", async () => {
  const cursors: number[] = []
  const h = await setup(async (url, init) => {
    const at = new URL(url, "https://smithers.test")
    if (at.pathname.endsWith("/messages")) {
      if (init?.method === "POST") return json(backendMessage(1), 201)
      const cursor = Number(at.searchParams.get("cursor"))
      cursors.push(cursor)
      const messages = Array.from({ length: 201 }, (_, i) => ({
        ...backendMessage(i + 1),
        role: i === 200 ? "assistant" : "user",
        parts: i === 200 ? [{ part_index: 0, type: "coding_result", content: result }] : []
      }))
      return json(messages.slice(cursor, cursor + 100))
    }
    if (url.endsWith("/files")) return json([])
    if (url.endsWith("/diff")) return json({ diff: "" })
    return json(backendSession)
  })
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "change" })
  await h.done()
  expect(cursors).toEqual([100, 200])
  expect(h.store.session().hostedChanges![0]).toMatchObject({ phase: "done", result })
})
