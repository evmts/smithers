import * as CloudSession from "@smthrs/cli/CloudSession"
import type { MythicalStack } from "@smthrs/rpc/Mythical"
import { afterEach, expect, it } from "bun:test"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as Factory from "../src/factory.ts"
import * as Failures from "../src/failures.ts"
import * as Log from "../src/log.ts"
import { TabError } from "../src/tab-error.ts"

const now = Date.parse("2026-09-28T20:00:00Z")
const item = (id: string, state: string, extra: Record<string, unknown> = {}) => ({
  id,
  state,
  attempt: 1,
  runs: {},
  dependsOn: [],
  updatedAt: "2026-09-28T19:00:00Z",
  issue: { number: Number(id), title: `Issue ${id}`, url: `https://github.com/o/r/issues/${id}` },
  ...extra
})
const stack = {
  repository: "o/r",
  state: "active",
  generation: 1,
  mainBehind: false,
  changes: [{ id: "c1", changeId: "k", commitId: "a".repeat(40), title: "↩ revert", kind: "revert", position: 0 }],
  items: [
    item("2431", "blocked", { reason: "very hard 3/3", todo: { replans: 2, veryHard: true } }),
    item("2412", "running", { lane: 0, todo: { replans: 1 } }),
    item("2388", "landed", {
      createdAt: "2026-09-28T16:00:00Z",
      humanEdited: false,
      costNanos: 2_000_000_000,
      route: { as: "close", landed: "change" }
    }),
    item("2391", "declined", { reason: "Already done." })
  ],
  lanes: [],
  limits: { maxParallel: 3 }
} as unknown as MythicalStack

it("lists the factory's issues under Needs you, Working and Done, each with its title and word", () => {
  expect(Factory.rows(stack, now).map((row) => [row.label, row.status])).toEqual([
    ["◆ Needs you 1", undefined],
    ["◆ #2431 Issue 2431 · blocked", undefined],
    ["◐ Working 1", undefined],
    ["#2412 Issue 2412 · implementing · plan 2 of 3", "running"],
    ["● Done 2", undefined],
    ["#2388 Issue 2388 · landed", "done"],
    ["#2391 Issue 2391 · declined", "done"]
  ])
})

it("heads the list with the shared measured numbers on one line", () => {
  expect(Factory.metrics(stack)).toBe(
    "1/3 landed · 100% landed unedited · 3h p50 · $2.00/landed · 1 revert · 1 misroute · 3 replans"
  )
  expect(Factory.metrics({ ...stack, items: [], changes: [] })).toBe("0 reverts · 0 misroutes · 0 replans")
})

it("shows very hard only during the continuation and derives plan number from replans", () => {
  const continuing = {
    ...stack,
    items: [item("2412", "running", { lane: 0, todo: { replans: 2, veryHard: true } })]
  } as unknown as MythicalStack
  expect(Factory.rows(continuing, now)[1]?.label).toBe("#2412 Issue 2412 · implementing · plan 3 of 3 · very hard")
  expect(Factory.metrics(continuing)).toContain("1 very hard")
  const blocked = {
    ...continuing,
    items: [item("2412", "blocked", { todo: { replans: 2, veryHard: true } })]
  } as unknown as MythicalStack
  expect(Factory.rows(blocked, now)[1]?.label).not.toContain("very hard")
  expect(Factory.metrics(blocked)).not.toContain("very hard")
})

it("uses the outcome word for Working and Done, with the reason in details", () => {
  const value = {
    ...stack,
    items: [
      item("2400", "retrying", { reason: "seat unavailable", todo: { replans: 1 } }),
      item("2401", "declined", { reason: "Already done." })
    ]
  } as unknown as MythicalStack
  const rows = Factory.rows(value, now)
  expect(rows.find((row) => row.label.includes("#2400"))?.label).toContain("· retrying · plan 2 of 3")
  expect(rows.find((row) => row.label.includes("#2401"))?.label).toBe("#2401 Issue 2401 · declined")
  expect(rows.find((row) => row.label.includes("#2401"))?.details).toEqual([{
    kind: "text",
    text: "Already done.\nhttps://github.com/o/r/issues/2401\n/retry #2401"
  }])
})

