import { afterEach, expect, test } from "bun:test"
import { createAppStore } from "../AppStore"
import { createHostedChangeSeam, codingResultOf, codingActivityOf, type HostedChangeScheduler } from "./HostedChangeSeam"
import type { SeamContext } from "./SeamContext"
import type { HostedSession } from "./HostedChange"
import { HostedObservationSchema, HostedSessionSchema } from "./HostedChangeSchema"
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
const setup = async (http: SeamContext["http"], clock?: HostedChangeScheduler) => {
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
  return { store, seam: createHostedChangeSeam(ctx, clock), done: () => work, ctx, data }
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

test("a Smithers-native repository's pull request refusal is one plain sentence on the ready card", async () => {
  const h = await setup(async () =>
    json({ code: "github_destination_required", message: "This repository isn't connected to GitHub." }, 409)
  )
  await h.store.dispatch({
    type: "hosted.changes.changed",
    actor: "system",
    requests: [{ id: "saved", repo: "maya/tinyhttp", request: "change", sessionId: "session", owner: "maya", phase: "done",
      accepted: true, session, result, pull: null, files: [], error: null, stages: {} }]
  }).isPersisted.promise
  await h.seam.openHostedPull({ repo: "maya/tinyhttp", session: "saved" })
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(h.store.session().hostedChanges![0]).toMatchObject({
    phase: "done",
    error: "This repository isn't connected to GitHub, so a pull request can't open here.",
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

test("session creation marks Admitted done while the message POST is unresolved", async () => {
 let release!: (response: Response) => void
 let posting!: () => void
 const started = new Promise<void>(resolve => { posting = resolve })
 const response = new Promise<Response>(resolve => { release = resolve })
 const h = await setup(async url => {
   if (url.endsWith("/agent/sessions")) return json({ id: "session" }, 201)
   posting(); return response
 })
 await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "change" })
 await started
 const row = h.store.session().hostedChanges![0]!
 expect(row.phase).toBe("running")
 expect(row.accepted).toBe(false)
 expect(row.stages.Admitted).toBeNumber()
 stops.splice(0).forEach(stop => stop())
 release(json({}))
 await h.done()
})

test.each([{baseCommit: "abc", files: [{path: "src/slug.ts"}]}, {baseCommit: "base", files: []}])("completed no-change outcome retains final reply and survives reload decoding: %j", async ({baseCommit, files}) => {
 const h = await setup(async (url, init) => {
  if (url.endsWith("/files")) return json(files)
  if (url.endsWith("/diff")) return json({diff: ""})
  if (url.split("?")[0]!.endsWith("/messages")) return json(init?.method === "POST" ? {} : [{role: "assistant", parts: [{type: "text", content: {value: "The tools failed; no change made."}}, {type: "coding_result", content: result}]}])
  return json(init?.method === "POST" ? {id: "session"} : {...session, base_commit: baseCommit})
 })
 await h.seam.askHostedChange({repo: "maya/tinyhttp", request: "edit files"})
 await h.done()
 const row = h.store.session().hostedChanges![0]!
 expect(row.phase).toBe("done")
 expect(row.noChange).toBe(true)
 expect(row.outcome).toBe("The tools failed; no change made.")
 expect(row.files).toEqual([...files])
 expect(HostedObservationSchema.parse(JSON.parse(JSON.stringify(row))).outcome).toBe(row.outcome)
})

test("no_turn_head becomes a no-change outcome and cannot retry landing", async () => {
 let calls = 0
 const h = await setup(async () => { calls++; return json({code: "no_turn_head", message: "No turn head"}, 422) })
 await h.store.dispatch({type: "hosted.changes.changed", actor: "system", requests: [{
  id: "saved", repo: "maya/tinyhttp", request: "change", sessionId: "session", owner: "maya",
  phase: "done", accepted: true, session, result, pull: null, files: [{path: "src/slug.ts"}], filesRead: true,
  outcome: "No edits were made.", error: null, stages: {}
 }]}).isPersisted.promise
 await h.seam.openHostedPull({repo: "maya/tinyhttp", session: "saved"})
 for (let i = 0; i < 100 && !h.store.session().hostedChanges![0]!.noChange; i++) await new Promise(resolve => setTimeout(resolve, 1))
 expect(h.store.session().hostedChanges![0]).toMatchObject({noChange: true, outcome: "No edits were made.", error: null, pull: null})
 await h.seam.openHostedPull({repo: "maya/tinyhttp", session: "saved"})
 expect(calls).toBe(1)
})


test("browser no-change fixture completes with empty files and an offline testing reason", async () => {
  const head = "b".repeat(40)
  const finishedAt = "2026-10-19T10:01:12Z"
  const codingResult = {
    head_commit: head,
    head_change_id: "turn-head",
    test_not_run: {
      reason_code: "runtime_offline_unavailable",
      reason: "Runtime offline execution is unavailable"
    },
    test_receipt: null
  }
  const outcome = "The tools failed; no change made."
  const reads: string[] = []
  const h = await setup(async (url, init) => {
    const path = new URL(url, "https://smithers.test").pathname
    if (init?.method === "POST") return json(path.endsWith("/messages") ? {} : { id: "hosted-session" }, 201)
    reads.push(path)
    if (path.endsWith("/messages")) return json([
      { id: 1, session_id: "hosted-session", sequence: 1, role: "user", created_at: finishedAt,
        parts: [{ part_index: 0, type: "text", content: { value: "add slugify(text) with tests" } }] },
      { id: 3, session_id: "hosted-session", sequence: 2, role: "assistant", created_at: finishedAt,
        parts: [{ part_index: 1, type: "text", content: { value: outcome } },
          { part_index: 0, type: "coding_result", content: codingResult }] }
    ])
    if (path.endsWith("/files")) return json([])
    if (path.endsWith("/diff")) return json({ file_diffs: [
      { path: "src/slug.ts", additions: 18, deletions: 0, patch: "+export function slugify(text) {}" },
      { path: "test/slug.test.ts", additions: 23, deletions: 0, patch: "+test('slugify')" }
    ] })
    return json({ ...session, id: "hosted-session", message_count: 2, base_commit: head,
      run: { id: 42, status: "success", model: "cerebras:qwen-3.8-27b",
        started_at: "2026-10-19T10:00:00Z", finished_at: finishedAt } })
  })
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "add slugify(text) with tests" })
  await h.done()
  expect(reads).toEqual([
    "/api/repos/maya/tinyhttp/agent/sessions/hosted-session",
    "/api/repos/maya/tinyhttp/agent/sessions/hosted-session/messages",
    `/api/repos/maya/tinyhttp/changes/${head}/files`,
    `/api/repos/maya/tinyhttp/changes/${head}/diff`
  ])
  expect(h.store.session().hostedChanges![0]).toMatchObject({
    phase: "done", noChange: true, filesRead: true, files: [], result: codingResult,
    outcome, error: null, pull: null, session: { status: "completed" }
  })
})

// The agent's head is unlanded: the changes index answers 404 for its change id and 200 for its commit
// (QA b-zg9aml). Every read of the agent's work goes by head_commit (PM d-n65pkn).
const agentRepo = (headCommit: string | null) => {
  const sha = "c3a73c11".padEnd(40, "0")
  const codingResult = { head_commit: headCommit === null ? null : sha, head_change_id: "suoowzuo", test_receipt: null }
  const reads: string[] = []
  const http = async (url: string, init?: RequestInit) => {
    const path = new URL(url, "https://smithers.test").pathname
    if (init?.method === "POST") return json(path.endsWith("/messages") ? {} : { id: "hosted-session" }, 201)
    reads.push(path)
    if (path.endsWith("/messages")) return json([
      { id: 3, session_id: "hosted-session", sequence: 2, role: "assistant", created_at: "2026-10-19T10:01:12Z",
        parts: [{ part_index: 0, type: "coding_result", content: codingResult }] }
    ])
    if (path.includes("/changes/suoowzuo")) return json({ code: "not_found", message: "commit not found" }, 404)
    if (path.endsWith("/files")) return json([{ path: "index.js" }, { path: "index.test.js" }])
    if (path.endsWith("/diff")) return json({ file_diffs: [
      { path: "index.js", additions: 20, deletions: 1, patch: "+export const x = 1" },
      { path: "index.test.js", additions: 1, deletions: 0, patch: "+test('x')" }
    ] })
    return json({ ...session, id: "hosted-session", message_count: 1, base_commit: "a".repeat(40),
      run: { id: 42, status: "success", model: "m", started_at: "2026-10-19T10:00:00Z", finished_at: "2026-10-19T10:01:12Z" } })
  }
  return { sha, reads, http }
}
test("a finished turn reads the agent's files and diff by head_commit, never by change id", async () => {
  const repo = agentRepo("sha")
  const h = await setup(repo.http)
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "change" })
  await h.done()
  expect(repo.reads.filter(path => path.includes("/changes/"))).toEqual([
    `/api/repos/maya/tinyhttp/changes/${repo.sha}/files`,
    `/api/repos/maya/tinyhttp/changes/${repo.sha}/diff`
  ])
  expect(h.store.session().hostedChanges![0]).toMatchObject({ phase: "done", filesRead: true })
  expect(h.store.session().hostedChanges![0]?.filesError).toBeUndefined()
  expect(h.store.session().hostedChanges![0]?.files.map(file => file.path)).toEqual(["index.js", "index.test.js"])
})
test("opening the agent's diff before a pull request reads it by head_commit", async () => {
  const repo = agentRepo("sha")
  const h = await setup(repo.http)
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "change" })
  await h.done()
  const id = h.store.session().hostedChanges![0]!.id
  repo.reads.length = 0
  await h.seam.openHostedDiff(id)
  expect(repo.reads).toEqual([`/api/repos/maya/tinyhttp/changes/${repo.sha}/diff`])
  expect(h.store.session().hostedChanges![0]).toMatchObject({ diffOpen: true })
})
test("a coding result without a head commit makes no change read", async () => {
  const repo = agentRepo(null)
  const h = await setup(repo.http)
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "change" })
  await h.done()
  expect(repo.reads.some(path => path.includes("/changes/"))).toBe(false)
})
const fakeScheduler = () => {
  const pending = new Map<number, { delay: number; callback: () => void }>()
  const delays: number[] = []
  let ordinal = 0
  return {
    pending, delays,
    schedule(delay: number, callback: () => void) {
      delays.push(delay)
      const id = ++ordinal
      pending.set(id, { delay, callback })
      return () => { pending.delete(id) }
    },
    advance() {
      const first = pending.entries().next().value!
      expect(first).toBeDefined()
      pending.delete(first[0])
      first[1].callback()
    }
  }
}
const until = async (condition: () => boolean) => {
  for (let i = 0; i < 100 && !condition(); i++) await new Promise(resolve => setTimeout(resolve, 0))
  expect(condition()).toBe(true)
}
const busyReason = "The workspace service is busy starting other boxes; try again in a moment."
for (const path of ["session", "start"] as const) {
  test(`box_busy ${path}: retries at 2, 4, 8, 16 seconds and Try again starts a fresh cycle`, async () => {
    const clock = fakeScheduler()
    let starts = 0
    const h = await setup(async (url, init) => {
      if (url.endsWith("/agent/sessions") && init?.method === "POST") {
        starts++
        return path === "start" ? json({ code: "box_busy" }, 503) : json({ id: `session-${starts}` }, 201)
      }
      if (url.split("?")[0]!.endsWith("/messages")) return json([])
      return json({ ...session, status: "failed", reason_code: "box_busy", reason: busyReason, retryable: true })
    }, clock)
    const request = { repo: "maya/tinyhttp", request: "change" }
    await h.seam.askHostedChange(request)
    for (const [index, delay] of [2000, 4000, 8000, 16000].entries()) {
      await until(() => clock.pending.size === 1)
      const row = h.store.session().hostedChanges!.at(-1)!
      expect(row).toMatchObject({ phase: "running", busyWaiting: true, error: null })
      expect(starts).toBe(index + 1)
      expect(clock.delays[index]).toBe(delay)
      clock.advance()
    }
    await h.done()
    expect(starts).toBe(5)
    expect(clock.pending.size).toBe(0)
    expect(h.store.session().hostedChanges!.at(-1)).toMatchObject({
      phase: "failed", busyWaiting: false, busyRetries: 4, error: busyReason
    })
    await h.seam.askHostedChange(request)
    await until(() => clock.pending.size === 1)
    expect(starts).toBe(6)
    expect(clock.delays.at(-1)).toBe(2000)
    h.seam.cancelHostedRetries()
    await h.done()
    expect(clock.pending.size).toBe(0)
  })
}
// A box_busy that ends a queue wait or a long attempt is not retried automatically (8e f-85pitc).
test("a box_busy after a queue wait goes straight to Try again, without another start", async () => {
  const clock = fakeScheduler()
  let starts = 0
  let reads = 0
  const h = await setup(async (url, init) => {
    if (url.endsWith("/agent/sessions") && init?.method === "POST") { starts++; return json({ id: `session-${starts}` }, 201) }
    if (url.split("?")[0]!.endsWith("/messages")) return json([])
    return json(reads++ === 0
      ? { ...session, status: "active", run: null, workspace: null, stage: "queued", queued_at: "2026-10-19T06:30:00-07:00" }
      : { ...session, status: "failed", reason_code: "box_busy", reason: busyReason, retryable: true })
  }, clock)
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "change" })
  for (let i = 0; i < 20 && h.store.session().hostedChanges![0]?.phase !== "failed"; i++) {
    await until(() => clock.pending.size > 0 || h.store.session().hostedChanges![0]?.phase === "failed")
    if (clock.pending.size > 0) clock.advance()
  }
  await h.done()
  expect(starts).toBe(1)
  expect(clock.pending.size).toBe(0)
  expect(h.store.session().hostedChanges![0]).toMatchObject({ phase: "failed", busyWaiting: false, error: busyReason })
})
test("a box_busy after more than a minute of attempt goes straight to Try again", async () => {
  let time = 0
  const clock = { ...fakeScheduler(), now: () => time }
  let starts = 0
  const h = await setup(async (url, init) => {
    if (url.endsWith("/agent/sessions") && init?.method === "POST") { starts++; return json({ id: `session-${starts}` }, 201) }
    if (url.split("?")[0]!.endsWith("/messages")) return json([])
    time += 61_000
    return json({ ...session, status: "failed", reason_code: "box_busy", reason: busyReason, retryable: true })
  }, clock)
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "change" })
  await h.done()
  expect(starts).toBe(1)
  expect(clock.delays).toEqual([])
  expect(h.store.session().hostedChanges![0]).toMatchObject({ phase: "failed", busyWaiting: false, error: busyReason })
})
test("the busy backoff starts with the waiting state, not after its write persists", async () => {
  const clock = fakeScheduler()
  let starts = 0
  const h = await setup(async (url, init) => {
    if (url.endsWith("/agent/sessions") && init?.method === "POST") { starts++; return json({ id: `session-${starts}` }, 201) }
    if (url.split("?")[0]!.endsWith("/messages")) return json([])
    return json({ ...session, status: "failed", reason_code: "box_busy", reason: busyReason, retryable: true })
  }, clock)
  // The waiting state's write stays unpersisted until released, as a slow view-state write does in the browser.
  const held: (() => void)[] = []
  const dispatch = h.ctx.dispatch
  Object.assign(h.ctx, {
    dispatch: ((event: Parameters<typeof dispatch>[0]) => {
      const result = dispatch(event)
      if (event.type !== "hosted.changes.changed" || !event.requests.some(row => row.busyWaiting)) return result
      const persisted = new Promise<void>(resolve => held.push(() => void result.isPersisted.promise.then(() => resolve())))
      return { ...result, isPersisted: { ...result.isPersisted, promise: persisted } }
    }) as typeof dispatch
  })
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "change" })
  await until(() => h.store.session().hostedChanges!.at(-1)?.busyWaiting === true)
  await until(() => clock.pending.size === 1)
  expect(clock.delays).toEqual([2000])
  expect(starts).toBe(1)
  h.seam.cancelHostedRetries()
  for (const release of held.splice(0)) release()
  await h.done()
  expect(starts).toBe(1)
})
test("two busy sessions retry then complete the same request without a failed card", async () => {
  const clock = fakeScheduler()
  let starts = 0
  const posted: unknown[] = []
  const h = await setup(async (url, init) => {
    if (url.endsWith("/agent/sessions")) { starts++; return json({ id: `s${starts}` }, 201) }
    if (url.split("?")[0]!.endsWith("/messages")) {
      if (init?.method === "POST") { posted.push(JSON.parse(init.body as string)); return json({}) }
      return json([{ role: "assistant", parts: [{ type: "coding_result", content: result }] }])
    }
    if (url.endsWith("/files")) return json([])
    if (url.endsWith("/diff")) return json({ diff: "" })
    return json(starts <= 2 ? { ...session, status: "failed", reason_code: "box_busy", reason: busyReason, retryable: true } : session)
  }, clock)
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "same request" })
  for (let i = 0; i < 2; i++) { await until(() => clock.pending.size === 1); clock.advance() }
  await h.done()
  expect(posted).toEqual(Array(3).fill({ role: "user", text: "same request" }))
  expect(h.store.session().hostedChanges![0]).toMatchObject({ phase: "done", busyWaiting: false, error: null })
})
test("unmount cancels the pending busy timer and never launches another session", async () => {
  const clock = fakeScheduler()
  let starts = 0
  const h = await setup(async () => { starts++; return json({ code: "box_busy" }, 503) }, clock)
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "change" })
  await until(() => clock.pending.size === 1)
  const row = h.store.session().hostedChanges![0]!
  h.seam.watchHostedChange(`hosted-change-${row.id}`)()
  await h.done()
  expect(clock.pending.size).toBe(0)
  expect(starts).toBe(1)
})
test("non-busy start refusal does not schedule retries", async () => {
  const clock = fakeScheduler()
  const h = await setup(async () => json({ code: "forbidden", message: "No access." }, 403), clock)
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "change" })
  await h.done()
  expect(clock.delays).toEqual([])
  expect(h.store.session().hostedChanges![0]).toMatchObject({ phase: "failed" })
  expect(h.store.session().hostedChanges![0]?.busyRetries).toBeUndefined()
})
// A start call that timed out at the edge may have started a turn, so it is never retried (f-x1r8tw).
for (const body of [{ code: "upstream_timeout", message: "The server took too long." }, { code: "box_busy", message: "Busy." }]) {
  test(`a 504 start call (${body.code}) does not schedule retries`, async () => {
    const clock = fakeScheduler()
    let starts = 0
    const h = await setup(async () => (starts++, json(body, 504)), clock)
    await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "change" })
    await h.done()
    expect(clock.delays).toEqual([])
    expect(starts).toBe(1)
    expect(h.store.session().hostedChanges![0]).toMatchObject({ phase: "failed" })
    expect(h.store.session().hostedChanges![0]?.busyRetries).toBeUndefined()
  })
}
test("queued fields are optional, nullable, and validate the platform stage and RFC3339 time", () => {
  expect(HostedSessionSchema.parse(session).stage).toBeUndefined()
  expect(HostedSessionSchema.parse({ ...session, stage: null, queued_at: null })).toMatchObject({ stage: null, queued_at: null })
  for (const stage of ["queued", "started"] as const) expect(HostedSessionSchema.parse({
    ...session, stage, queued_at: "2026-10-19T06:30:00-07:00"
  }).stage).toBe(stage)
  expect(HostedSessionSchema.safeParse({ ...session, stage: "other" }).success).toBe(false)
  expect(HostedSessionSchema.safeParse({ ...session, queued_at: "yesterday" }).success).toBe(false)
})

