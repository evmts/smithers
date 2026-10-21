import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { DatabaseSync } from "node:sqlite"
import { Effect, Exit, Logger, Metric } from "effect"
import { describe, expect, test } from "vitest"
import { AuthUnreachable } from "../features/auth/api"
import { activationGate, authorizeDevice, boundFetch, checks, DeviceIdentityRefused, readOwner, readSession } from "./identity"

const alice = { v: 1 as const, personId: "person-alice", login: "alice" }
const session = (personId: string, login = personId) => Effect.succeed({ signedIn: true as const, personId, login, role: "member" as const })
const open = () => {
  const sqlite = new DatabaseSync(":memory:")
  return {
    sqlite,
    database: { execute: (sql: string, params: ReadonlyArray<unknown> = []) => Effect.sync(() => sqlite.prepare(sql).all(...params as never[])) },
    close: () => sqlite.close(),
  }
}
const legacy = (sqlite: DatabaseSync, row: unknown) => {
  sqlite.exec("CREATE TABLE collection_registry (collection_id TEXT, table_name TEXT); CREATE TABLE auth_rows (value TEXT)")
  sqlite.prepare("INSERT INTO collection_registry VALUES (?, ?)").run("auth-confirmed", "auth_rows")
  sqlite.prepare("INSERT INTO auth_rows VALUES (?)").run(JSON.stringify(row))
}

describe("the engine's activation identity boundary", () => {
  test("Alice → expired session → Bob never opens Alice's store or resumes it; the retained owner survives expiry", async () => {
    const device = open()
    legacy(device.sqlite, { id: "session", ...alice, role: "member" })
    const reports: unknown[] = []
    const run = (answer: Parameters<typeof authorizeDevice>[0]["session"]) => Effect.runPromise(Effect.exit(authorizeDevice({ database: device.database, session: answer, report: (owner, outcome) => reports.push({ owner, outcome }) })))
    try {
      expect(Exit.isFailure(await run(Effect.succeed({ signedIn: false, available: true })))).toBe(true)
      expect(Exit.isFailure(await run(session("person-bob", "bob")))).toBe(true)
      expect(reports).toEqual([{ owner: alice, outcome: "signed_out" }, { owner: alice, outcome: "changed" }])
      expect(device.sqlite.prepare("SELECT value FROM auth_rows").get()).toEqual({ value: JSON.stringify({ id: "session", ...alice, role: "member" }) })
      expect(Exit.isSuccess(await run(session(alice.personId, alice.login)))).toBe(true)
    } finally { device.close() }
  })

  test("same-person offline recovery and login renaming keep the stable owner", async () => {
    const device = open()
    const reports: unknown[] = []
    try {
      await Effect.runPromise(authorizeDevice({ database: device.database, session: session(alice.personId, "alice"), report: () => {} }))
      for (const answer of [Effect.fail(new AuthUnreachable({})), session(alice.personId, "alice-renamed")]) {
        await Effect.runPromise(authorizeDevice({ database: device.database, expectedOwner: alice, session: answer, report: (owner, outcome) => reports.push({ owner, outcome }) }))
      }
      expect(reports).toEqual([{ owner: alice, outcome: "offline" }, { owner: { ...alice, login: "alice-renamed" }, outcome: "verified" }])
      expect(device.sqlite.prepare("SELECT person_id FROM smithers_device_identity").get()).toEqual({ person_id: alice.personId })
      const switched = await Effect.runPromise(Effect.exit(authorizeDevice({ database: device.database, expectedOwner: { ...alice, personId: "person-bob" }, session: session("person-bob", "bob"), report: () => {} })))
      expect(Exit.isFailure(switched)).toBe(true)
    } finally { device.close() }
  })

  test("legacy login-only and unknown nonempty stores cannot acquire the new cookie owner, even when a login was reassigned", async () => {
    const device = open()
    legacy(device.sqlite, { id: "session", login: "Alice", role: "member" })
    let outcome = ""
    try {
      const check = (answer: Parameters<typeof authorizeDevice>[0]["session"]) => Effect.runPromise(Effect.exit(authorizeDevice({ database: device.database, session: answer, report: (_, value) => { outcome = value } })))
      expect(Exit.isFailure(await check(session(alice.personId, "alice")))).toBe(true)
      expect(outcome).toBe("changed")
      device.sqlite.exec("DELETE FROM auth_rows; INSERT INTO collection_registry VALUES ('chat-drafts', 'drafts')")
      expect(Exit.isFailure(await check(session("person-bob", "bob")))).toBe(true)
      expect(outcome).toBe("changed")
    } finally { device.close() }
  })

  test("a new visitor and the first verified person can open an empty device; missing stable identity refuses activation", async () => {
    const device = open()
    try {
      const check = (answer: Parameters<typeof authorizeDevice>[0]["session"]) => Effect.runPromise(Effect.exit(authorizeDevice({ database: device.database, session: answer, report: () => {} })))
      expect(Exit.isSuccess(await check(Effect.succeed({ signedIn: false, available: true })))).toBe(true)
      expect(Exit.isSuccess(await check(session(alice.personId, alice.login)))).toBe(true)
      expect(await check(Effect.succeed({ signedIn: true, login: "alice", role: "member" }))).toEqual(Exit.fail(new DeviceIdentityRefused({ reason: "missing_person" })))
    } finally { device.close() }
  })

  test("the versioned ownership mirror rejects malformed and unknown versions", () => {
    expect(readOwner(null)).toBeUndefined()
    expect(readOwner("broken")).toBeUndefined()
    expect(readOwner(JSON.stringify({ ...alice, v: 2 }))).toBeUndefined()
    expect(readOwner(JSON.stringify(alice))).toEqual(alice)
    expect(readSession({ signedIn: true, login: "alice", role: "member" })).toBeUndefined()
    expect(readSession({ signedIn: "yes" })).toBeUndefined()
    expect(readSession({ signedIn: false, available: true })).toEqual({ signedIn: false, available: true })
    expect(readSession({ signedIn: true, personId: alice.personId, login: "alice", role: "member" })).toMatchObject({ personId: alice.personId })
  })
})


