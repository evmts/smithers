import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import * as Account from "../src/Account.ts"
const deferred = <A>() => {
  let resolve!: (value: A | PromiseLike<A>) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<A>((accept, refuse) => {
    resolve = accept
    reject = refuse
  })
  return { promise, resolve, reject }
}
const facts: Account.AccountFacts = { login: "selected-user", scopes: [], boxes: [] }
const authority = (overrides: Partial<Account.AccountAuthority> = {}): Account.AccountAuthority => ({
  state: "signed-in",
  owner: "selected-owner",
  origin: "https://selected.test",
  epoch: 1,
  readsScopes: false,
  ...overrides
})
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setImmediate(resolve))
}
const receipt = (id: string) => ({
  operationId: "job-1",
  requestId: id,
  kind: "requested",
  state: "accepted",
  acceptedAt: "2026-10-01T00:00:00Z"
})
// Unit storage and typed transport ports are independently held; real database/HTTP proof is separate.
const fixture = (initial = authority(), defaultWait = false) => {
  let selected = initial, disposed = false, retained: Account.AccountRequest | undefined
  const saved: Account.AccountRequest[] = [],
    completed: Array<typeof Account.RequestOutcome.Type> = [],
    reports: unknown[] = [],
    failures: string[] = [],
    jobs: Promise<unknown>[] = [],
    calls: Array<{ procedure: string; payload: unknown }> = []
  const dispatch = deferred<unknown>(), read = deferred<unknown>(), commit = deferred<void>()
  commit.resolve(undefined)
  let signIns = 0
  const shared = Account.accountReads()
  const host: Account.AccountHost = {
    authority: () => selected,
    disposed: () => disposed,
    signIn: () => {
      signIns++
    },
    admit: async (request) => {
      saved.push(request)
      await commit.promise
      retained = request
    },
    acknowledged: async (request, answer) => {
      retained = { ...request, operationId: answer.operationId }
    },
    pending: () => retained,
    current: (request) => retained?.id === request.id,
    transport: (request) =>
      Account.accountTransport({
        current: () => selected === request.authority && !disposed,
        post: async (path, body) => {
          expect(path).toBe("/api/workflow/rpc")
          if (
            typeof body !== "object" || body === null || !("procedure" in body) || typeof body.procedure !== "string" ||
            !("payload" in body)
          ) throw new Error("Invalid test command")
          const command = { procedure: body.procedure, payload: body.payload }
          calls.push(command)
          if (command.procedure === "Operation.Dispatch") return dispatch.promise
          if (command.procedure === "Operation.Cancel") {
            return { operationId: "job-1", requestId: request.id, state: "cancelled", actor: "api" }
          }
          return read.promise
        }
      }),
    complete: async (_request, outcome) => {
      completed.push(outcome)
    },
    work: (_request, run) => {
      const job = run()
      jobs.push(job)
      return job
    },
    failed: (line) => {
      failures.push(line)
    },
    report: (error) => {
      reports.push(error)
    },
    ...(defaultWait
      ? {}
      : {
        wait: (signal: AbortSignal) =>
          new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }))
      })
  }
  const core = Account.createAccountController(host, shared)
  return {
    host,
    shared,
    core,
    saved,
    completed,
    reports,
    failures,
    calls,
    dispatch,
    read,
    select: (value: Account.AccountAuthority) => {
      selected = value
    },
    retain: (value: Account.AccountRequest) => {
      retained = value
    },
    clear: () => {
      retained = undefined
    },
    signIns: () => signIns,
    async accepted() {
      const id = saved[0]?.id ?? retained!.id
      dispatch.resolve(receipt(id))
      await settle()
      return id
    },
    async close() {
      disposed = true
      core.dispose()
      dispatch.resolve(receipt(saved[0]?.id ?? "closed"))
      read.resolve({
        operationId: "job-1",
        requestId: saved[0]?.id ?? "closed",
        state: "completed",
        actor: "api",
        result: { login: "selected-user" }
      })
      await Promise.allSettled(jobs)
    }
  }
}
describe("shared Account authority", () => {
  it("requires real completion evidence and keeps private facts outside the identity wire contract", () => {
    const decode = Schema.decodeUnknownSync(Account.RequestOutcome, { onExcessProperty: "error" })
    expect(decode({ operationId: "operation-1", requestId: "request-1", actor: "api", state: "accepted" })).toEqual({
      operationId: "operation-1",
      requestId: "request-1",
      actor: "api",
      state: "accepted"
    })
    expect(
      decode({
        operationId: "operation-1",
        requestId: "request-1",
        actor: "user",
        state: "completed",
        result: { login: "owner" }
      })
    ).toMatchObject({ state: "completed", result: { login: "owner" } })
    for (
      const invalid of [
        { operationId: "operation-1", requestId: "request-1", actor: "api", state: "completed" },
        {
          operationId: "operation-1",
          requestId: "request-1",
          actor: "api",
          state: "accepted",
          result: { login: "owner" }
        },
        {
          operationId: "operation-1",
          requestId: "request-1",
          actor: "api",
          state: "completed",
          result: { login: "owner", token: "secret" }
        },
        { operationId: "operation-1", requestId: "request-1", actor: "agent", state: "failed" }
      ]
    ) expect(() => decode(invalid)).toThrow()
  })

  it.each([
    { unknown: 1 },
    { unknown: { nested: true } },
    { "": null },
    JSON.parse("{\"__proto__\":{}}"),
    { constructor: "value" },
    { prototype: false },
    [],
    [1],
    "",
    "value",
    0,
    1,
    true,
    false,
    null
  ])("refuses nonempty or non-object input: %j", (input) => {
    expect(() => Schema.decodeUnknownSync(Account.accountOperations[0].input)(input)).toThrow()
  })

  it("projects an empty object contract that transport validators can enforce", () => {
    expect(Schema.toJsonSchemaDocument(Account.NoInput, { onExcessProperty: "error" }).schema)
      .toEqual({ type: "object", additionalProperties: false })
  })

  it("declares one identity operation with the same empty schema that public hosts decode", () => {
    expect(Account.accountOperations).toEqual([{
      name: "account.show",
      summary: "Show account",
      runtime: ["identity"],
      input: Account.NoInput
    }])
    expect(Schema.decodeUnknownSync(Account.NoInput)({})).toEqual({})
    expect(() => Schema.decodeUnknownSync(Account.NoInput)(null)).toThrow()
  })

  it.each(["unknown", "signed-out"] as const)("does not admit for %s identity", async (state) => {
    const t = fixture(authority({ state }))
    try {
      const answer = await t.core.showAccount()
      expect(t.saved).toEqual([])
      expect(t.calls).toEqual([])
      expect(t.signIns()).toBe(state === "signed-out" ? 1 : 0)
      expect(answer).toEqual(state === "unknown" ? Account.IDENTITY_PENDING_TEXT : { value: Account.SIGNED_OUT_VALUE })
    } finally {
      await t.close()
    }
  })
  it.each([undefined, "github", "local"] as const)(
    "always uses server identity despite cached provider %s",
    async (provider) => {
      const t = fixture(
        authority({ login: "selected-user", ...(provider === undefined ? {} : { provider }), readsScopes: true })
      )
      try {
        expect(await t.core.showAccount()).toEqual({ value: "Requested" })
        await settle()
        expect(t.calls).toHaveLength(1)
        expect(t.calls[0]).toMatchObject({
          procedure: "Operation.Dispatch",
          payload: { name: "account.show", input: {} }
        })
        expect(t.completed).toEqual([])
        const id = await t.accepted()
        expect(t.calls[1]).toEqual({ procedure: "Operation.Read", payload: { name: "account.show", requestId: id } })
        t.read.resolve({
          operationId: "job-1",
          requestId: id,
          state: "completed",
          actor: "api",
          result: { login: "selected-user" }
        })
        await settle()
        expect(t.completed).toHaveLength(1)
      } finally {
        await t.close()
      }
    }
  )
  it("deduplicates human and model doors while both remote admission and execution are held", async () => {
    const t = fixture()
    try {
      const other = Account.createAccountController(t.host, t.shared)
      expect(await Promise.all([t.core.showAccount(), other.showAccount()])).toEqual([{ value: "Requested" }, {
        value: "Requested"
      }])
      await settle()
      expect(t.saved).toHaveLength(1)
      expect(t.calls).toHaveLength(1)
      await t.accepted()
      expect(t.completed).toEqual([])
    } finally {
      await t.close()
    }
  })
  it.each(["accepted", "dispatching", "running", "waiting"] as const)(
    "never completes a server %s receipt",
    async (state) => {
      const t = fixture()
      try {
        await t.core.showAccount()
        const id = await t.accepted()
        t.read.resolve({ operationId: "job-1", requestId: id, state, actor: "api" })
        await settle()
        expect(t.completed).toEqual([])
        expect(t.shared.flight).toBeDefined()
      } finally {
        await t.close()
      }
    }
  )
  it.each(["completed", "failed", "uncertain", "cancelled"] as const)(
    "settles only server terminal %s",
    async (state) => {
      const t = fixture()
      try {
        await t.core.showAccount()
        const id = await t.accepted()
        t.read.resolve({
          operationId: "job-1",
          requestId: id,
          state,
          actor: "agent",
          ...(state === "completed"
            ? { result: { login: "selected-user" } }
            : state === "failed" || state === "uncertain"
            ? { error: "Account read failed." }
            : {})
        })
        await settle()
        expect(t.completed).toHaveLength(1)
        expect(t.completed[0]?.state).toBe(state)
        expect(t.shared.flight).toBeUndefined()
        expect(t.failures).toEqual(state === "failed" || state === "uncertain" ? ["Account read failed."] : [])
      } finally {
        await t.close()
      }
    }
  )
  it.each(["owner", "origin", "epoch", "provider", "readsScopes"] as const)(
    "fences replacement of %s during admission",
    async (field) => {
      const selected = authority({ provider: "github" })
      const t = fixture(selected)
      try {
        await t.core.showAccount()
        await settle()
        t.select({
          ...selected,
          ...(field === "owner"
            ? { owner: "another" }
            : field === "origin"
            ? { origin: "https://another.test" }
            : field === "epoch"
            ? { epoch: 2 }
            : field === "provider"
            ? { provider: "local" }
            : { readsScopes: true })
        })
        await t.accepted()
        expect(t.calls).toHaveLength(1)
        expect(t.completed).toEqual([])
        expect(t.reports).toEqual([])
      } finally {
        await t.close()
      }
    }
  )
  it.each([true, false])("reconnects existing request, known operation=%s", async (known) => {
    const owner = authority()
    const t = fixture(owner)
    try {
      t.retain({ id: "retained-1", authority: owner, ...(known ? { operationId: "job-1" } : {}) })
      t.core.resumeAccount()
      t.core.resumeAccount()
      await settle()
      expect(t.saved).toEqual([])
      expect(t.calls.map((c) => c.procedure)).toEqual([known ? "Operation.Read" : "Operation.Dispatch"])
      if (!known) await t.accepted()
      expect(t.calls.at(-1)?.payload).toEqual({ name: "account.show", requestId: "retained-1" })
    } finally {
      await t.close()
    }
  })
  it("waits for one durable local pointer while remote launch remains unresolved", async () => {
    const t = fixture(), storage = deferred<void>()
    const core = Account.createAccountController({
      ...t.host,
      admit: async (request) => {
        await storage.promise
        await t.host.admit(request)
      }
    }, t.shared)
    try {
      let acknowledged = false
      const first = core.showAccount().then((answer) => {
        acknowledged = true
        return answer
      })
      const second = core.showAccount()
      await settle()
      expect(acknowledged).toBe(false)
      expect(t.saved).toEqual([])
      expect(t.calls).toEqual([])
      storage.resolve(undefined)
      expect(await Promise.all([first, second])).toEqual([{ value: "Requested" }, { value: "Requested" }])
      await settle()
      expect(t.saved).toHaveLength(1)
      expect(t.calls).toHaveLength(1)
      expect(t.completed).toEqual([])
    } finally {
      storage.resolve(undefined)
      core.dispose()
      await t.close()
    }
  })
  it("does not reuse an observer whose persisted presentation pointer was cleared", async () => {
    const t = fixture()
    try {
      await t.core.showAccount()
      await t.accepted()
      const first = t.saved[0]!.id
      t.clear()
      expect(await t.core.showAccount()).toEqual({ value: "Requested" })
      expect(t.saved).toHaveLength(2)
      expect(t.saved[1]!.id).not.toBe(first)
      await settle()
      expect(t.calls.filter((call) => call.procedure === "Operation.Dispatch")).toHaveLength(2)
      expect(t.calls.some((call) => call.procedure === "Operation.Cancel")).toBe(false)
    } finally {
      await t.close()
    }
  })
  it("disposal stops observation without cancelling server execution", async () => {
    const t = fixture()
    try {
      await t.core.showAccount()
      await t.accepted()
      t.core.dispose()
      await settle()
      expect(t.calls.map((c) => c.procedure)).toEqual(["Operation.Dispatch", "Operation.Read"])
      expect(await t.core.cancelAccount()).toBeUndefined()
      expect(t.completed).toEqual([])
    } finally {
      await t.close()
    }
  })
  it("explicit cancellation uses the canonical operation and request identity", async () => {
    const t = fixture()
    try {
      await t.core.showAccount()
      const id = await t.accepted()
      expect(await t.core.cancelAccount()).toEqual({
        operationId: "job-1",
        requestId: id,
        state: "cancelled",
        actor: "api"
      })
      expect(t.calls.at(-1)).toEqual({
        procedure: "Operation.Cancel",
        payload: { name: "account.show", requestId: id }
      })
      expect(t.completed).toEqual([])
    } finally {
      await t.close()
    }
  })
  it("refuses failed local storage before network admission and permits a fresh attempt", async () => {
    const t = fixture()
    let broken = true
    const core = Account.createAccountController({
      ...t.host,
      admit: async (r) => {
        if (broken) throw new Error("storage refused")
        await t.host.admit(r)
      }
    }, t.shared)
    try {
      await expect(core.showAccount()).rejects.toThrow("storage refused")
      expect(t.calls).toEqual([])
      broken = false
      expect(await core.showAccount()).toEqual({ value: "Requested" })
    } finally {
      core.dispose()
      await t.close()
    }
  })
  it("releases a synchronous local admission failure and admits a fresh retry", async () => {
    const t = fixture()
    let first = true
    const core = Account.createAccountController({
      ...t.host,
      admit: (request) => {
        if (first) {
          first = false
          throw new Error("synchronous storage refusal")
        }
        return t.host.admit(request)
      }
    }, t.shared)
    try {
      await expect(core.showAccount()).rejects.toThrow("synchronous storage refusal")
      expect(t.shared.flight).toBeUndefined()
      expect(t.calls).toEqual([])
      expect(await core.showAccount()).toEqual({ value: "Requested" })
      expect(t.saved).toHaveLength(1)
    } finally {
      core.dispose()
      await t.close()
    }
  })
  it.each(["missing", "signed-out", "foreign-owner"] as const)(
    "does not reconnect a %s request pointer",
    async (kind) => {
      const t = fixture()
      try {
        if (kind !== "missing") {
          t.retain({
            id: "retained-request",
            authority: authority(kind === "signed-out" ? { state: "signed-out" } : { owner: "foreign" }),
            operationId: "job-1"
          })
        }
        t.core.resumeAccount()
        await settle()
        expect(t.calls).toEqual([])
        expect(t.saved).toEqual([])
        expect(t.shared.flight).toBeUndefined()
      } finally {
        await t.close()
      }
    }
  )
  it("reconnects the newly selected owner's pending operation while aborting only old observation", async () => {
    const t = fixture()
    try {
      await t.core.showAccount()
      const old = t.shared.flight
      if (old === undefined) throw new Error("Expected active observation")
      const replacement = authority({ owner: "replacement", epoch: 2 })
      t.select(replacement)
      t.retain({ id: "replacement-request", operationId: "job-1", authority: replacement })
      t.core.resumeAccount()
      await settle()
      expect(old.abort.signal.aborted).toBe(true)
      expect(t.saved).toHaveLength(1)
      expect(t.calls).toEqual([
        { procedure: "Operation.Dispatch", payload: { name: "account.show", requestId: old.id, input: {} } },
        { procedure: "Operation.Read", payload: { name: "account.show", requestId: "replacement-request" } }
      ])
      expect(t.calls.some((call) => call.procedure === "Operation.Cancel")).toBe(false)
    } finally {
      await t.close()
    }
  })
  it("show reconnects the retained accepted operation without new admission and shares repeated restore", async () => {
    const owner = authority(), t = fixture(owner)
    try {
      t.retain({ id: "retained-2", authority: owner, operationId: "job-1" })
      expect(await t.core.showAccount()).toEqual({ value: "Requested" })
      t.core.resumeAccount()
      await settle()
      expect(t.saved).toEqual([])
      expect(t.calls).toEqual([{
        procedure: "Operation.Read",
        payload: { name: "account.show", requestId: "retained-2" }
      }])
    } finally {
      await t.close()
    }
  })
  it.each(["dispatch", "read"] as const)(
    "ignores a cleared presentation pointer after held remote %s",
    async (stage) => {
      const t = fixture()
      try {
        await t.core.showAccount()
        const saved = t.saved[0]
        if (saved === undefined) throw new Error("Expected persisted Account request")
        const id = saved.id
        if (stage === "read") await t.accepted()
        t.clear()
        if (stage === "dispatch") t.dispatch.resolve(receipt(id))
        else {t.read.resolve({
            operationId: "job-1",
            requestId: id,
            actor: "api",
            state: "completed",
            result: { login: "owner" }
          })}
        await settle()
        expect(t.completed).toEqual([])
        expect(t.failures).toEqual([])
        expect(t.reports).toEqual([])
        expect(t.shared.flight).toBeUndefined()
        expect(await t.core.cancelAccount()).toBeUndefined()
      } finally {
        await t.close()
      }
    }
  )
  it("does not start remote execution from a held notification adapter after the owner changes", async () => {
    const t = fixture(), start = deferred<void>()
    const core = Account.createAccountController({
      ...t.host,
      work: async (_request, run) => {
        await start.promise
        return run()
      }
    }, t.shared)
    try {
      expect(await core.showAccount()).toEqual({ value: "Requested" })
      t.select(authority({ owner: "replacement" }))
      expect(await core.cancelAccount()).toBeUndefined()
      start.resolve()
      await settle()
      expect(t.calls).toEqual([])
      expect(t.completed).toEqual([])
      expect(t.shared.flight).toBeUndefined()
    } finally {
      start.resolve()
      core.dispose()
      await t.close()
    }
  })
  it.each([undefined, 503])("publishes typed transport failure safely, HTTP=%s", async (status) => {
    const t = fixture()
    const core = Account.createAccountController({
      ...t.host,
      transport: () =>
        Account.accountTransport({
          current: () => true,
          post: async () => {
            throw new Account.AccountTransportError("account_read_failed", status)
          }
        })
    }, t.shared)
    try {
      await core.showAccount()
      await settle()
      expect(t.completed).toEqual([])
      expect(t.failures).toEqual([status === undefined ? "Account read failed." : "Account read failed (HTTP 503)."])
      expect(t.reports).toHaveLength(1)
      expect(t.reports[0]).toMatchObject({ code: "account_read_failed", status })
      expect(t.shared.flight).toBeUndefined()
    } finally {
      core.dispose()
      await t.close()
    }
  })
  it("polls a running server with the default cadence and stops further reads on disposal", async () => {
    const t = fixture(authority(), true)
    try {
      await t.core.showAccount()
      const id = await t.accepted()
      t.read.resolve({ operationId: "job-1", requestId: id, state: "running", actor: "api" })
      await settle()
      expect(t.calls.filter((call) => call.procedure === "Operation.Read")).toHaveLength(1)
      const deadline = Date.now() + 2000
      while (t.calls.filter((call) => call.procedure === "Operation.Read").length < 2 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      expect(t.calls.filter((call) => call.procedure === "Operation.Read")).toHaveLength(2)
      t.core.dispose()
      await settle()
      expect(t.completed).toEqual([])
      await new Promise((resolve) => setTimeout(resolve, 275))
      expect(t.calls.filter((call) => call.procedure === "Operation.Read")).toHaveLength(2)
      expect(t.failures).toEqual([])
    } finally {
      await t.close()
    }
  })
  it.each(["admission", "acknowledgment", "completion"] as const)(
    "fences owner replacement during held %s persistence",
    async (stage) => {
      const t = fixture(), entered = deferred<void>(), commit = deferred<void>()
      const core = Account.createAccountController({
        ...t.host,
        admit: async (request) => {
          if (stage === "admission") {
            entered.resolve()
            await commit.promise
          }
          await t.host.admit(request)
        },
        acknowledged: async (request, answer) => {
          if (stage === "acknowledgment") {
            entered.resolve()
            await commit.promise
          }
          await t.host.acknowledged(request, answer)
        },
        complete: async (request, outcome) => {
          if (stage === "completion") {
            entered.resolve()
            await commit.promise
          }
          await t.host.complete(request, outcome)
        }
      }, t.shared)
      try {
        const answer = core.showAccount()
        if (stage !== "admission") {
          expect(await answer).toEqual({ value: "Requested" })
          const saved = t.saved[0]
          if (saved === undefined) throw new Error("Expected persisted Account request")
          const id = saved.id
          t.dispatch.resolve(receipt(id))
          if (stage === "completion") {
            t.read.resolve({
              operationId: "job-1",
              requestId: id,
              actor: "api",
              state: "completed",
              result: { login: "selected-user" }
            })
          }
        }
        await entered.promise
        t.select(authority({ owner: "replacement" }))
        commit.resolve()
        await settle()
        if (stage === "admission") expect(await answer).toEqual({ value: "Account request is no longer current." })
        expect(t.calls.filter((call) => call.procedure === "Operation.Read")).toHaveLength(
          stage === "completion" ? 1 : 0
        )
        expect(t.shared.flight).toBeUndefined()
        expect(t.reports).toEqual([])
        expect(t.failures).toEqual([])
      } finally {
        commit.resolve()
        core.dispose()
        await t.close()
      }
    }
  )
  it("refuses show, reconnect and cancellation after host disposal without any remote call", async () => {
    const t = fixture()
    await t.close()
    expect(await t.core.showAccount()).toEqual({ value: "Account request is no longer current." })
    t.core.resumeAccount()
    expect(await t.core.cancelAccount()).toBeUndefined()
    expect(t.calls).toEqual([])
    expect(t.saved).toEqual([])
  })
  it("reports a completion storage failure without a success result", async () => {
    const t = fixture()
    const core = Account.createAccountController({
      ...t.host,
      complete: async () => {
        throw new Error("save refused")
      }
    }, t.shared)
    try {
      await core.showAccount()
      const id = await t.accepted()
      t.read.resolve({
        operationId: "job-1",
        requestId: id,
        state: "completed",
        actor: "user",
        result: { login: "selected-user" }
      })
      await settle()
      expect(t.completed).toEqual([])
      expect(t.reports).toHaveLength(1)
      expect(t.shared.flight).toBeUndefined()
    } finally {
      core.dispose()
      await t.close()
    }
  })
  it.each([
    { state: "completed" },
    { state: "accepted", result: { login: "unearned" } },
    { state: "completed", result: { login: "owner", token: "private" } },
    { state: "failed" },
    { state: "completed", requestId: "wrong", result: { login: "owner" } },
    { state: "completed", operationId: "wrong", result: { login: "owner" } }
  ])("refuses invalid or stale terminal evidence %j", async (invalid) => {
    const t = fixture()
    try {
      await t.core.showAccount()
      const id = await t.accepted()
      t.read.resolve({ operationId: "job-1", requestId: id, actor: "api", ...invalid })
      await settle()
      expect(t.completed).toEqual([])
      expect(t.reports).toHaveLength(1)
      expect(t.reports[0]).toBeInstanceOf(Account.AccountTransportError)
    } finally {
      await t.close()
    }
  })
  it.each(["before", "after"] as const)(
    "refuses selected-source change %s HTTP and never exposes its receipt",
    async (changed) => {
      let current = changed !== "before", posts = 0
      const remote = Account.accountTransport({
        current: () => current,
        post: async () => {
          posts++
          current = false
          return { cursor: 1, truncated: false, items: [] }
        }
      })
      await expect(remote.history()).rejects.toMatchObject({ code: "account_changed" })
      expect(posts).toBe(changed === "before" ? 0 : 1)
    }
  )
  it("reads authenticated history through the literal public contract", async () => {
    const calls: unknown[] = []
    const remote = Account.accountTransport({
      current: () => true,
      post: async (path, body) => {
        calls.push([path, body])
        return {
          cursor: 7,
          truncated: false,
          items: [{
            operationId: "job-1",
            requestId: "request-1",
            actor: "api",
            state: "completed",
            result: { login: "owner" }
          }]
        }
      }
    })
    expect(await remote.history()).toMatchObject({
      cursor: 7,
      items: [{ state: "completed", result: { login: "owner" } }]
    })
    expect(calls).toEqual([["/api/workflow/rpc", { procedure: "Operation.History", payload: {} }]])
  })
  it.each(["", "../outside", "x".repeat(129)])("refuses invalid request identity before HTTP %j", async (id) => {
    let posts = 0
    const remote = Account.accountTransport({
      current: () => true,
      post: async () => {
        posts++
        return {}
      }
    })
    await expect(remote.dispatch(id)).rejects.toMatchObject({ code: "backend_protocol" })
    expect(posts).toBe(0)
  })
  it("decodes only real permission rows and rejects malformed or duplicate scope claims", async () => {
    expect(
      await Account.readAccountPermissions(
        async () => Response.json({ scopes: [{ scope: " repo ", plain: " Repository " }] }),
        facts
      )
    ).toEqual({ facts: { ...facts, scopes: [{ scope: "repo", plain: "Repository" }] } })
    for (
      const body of [null, {}, { scopes: [null] }, { scopes: [{ scope: " ", plain: "value" }] }, {
        scopes: [{ scope: "repo", plain: "" }]
      }, { scopes: [{ scope: "repo", plain: "one" }, { scope: " repo ", plain: "two" }] }]
    ) {
      expect(await Account.readAccountPermissions(async () => Response.json(body), facts)).toEqual({
        error: "Invalid permission response."
      })
    }
    expect(await Account.readAccountPermissions(async () => new Response("private-body", { status: 401 }), facts))
      .toEqual({ error: "Permissions could not be loaded (HTTP 401)." })
    expect(
      await Account.readAccountPermissions(async () => {
        throw new Error("private-transport")
      }, facts)
    ).toEqual({ error: "Permissions could not be loaded." })
  })
})