it("shows each check receipt on the candidate in details, and nothing without receipts", () => {
  const commit = "1a2b3c4d".padEnd(40, "0")
  const value = {
    ...stack,
    items: [
      item("2402", "retrying", {
        reason: "failed: affected-test",
        checks: {
          state: "failed",
          failed: ["affected-test"],
          receipts: [
            { check: "affected-lint", tier: "fast", status: "passed", commit },
            { check: "affected-test", tier: "slow", status: "failed", commit }
          ]
        }
      }),
      item("2403", "proposed", { checks: { state: "passed", failed: [] } })
    ]
  } as unknown as MythicalStack
  const rows = Factory.rows(value, now)
  expect(rows.find((row) => row.label.includes("#2402"))?.details).toEqual([{
    kind: "text",
    text: "failed: affected-test\n✓ affected-lint 1a2b3c4 · ✗ affected-test 1a2b3c4\nhttps://github.com/o/r/issues/2402"
  }])
  expect(rows.find((row) => row.label.includes("#2403"))?.details).toEqual([{
    kind: "text",
    text: "https://github.com/o/r/issues/2403"
  }])
})

it("appends each receipt's duration and names the run that recorded them", () => {
  const commit = "1a2b3c4d".padEnd(40, "0")
  const value = {
    ...stack,
    items: [
      item("2405", "proposed", {
        checks: {
          state: "passed",
          failed: [],
          receipts: [
            { check: "affected-lint", tier: "fast", status: "passed", commit, runId: "run-verify-21", durationMs: 850 },
            {
              check: "affected-test",
              tier: "slow",
              status: "passed",
              commit,
              runId: "run-verify-21",
              durationMs: 64_000
            },
            { check: "affected-docs", tier: "fast", status: "passed", commit }
          ]
        }
      })
    ]
  } as unknown as MythicalStack
  expect(Factory.rows(value, now).find((row) => row.label.includes("#2405"))?.details).toEqual([{
    kind: "text",
    text:
      "✓ affected-lint 1a2b3c4 0s · ✓ affected-test 1a2b3c4 1m 04s · ✓ affected-docs 1a2b3c4 · run run-verify-21\n" +
      "https://github.com/o/r/issues/2405"
  }])
})

it("shows the machine an issue's lane runs on in details: its kind and image", () => {
  const value = {
    ...stack,
    items: [
      item("2404", "running", {
        lane: 0,
        placement: {
          declared: { environment: ".smithers/environment.nix", tools: ["go"] },
          kind: "vm",
          vcpus: 2,
          memoryMiB: 4096,
          imageId: "img-1",
          image: "registry/env:abc"
        }
      }),
      item("2405", "blocked", {
        reason: "No machine matches what this repository declares",
        placement: { declared: { vcpus: 8 }, refusal: "machine_too_small", reason: "it needs 8 vCPUs" }
      })
    ]
  } as unknown as MythicalStack
  const rows = Factory.rows(value, now)
  expect(rows.find((row) => row.label.includes("#2404"))?.details).toEqual([{
    kind: "text",
    text: "vm · registry/env:abc\nhttps://github.com/o/r/issues/2404"
  }])
  expect(rows.find((row) => row.label.includes("#2405"))?.details).toEqual([{
    kind: "text",
    text: "No machine matches what this repository declares\nhttps://github.com/o/r/issues/2405\n/retry #2405"
  }])
})

it("names the repository from SMITHERS_REPO, else the checkout's remote", () => {
  expect(Factory.repository("/nowhere", { SMITHERS_REPO: "smithersai/smithers" })).toBe("smithersai/smithers")
  expect(Factory.repository("/nowhere", {})).toBeUndefined()
  expect(Factory.repository("/nowhere", { SMITHERS_REPO: "../x" })).toBeUndefined()
})

it("lists at most a group's worth of issues, then how many more", () => {
  const long = {
    ...stack,
    items: Array.from({ length: Factory.perGroup + 5 }, (_, at) => item(String(3000 + at), "queued"))
  }
  const shown = Factory.rows(long as unknown as MythicalStack, now)
  expect(shown).toHaveLength(Factory.perGroup + 2)
  expect(shown.at(-1)).toMatchObject({ id: "more:working", label: "… 5 more" })
})