test("the fetch boundary waits for identity and carries it only to this origin's API", async () => {
  const seen: Array<string | undefined> = []
  const server = createServer((request, response) => { seen.push(request.headers["x-smithers-device-person"] as string | undefined); response.end("ok") })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  let release!: () => void
  const ready = new Promise<void>((resolve) => { release = resolve })
  const bound = boundFetch(fetch, () => alice, origin, ready)
  try {
    const sending = bound(`${origin}/api/questions`, { headers: { "x-smithers-device-person": "different-person" } })
    expect(seen).toEqual([])
    release()
    await sending
    await bound(`${origin}/public`)
    await boundFetch(fetch, () => alice, "http://elsewhere.test")(`${origin}/api/questions`)
    await boundFetch(fetch, () => undefined, origin)(`${origin}/api/questions`)
    expect(seen).toEqual([alice.personId, undefined, undefined, "@visitor"])
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())) }
})


test("an earlier build's expired ownerless private store is blocked while signed out, rather than opened as a visitor", async () => {
  const device = open()
  legacy(device.sqlite, { id: "session", login: "alice", role: "member" })
  device.sqlite.exec("DELETE FROM auth_rows; INSERT INTO collection_registry VALUES ('chat-drafts', 'private_drafts'); CREATE TABLE private_drafts (text TEXT); INSERT INTO private_drafts VALUES ('private')")
  const reported: unknown[] = []
  try {
    const exit = await Effect.runPromise(Effect.exit(authorizeDevice({ database: device.database, session: Effect.succeed({ signedIn: false, available: true }), report: (owner, outcome) => reported.push({ owner, outcome }) })))
    expect(exit).toEqual(Exit.fail(new DeviceIdentityRefused({ reason: "signed_out" })))
    expect(reported).toEqual([{ owner: undefined, outcome: "signed_out" }])
    expect(device.sqlite.prepare("SELECT COUNT(*) AS count FROM private_drafts").get()).toEqual({ count: 1 })
  } finally { device.close() }
})