test("changing repositories clears a pending busy retry", async () => {
  const clock = fakeScheduler()
  let starts = 0
  const h = await setup(async () => { starts++; return json({ code: "box_busy" }, 503) }, clock)
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "change" })
  await until(() => clock.pending.size === 1)
  await h.store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [{ id: "another/repo", org: "another", ownerKind: "user", name: "repo", head: null }] }).isPersisted.promise
  await h.store.dispatch({ type: "repo.selected", actor: "user", id: "another/repo" }).isPersisted.promise
  await h.done()
  expect(clock.pending.size).toBe(0)
  expect(starts).toBe(1)
})
test("asking for another change cancels the old backoff", async () => {
  const clock = fakeScheduler()
  const h = await setup(async () => json({ code: "box_busy" }, 503), clock)
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "first" })
  await until(() => clock.pending.size === 1)
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "second" })
  await until(() => h.store.session().hostedChanges!.some(row => row.request === "first" && row.phase === "failed") && clock.pending.size === 1)
  h.seam.cancelHostedRetries()
  await h.done()
  expect(clock.pending.size).toBe(0)
})
test("queued elapsed observation ticks without awaiting a network poll and stops on unmount", async () => {
  const clock = fakeScheduler()
  const h = await setup(async (url, init) => {
    if (init?.method === "POST") return json(url.endsWith("/messages") ? {} : { id: "s" })
    if (url.split("?")[0]!.endsWith("/messages")) return json([])
    return json({ ...session, status: "active", stage: "queued", queued_at: "2026-10-19T13:30:00Z" })
  }, clock)
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "queued" })
  await until(() => clock.pending.size === 2)
  expect(clock.delays).toEqual([1000, 2000])
  const at = h.store.session().hostedChanges![0]!.observedAt!
  await new Promise(resolve => setTimeout(resolve, 2))
  clock.advance()
  await until(() => h.store.session().hostedChanges![0]!.observedAt! > at)
  h.seam.watchHostedChange(`hosted-change-${h.store.session().hostedChanges![0]!.id}`)()
  await h.done()
  expect(clock.pending.size).toBe(0)
})