it("files a TODO under one request id, resent after an unanswered filing and dropped after a refusal", async () => {
  const sent: Array<{ path: string; body: { title: string; request: string } }> = []
  const answers: Array<() => Promise<unknown>> = []
  let ids = 0
  const file = Factory.filer(
    (path, body) => {
      sent.push({ path, body: body as { title: string; request: string } })
      return answers.shift()!()
    },
    () => `id-${++ids}`
  )
  const queued = item("40", "queued")
  // A dropped network keeps the id: the same TODO again resends it and files once.
  answers.push(() => Promise.reject(new Error("fetch failed")), () => Promise.resolve(queued))
  expect(await file("o/r", "Add dark mode")).toEqual({
    ok: false,
    error: expect.objectContaining({ message: "fetch failed" }),
    settled: false
  })
  const filed = await file("o/r", "Add dark mode")
  expect(filed.ok && filed.item.issue?.number).toBe(40)
  expect(sent.map((each) => [each.path, each.body.request])).toEqual([
    ["/api/repos/o/r/mythical/todos", "id-1"],
    ["/api/repos/o/r/mythical/todos", "id-1"]
  ])
  // An answered filing frees its id: the next filing of the text is a new TODO.
  answers.push(
    () => Promise.reject(new Error("/api/repos/o/r/mythical/todos: HTTP 403")),
    () => Promise.resolve(queued)
  )
  expect(await file("o/r", "Add dark mode")).toMatchObject({ ok: false, settled: true })
  await file("o/r", "Add dark mode")
  expect(sent.map((each) => each.body.request)).toEqual(["id-1", "id-1", "id-2", "id-3"])
})

it("joins a TODO filed while the same one is in flight", async () => {
  const releases: Array<(value: unknown) => void> = []
  const file = Factory.filer(() => new Promise((resolve) => releases.push(resolve)))
  const first = file("o/r", "Same")
  const second = file("o/r", "Same")
  const other = file("o/x", "Same")
  expect(releases).toHaveLength(2)
  for (const release of releases) release(item("41", "queued"))
  expect(await first).toBe(await second)
  expect((await other).ok).toBe(true)
})