test("an old leader with no identity receipt selects memory at the deadline; a late receipt never enables retained stores", async () => {
  let stopped = 0
  const gate = activationGate(5, () => { stopped++ })
  await gate.ready
  expect(gate.state()).toBe("memory")
  expect(stopped).toBe(1)
  expect(gate.allow()).toBe(false)
  expect(gate.state()).toBe("memory")
  expect(gate.refuse()).toBe(false)
  let refused = 0
  const denied = activationGate(1_000, () => { refused++ })
  expect(denied.refuse()).toBe(true)
  await denied.ready
  expect(refused).toBe(1)
  expect(denied.allow()).toBe(false)
  expect(denied.refuse()).toBe(false)
  expect(refused).toBe(1)
  const accepted = activationGate(1_000, () => { throw new Error("settled activation timed out") })
  expect(accepted.allow()).toBe(true)
  await accepted.ready
  expect(accepted.refuse()).toBe(false)
  expect(accepted.state()).toBe("retained")
})


test("an offline legacy identity grants no new session authority, and an offline empty device stays anonymous", async () => {
  for (const old of [false, true]) {
    const device = open()
    if (old) legacy(device.sqlite, { id: "session", login: "alice", role: "member" })
    const reports: unknown[] = []
    try {
      await Effect.runPromise(authorizeDevice({ database: device.database, session: Effect.fail(new AuthUnreachable({})), report: (owner, outcome) => reports.push({ owner, outcome }) }))
      expect(reports).toEqual([{ owner: old ? { v: 1, personId: "@unverified", login: "alice" } : undefined, outcome: "offline" }])
      expect(device.sqlite.prepare("SELECT COUNT(*) AS count FROM smithers_device_identity").get()).toEqual({ count: 0 })
      if (old) {
        const signedOut = await Effect.runPromise(Effect.exit(authorizeDevice({ database: device.database, session: Effect.succeed({ signedIn: false, available: true }), report: () => {} })))
        expect(signedOut).toEqual(Exit.fail(new DeviceIdentityRefused({ reason: "signed_out" })))
        expect(device.sqlite.prepare("SELECT COUNT(*) AS count FROM auth_rows").get()).toEqual({ count: 1 })
      }
    } finally { device.close() }
  }
})

test("a conflicting ownership mirror quarantines a verified store and cannot replace the durable owner", async () => {
  const device = open()
  try {
    await Effect.runPromise(authorizeDevice({ database: device.database, session: session(alice.personId, alice.login), report: () => {} }))
    const exit = await Effect.runPromise(Effect.exit(authorizeDevice({ database: device.database, expectedOwner: { ...alice, personId: "person-bob" }, session: session(alice.personId, alice.login), report: () => {} })))
    expect(exit).toEqual(Exit.fail(new DeviceIdentityRefused({ reason: "changed" })))
    expect(device.sqlite.prepare("SELECT person_id FROM smithers_device_identity").get()).toEqual({ person_id: alice.personId })
  } finally { device.close() }
})

test("unreadable legacy ownership or absent auth registry cannot assign retained content to a cookie", async () => {
  for (const malformed of [false, true]) {
    const device = open()
    legacy(device.sqlite, { id: "session", login: "alice", role: "member" })
    if (malformed) device.sqlite.exec("UPDATE auth_rows SET value = 'not-json'")
    else device.sqlite.exec("DELETE FROM collection_registry WHERE collection_id = 'auth-confirmed'")
    device.sqlite.exec("INSERT INTO collection_registry VALUES ('chat-drafts', 'private_drafts')")
    try {
      const exit = await Effect.runPromise(Effect.exit(authorizeDevice({ database: device.database, session: session(alice.personId, alice.login), report: () => {} })))
      expect(exit).toEqual(Exit.fail(new DeviceIdentityRefused({ reason: "changed" })))
    } finally { device.close() }
  }
})