for (const payload of [
  { code: "box_busy", message: "The machine service asked us to wait." },
  { code: "box_busy", reason: "The machine service is starting boxes." }
]) test(`busy start preserves the typed sentence: ${JSON.stringify(payload)}`, async () => {
  const clock = fakeScheduler()
  const h = await setup(async () => json(payload, 503), clock)
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "change" })
  for (let i = 0; i < 4; i++) { await until(() => clock.pending.size === 1); clock.advance() }
  await h.done()
  expect(h.store.session().hostedChanges![0]?.error).toBe(("reason" in payload ? payload.reason : payload.message)!)
})
// A full agent pool ends the session box_unavailable after ~16 s (8e d-xz0bfc). It is retryable but not box_busy:
// no automatic retry, the backend's sentence, and the person's Try again starts a fresh session (PM d-dfapae).
test("a full agent pool (box_unavailable) keeps its sentence, schedules no retry, and Try again starts again", async () => {
  const clock = fakeScheduler()
  const full = "The agent pool is full right now. Nothing ran; start the agent again in a moment."
  let starts = 0
  const h = await setup(async (url, init) => {
    if (init?.method === "POST" && url.endsWith("/agent/sessions")) { starts++; return json({ id: `s${starts}` }) }
    if (url.split("?")[0]!.endsWith("/messages")) return json([])
    return json({ ...session, status: "failed", reason_code: "box_unavailable", reason: full, retryable: true })
  }, clock)
  const request = { repo: "maya/tinyhttp", request: "change" }
  await h.seam.askHostedChange(request)
  await h.done()
  expect(clock.delays).toEqual([])
  expect(starts).toBe(1)
  expect(h.store.session().hostedChanges![0]).toMatchObject({ phase: "failed", busyWaiting: false, error: full,
    session: { reason_code: "box_unavailable", retryable: true } })
  expect(h.store.session().hostedChanges![0]?.busyRetries).toBeUndefined()
  await h.seam.askHostedChange(request)
  await h.done()
  expect(starts).toBe(2)
})
test("a non-busy session failure after a busy retry retains its own retry behavior", async () => {
  const clock = fakeScheduler()
  let starts = 0
  const h = await setup(async (url, init) => {
    if (init?.method === "POST" && url.endsWith("/agent/sessions")) { starts++; return json({ id: `s${starts}` }) }
    if (url.split("?")[0]!.endsWith("/messages")) return json([])
    return json({ ...session, status: "failed", reason_code: starts === 1 ? "box_busy" : "turn_timed_out",
      reason: starts === 1 ? busyReason : "The turn timed out.", retryable: true })
  }, clock)
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "change" })
  await until(() => clock.pending.size === 1)
  clock.advance()
  await h.done()
  expect(h.store.session().hostedChanges![0]).toMatchObject({ phase: "failed", busyWaiting: false,
    error: "The turn timed out.", session: { reason_code: "turn_timed_out", retryable: true } })
  expect(h.store.session().hostedChanges![0]?.busyRetries).toBeUndefined()
  expect(clock.pending.size).toBe(0)
})
test("an in-flight busy response cannot schedule a retry after unmount", async () => {
  const clock = fakeScheduler()
  let finish!: (value: Response) => void
  const pending = new Promise<Response>(resolve => { finish = resolve })
  const h = await setup(async () => pending, clock)
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "change" })
  h.seam.watchHostedChange(`hosted-change-${h.store.session().hostedChanges![0]!.id}`)()
  finish(json({ code: "box_busy" }, 503))
  await h.done()
  expect(clock.delays).toEqual([])
})

for (const code of ["box_busy", "turn_timed_out"] as const) test(`an unrelated prompt preserves the session verdict but retires retries: ${code}`, async () => {
  const clock = fakeScheduler()
  let release!: (response: Response) => void
  let reading = false
  const pending = new Promise<Response>(resolve => { release = resolve })
  const h = await setup(async (url, init) => {
    if (init?.method === "POST") return json(url.endsWith("/messages") ? {} : { id: "s" })
    if (url.split("?")[0]!.endsWith("/messages")) return json([])
    reading = true
    return pending
  }, clock)
  await h.seam.askHostedChange({ repo: "maya/tinyhttp", request: "change" })
  await until(() => reading)
  h.seam.cancelHostedRetries()
  release(json({ ...session, status: "failed", reason_code: code, reason: "Backend reason.", retryable: true }))
  await h.done()
  expect(h.store.session().hostedChanges![0]).toMatchObject({ phase: "failed", error: "Backend reason." })
  expect(clock.delays).toEqual([])
})