const servers: Array<() => void> = []
afterEach(() => {
  for (const close of servers.splice(0)) close()
})
interface Received {
  readonly method: string
  readonly path: string
  readonly auth: string | undefined
  readonly body: string
}
/** A Cloud origin on a local port: `reply` answers each request by method and path. */
const cloudAt = async (
  reply: (method: string, path: string) => { status: number; body: unknown },
  received: Array<Received> = []
): Promise<string> => {
  const server = createServer((request, response) => {
    let body = ""
    request.on("data", (chunk) => (body += chunk))
    request.on("end", () => {
      received.push({
        method: request.method ?? "",
        path: request.url ?? "",
        auth: request.headers.authorization,
        body
      })
      const answer = reply(request.method ?? "", request.url ?? "")
      response.writeHead(answer.status, { "content-type": "application/json" })
      response.end(JSON.stringify(answer.body))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  servers.push(() => server.close())
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}
const signIn = (origin: string) => () =>
  CloudSession.signedIn({
    HOME: mkdtempSync(join(tmpdir(), "tui-retry-")),
    XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), "tui-retry-")),
    SMITHERS_API_ORIGIN: origin,
    SMITHERS_TOKEN: "tok_retry"
  })
const stackRoute = "/api/repos/o/r/mythical"
/** The stack as Cloud serves it. */
const served = { ...stack, changes: stack.changes.map((change) => ({ ...change, state: "landed" })) }

it("retries a blocked TODO as the signed-in person and settles on the item Cloud answers", async () => {
  const received: Array<Received> = []
  const origin = await cloudAt(
    (method, path) =>
      method === "GET" && path === stackRoute
        ? { status: 200, body: served }
        : method === "POST" && path === "/api/repos/o/r/mythical/items/2431/retry"
        ? { status: 202, body: item("2431", "queued") }
        : { status: 404, body: {} },
    received
  )
  const command = Factory.retryCommand("#2431", "o/r", signIn(origin))
  expect(command.now).toEqual({ text: "Retry #2431 requested" })
  expect(await command.settled).toEqual({ text: "#2431 queued" })
  expect(received.map(({ method, path, auth }) => [method, path, auth])).toEqual([
    ["GET", stackRoute, "token tok_retry"],
    ["POST", "/api/repos/o/r/mythical/items/2431/retry", "token tok_retry"]
  ])
  expect(JSON.parse(received[1]!.body)).toEqual({})
})

it("shows a refused retry as a typed failure, and never posts for an issue that is not retryable", async () => {
  const received: Array<Received> = []
  const origin = await cloudAt(
    (method) => method === "GET" ? { status: 200, body: served } : { status: 409, body: { message: "busy" } },
    received
  )
  const refused = await Factory.retryCommand("2431", "o/r", signIn(origin)).settled
  expect(refused).toEqual({
    text: "#2431 not retried: That command could not run. Details: /conversation",
    tone: "warning"
  })
  const cloud = (await signIn(origin)())!
  expect(await Factory.retry(cloud, "o/r", 2431)).toEqual({
    ok: false,
    error: expect.objectContaining({ message: "/api/repos/o/r/mythical/items/2431/retry: HTTP 409" }),
    settled: true
  })
  // A running issue and an issue the stack does not hold are refused here, before any POST.
  expect(await Factory.retryCommand("2412", "o/r", signIn(origin)).settled).toEqual({
    text: "#2412 not retried: #2412 is implementing",
    tone: "warning"
  })
  expect(await Factory.retryCommand("#9", "o/r", signIn(origin)).settled).toEqual({
    text: "#9 not retried: #9 is not in the factory",
    tone: "warning"
  })
  expect(received.filter((each) => each.method === "POST")).toHaveLength(2)
})

it("persists a retry request before authentication or lookup and refuses a failed durable write", async () => {
  const ordering: string[] = []
  const request = Factory.retryCommand("#2431", "o/r", async () => {
    ordering.push("authenticate")
    return undefined
  }, (line) => {
    expect(line).toEqual({ text: "Retry #2431 requested" })
    ordering.push("persist")
  })
  expect(ordering).toEqual(["persist", "authenticate"])
  expect(await request.settled).toEqual({ text: "Sign in to retry: smthrs auth login", tone: "warning" })
  const logOffset = existsSync(Log.path()) ? readFileSync(Log.path(), "utf8").length : 0
  const refused = Factory.retryCommand("#2431", "o/r", async () => {
    ordering.push("must not authenticate")
    return undefined
  }, () => {
    throw new Error("disk full")
  })
  expect(refused.settled).toBeUndefined()
  expect(refused.now).toEqual({
    text: "Retry #2431 not requested: The retry could not start. Details: /conversation",
    tone: "warning"
  })
  expect(refused.now.text).not.toContain("disk full")
  expect(readFileSync(Log.path(), "utf8").slice(logOffset)).toContain("disk full")
  expect(ordering).toEqual(["persist", "authenticate"])
})

it("the visible retry door presents lookup, POST, authentication and persistence failures without changing domain refusals", async () => {
  const raw: unknown[] = []
  const present = (error: unknown) => {
    raw.push(error)
    return "The command could not run."
  }
  const lookup = await cloudAt(() => ({ status: 503, body: {} }))
  expect(await Factory.retryCommand("#2431", "o/r", signIn(lookup), undefined, present).settled).toEqual({
    text: "#2431 not retried: The command could not run.",
    tone: "warning"
  })
  const post = await cloudAt((method) => method === "GET" ? { status: 200, body: served } : { status: 403, body: {} })
  expect(await Factory.retryCommand("#2431", "o/r", signIn(post), undefined, present).settled).toEqual({
    text: "#2431 not retried: The command could not run.",
    tone: "warning"
  })
  expect(raw.map((error) => (error as { fault: string }).fault)).toEqual(["infra", "user"])
  expect(raw.map((error) => String(error))).toEqual([
    expect.stringContaining("HTTP 503"),
    expect.stringContaining("HTTP 403")
  ])
  const refused = await Factory.retryCommand("#2412", "o/r", signIn(post), undefined, present).settled
  expect(refused).toEqual({ text: "#2412 not retried: #2412 is implementing", tone: "warning" })
  expect(raw).toHaveLength(2)
  const auth = new Error("private keyring path")
  expect(
    await Factory.retryCommand(
      "#2431",
      "o/r",
      async () => {
        throw auth
      },
      undefined,
      present
    ).settled
  ).toEqual({
    text: "#2431 not retried: The command could not run.",
    tone: "warning"
  })
  const disk = new Error("private disk path")
  expect(Factory.retryCommand("#2431", "o/r", signIn(post), () => {
    throw disk
  }, present)).toEqual({
    now: { text: "Retry #2431 not requested: The command could not run.", tone: "warning" }
  })
  expect(raw.slice(2)).toEqual([auth, disk])
})

it("settles an unreachable Cloud as a failure that may not have been sent", async () => {
  const origin = await cloudAt(() => ({ status: 200, body: served }))
  servers.splice(0).forEach((close) => close())
  const settled = await Factory.retryCommand("2431", "o/r", signIn(origin)).settled
  expect(settled?.tone).toBe("warning")
  expect(settled?.text.startsWith("#2431 not retried: ")).toBe(true)
  const answer = await Factory.retry((await signIn(origin)())!, "o/r", 2431)
  expect(answer).toMatchObject({ ok: false, settled: false })
  // A 5xx is not a refusal either.
  const failing = await cloudAt(() => ({ status: 503, body: {} }))
  expect(await Factory.retry((await signIn(failing)())!, "o/r", 2431)).toEqual({
    ok: false,
    error: expect.objectContaining({ message: `${stackRoute}: HTTP 503` }),
    settled: false
  })
})

it("answers a /retry it cannot send at once: no issue, no repository, signed out, a failing sign-in", async () => {
  for (const argument of ["", "abc", "#0", "12x", "-3"]) {
    expect(Factory.retryCommand(argument, "o/r", signIn("http://127.0.0.1:1"))).toEqual({
      now: { text: "Usage: /retry <issue>", tone: "warning" }
    })
  }
  expect(Factory.retryCommand("12", undefined, signIn("http://127.0.0.1:1"))).toEqual({
    now: { text: "No repository for this directory", tone: "warning" }
  })
  expect(await Factory.retryCommand(" #12 ", "o/r", () => Promise.resolve(undefined)).settled).toEqual({
    text: "Sign in to retry: smthrs auth login",
    tone: "warning"
  })
  expect(await Factory.retryCommand("12", "o/r", () => Promise.reject(new Error("keyring locked"))).settled).toEqual({
    text: "#12 not retried: The retry could not start. Details: /conversation",
    tone: "warning"
  })
})

it("names the retry command only on an issue a person may retry", () => {
  const retried = (state: string, extra: Record<string, unknown> = {}) =>
    Factory.rows({ ...stack, items: [item("2500", state, extra)] } as unknown as MythicalStack, now)
      .find((row) => row.label.includes("#2500"))?.details.map((block) => block.kind === "text" ? block.text : "")
      .join("")
  for (const state of ["blocked", "rejected", "declined"]) expect(retried(state)).toContain("/retry #2500")
  expect(retried("proposed", { reviewHeld: true })).toContain("/retry #2500")
  for (const state of ["queued", "running", "landed", "proposed"]) expect(retried(state) ?? "").not.toContain("/retry")
})

it("lands a proposed TODO at the head the stack served, and never posts for one that is not landable", async () => {
  const head = "f".repeat(40)
  const pullRequest = { number: 50, url: "https://github.com/o/r/pull/50", state: "open", head }
  const landing = {
    ...served,
    items: [
      ...served.items,
      item("2450", "proposed", { todo: { replans: 0 }, pullRequest }),
      item("2451", "proposed", { todo: { replans: 0 }, pullRequest, automerge: true })
    ]
  }
  const received: Array<Received> = []
  const origin = await cloudAt(
    (method, path) =>
      method === "GET" && path === stackRoute
        ? { status: 200, body: landing }
        : method === "POST" && path === "/api/repos/o/r/mythical/items/2450/land"
        ? { status: 202, body: item("2450", "proposed", { todo: { replans: 0 }, pullRequest, automerge: true }) }
        : { status: 404, body: {} },
    received
  )
  const command = Factory.landCommand("#2450", "o/r", signIn(origin))
  expect(command.now).toEqual({ text: "Land #2450 requested" })
  expect(await command.settled).toEqual({ text: "#2450 PR open" })
  expect(JSON.parse(received.find((each) => each.method === "POST")!.body)).toEqual({ head })
  expect(await Factory.landCommand("2451", "o/r", signIn(origin)).settled).toEqual({
    text: "#2451 not landed: #2451 is PR open",
    tone: "warning"
  })
  expect(await Factory.landCommand("2431", "o/r", signIn(origin)).settled).toEqual({
    text: "#2431 not landed: #2431 is blocked",
    tone: "warning"
  })
  expect(Factory.landCommand("x", "o/r", signIn(origin)).now).toEqual({ text: "Usage: /land <issue>", tone: "warning" })
  expect(received.filter((each) => each.method === "POST")).toHaveLength(1)
})

// HTTP cannot reproduce a synchronous throw at the post function boundary.
// These unit faults complement the real local-HTTP integration cases above.
for (const failure of ["throw", "reject", "malformed"] as const) {
  it(`retains a TODO request after ${failure} until a validated answer without exposing the error`, async () => {
    const raw = new Error(`factory-regression-transport-${failure}-${crypto.randomUUID()}`)
    const sent: string[] = []
    let attempt = 0
    const file = Factory.filer((_path, body) => {
      sent.push((body as { request: string }).request)
      if (++attempt === 1) {
        if (failure === "throw") throw raw
        if (failure === "reject") return Promise.reject(raw)
        return Promise.resolve({ unexpected: true })
      }
      return Promise.resolve(item("41", "queued"))
    }, () => `request-${sent.length}`)
    const failed = await file("o/r", "Preserve this request")
    expect(failed).toMatchObject({ ok: false, settled: false })
    if (failed.ok) throw new Error("Expected refusal")
    if (failure !== "malformed") expect(failed.error).toBe(raw)
    const beforePresentation = existsSync(Log.path()) ? readFileSync(Log.path(), "utf8").length : 0
    expect(Failures.line("todo", failed.error)).toBe("TODO not filed. Details: /conversation")
    const appended = readFileSync(Log.path(), "utf8").slice(beforePresentation)
    const records = appended.trim().split("\n").map((line) => JSON.parse(line) as { tag: string; detail: string })
    expect(records).toContainEqual(expect.objectContaining({ tag: "failure.todo", detail: expect.any(String) }))
    const diagnostic = records.find((record) => record.tag === "failure.todo")!.detail
    expect(diagnostic.trim().length).toBeGreaterThan(0)
    if (failure !== "malformed") expect(diagnostic).toContain(raw.message)
    else {
      expect(failed.error).toBeInstanceOf(Error)
      expect((failed.error as Error).name).toBe("ZodError")
      expect(diagnostic).toContain("ZodError")
    }
    expect(await file("o/r", "Preserve this request")).toMatchObject({ ok: true })
    expect(sent).toEqual(["request-0", "request-0"])
    expect(await file("o/r", "Preserve this request")).toMatchObject({ ok: true })
    expect(sent[2]).toBe("request-2")
  })
}

it("keeps a held retry pending and settles identity rejection without exposing diagnostics", async () => {
  const identity = Promise.withResolvers<undefined>()
  const command = Factory.retryCommand("12", "o/r", () => identity.promise)
  expect(command.now).toEqual({ text: "Retry #12 requested" })
  let completed = false
  const answer = command.settled!.then((value) => {
    completed = true
    return value
  })
  await Promise.resolve()
  expect(completed).toBe(false)
  identity.reject(new Error("factory-regression-identity-marker"))
  expect(await answer).toEqual({
    text: "#12 not retried: The retry could not start. Details: /conversation",
    tone: "warning"
  })
})

it("presents registered refusals through their actionable copy instead of raw diagnostics", async () => {
  const refused = new TabError("unknown_tab", "factory-regression-tagged-marker", "missing-worker")
  const result = await Factory.retryCommand("12", "o/r", () => {
    throw refused
  }).settled
  expect(result).toEqual({ text: "#12 not retried: No tab missing-worker.", tone: "warning" })
  expect(result?.text).not.toContain(refused.message)
  expect(result?.text).not.toContain("Details:")
})

it("replays a top-level HTTP 503 TODO failure despite a nested HTTP 403 diagnostic", async () => {
  const marker = `factory-nested-status-${crypto.randomUUID()}`
  const error = new Error(`/api/repos/o/r/mythical/todos: HTTP 503 ${marker}`, {
    cause: new Error("An earlier credential probe: HTTP 403")
  })
  const sent: string[] = []
  let ids = 0
  const file = Factory.filer((_path, body) => {
    sent.push((body as { request: string }).request)
    return sent.length === 1 ? Promise.reject(error) : Promise.resolve(item("42", "queued"))
  }, () => `nested-status-${++ids}`)
  const failed = await file("o/r", "Recover after upstream unavailability")
  expect(failed).toMatchObject({ ok: false, settled: false })
  if (failed.ok) throw new Error("Expected upstream failure")
  expect(failed.error).toBe(error)
  expect(Failures.line("todo", failed.error)).toBe("TODO not filed. Details: /conversation")
  // The unique marker proves this presentation wrote today's diagnostic rather
  // than passing against an older process log with a reused failure message.
  const diagnostic = readFileSync(Log.path(), "utf8").split("\n").find((line) => line.includes(marker))
  expect(diagnostic).toContain("HTTP 503")
  expect(diagnostic).toContain("HTTP 403")
  expect(await file("o/r", "Recover after upstream unavailability")).toMatchObject({ ok: true })
  expect(sent).toEqual(["nested-status-1", "nested-status-1"])
})

for (const boundary of ["GET", "POST"] as const) {
  it(`presents a land ${boundary} failure without posting a retry or exposing diagnostics`, async () => {
    const marker = `land-${boundary}-${crypto.randomUUID()}`
    const head = "f".repeat(40)
    const candidate = item("2450", "proposed", {
      todo: { replans: 0 },
      pullRequest: { number: 50, url: "https://github.com/o/r/pull/50", state: "open", head }
    })
    const received: Array<Received> = []
    const origin = await cloudAt((method, path) => {
      if (method === boundary) return { status: 503, body: { error: marker } }
      if (method === "GET" && path === stackRoute) return { status: 200, body: { ...served, items: [candidate] } }
      return { status: 404, body: {} }
    }, received)
    const beforePresentation = existsSync(Log.path()) ? readFileSync(Log.path(), "utf8").length : 0
    const result = await Factory.landCommand("2450", "o/r", signIn(origin)).settled
    expect(result).toEqual({
      text: "#2450 not landed: That command could not run. Details: /conversation",
      tone: "warning"
    })
    expect(result?.text).not.toContain(marker)
    expect(result?.text).not.toContain("retry")
    const posts = received.filter((request) => request.method === "POST")
    expect(posts.map((request) => request.path)).toEqual(
      boundary === "GET" ? [] : ["/api/repos/o/r/mythical/items/2450/land"]
    )
    if (boundary === "POST") expect(JSON.parse(posts[0]!.body)).toEqual({ head })
    const appended = readFileSync(Log.path(), "utf8").slice(beforePresentation)
    const records = appended.trim().split("\n").map((line) => JSON.parse(line) as { tag: string; detail: string })
    expect(records).toContainEqual(expect.objectContaining({
      tag: "failure.land",
      detail: expect.stringContaining(
        `${boundary === "GET" ? stackRoute : "/api/repos/o/r/mythical/items/2450/land"}: HTTP 503`
      )
    }))
  })
}

it("acknowledges landing before sign-in settles and retains landing refusal words", async () => {
  const identity = Promise.withResolvers<undefined>()
  const command = Factory.landCommand("2450", "o/r", () => identity.promise)
  expect(command.now).toEqual({ text: "Land #2450 requested" })
  let completed = false
  const answer = command.settled!.then((line) => {
    completed = true
    return line
  })
  await Promise.resolve()
  expect(completed).toBe(false)
  identity.resolve(undefined)
  expect(await answer).toEqual({ text: "Sign in to land: smthrs auth login", tone: "warning" })
})