test("a broken ownership store or missing stable server identity fails closed with content-free stage diagnostics", async () => {
  const registry: Metric.MetricRegistry = new Map()
  const logs: unknown[] = []
  const observe = <A, E>(program: Effect.Effect<A, E>) => Effect.runPromise(Effect.exit(program).pipe(
    Effect.provideService(Metric.MetricRegistry, registry),
    Effect.provideService(Logger.CurrentLoggers, new Set([Logger.make((entry) => { logs.push(Logger.formatStructured.log(entry)) })])),
  ))
  const sentinel = "sensitive-error-content-must-never-be-logged"
  expect(Exit.isFailure(await observe(authorizeDevice({ database: { execute: () => Effect.die(new Error(sentinel)) }, session: session(alice.personId, alice.login), report: () => {} })))).toBe(true)
  const device = open()
  try {
    expect(Exit.isFailure(await observe(authorizeDevice({ database: device.database, session: Effect.succeed({ signedIn: true, login: "alice", role: "member" }), report: () => {} })))).toBe(true)
    const count = await Effect.runPromise(Metric.value(Metric.withAttributes(checks, { outcome: "unavailable" })).pipe(Effect.provideService(Metric.MetricRegistry, registry)))
    expect(count.count).toBe(2)
    const recorded = logs
    expect(recorded).toEqual(expect.arrayContaining([expect.objectContaining({ annotations: expect.objectContaining({ stage: "owner", reason: "storage" }) }), expect.objectContaining({ annotations: expect.objectContaining({ stage: "session", reason: "missing_person" }) })]))
    expect(JSON.stringify(recorded)).not.toContain(sentinel)
  } finally { device.close() }
})

test("a recovered session cannot rebind an offline anonymous or legacy runtime in place", async () => {
  let body: unknown = { signedIn: false, available: true }
  let status = 200
  const seen: string[] = []
  const server = createServer((request, response) => {
    seen.push(request.url!)
    response.writeHead(status, { "content-type": "application/json" })
    response.end(body === "malformed" ? "bad-json" : JSON.stringify(body))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    for (const owner of [undefined, { ...alice, personId: "@unverified" }, alice]) {
      let reactivations = 0
      const bound = boundFetch(fetch, () => owner, origin, Promise.resolve(), async () => { reactivations++ })
      body = "malformed"
      expect((await bound(`${origin}/api/auth/session`)).status).toBe(200)
      body = { signedIn: false, available: true }
      await bound(`${origin}/api/auth/session`)
      status = 503
      await bound(`${origin}/api/auth/session`)
      status = 200
      body = { signedIn: true, personId: alice.personId, login: alice.login, role: "member" }
      if (owner === alice) {
        expect((await bound(`${origin}/api/auth/session`)).status).toBe(200)
        expect(reactivations).toBe(0)
      } else {
        const recovered = await Promise.allSettled([
          bound(`${origin}/api/auth/session`),
          bound(`${origin}/api/auth/session`),
        ])
        expect(recovered).toEqual([
          { status: "rejected", reason: expect.objectContaining({ reason: "reauthorizing" }) },
          { status: "rejected", reason: expect.objectContaining({ reason: "reauthorizing" }) },
        ])
        const requests = seen.length
        await expect(bound(`${origin}/api/questions`, { method: "POST" })).rejects.toMatchObject({ reason: "reauthorizing" })
        expect(seen).toHaveLength(requests)
        expect(reactivations).toBe(1)
      }
    }
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())) }
})

test("stable bootstrap ownership does not depend on an interrupted collection registration", async () => {
  const device = open()
  try {
    await Effect.runPromise(authorizeDevice({ database: device.database, session: session(alice.personId, alice.login), report: () => {} }))
    // TanStack registers a table before creating it. A navigation between those operations leaves this valid state.
    device.sqlite.exec("CREATE TABLE collection_registry (collection_id TEXT, table_name TEXT); INSERT INTO collection_registry VALUES ('auth-confirmed', 'not_created_yet')")
    const reports: unknown[] = []
    await Effect.runPromise(authorizeDevice({ database: device.database, session: session(alice.personId, alice.login), report: (owner, outcome) => reports.push({ owner, outcome }) }))
    expect(reports).toEqual([{ owner: alice, outcome: "verified" }])
  } finally { device.close() }
})
