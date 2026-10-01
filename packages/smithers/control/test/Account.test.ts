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

const authority = (overrides: Partial<Account.AccountAuthority> = {}): Account.AccountAuthority => ({
  state: "signed-in",
  owner: "selected-token-owner",
  origin: "http://127.0.0.1:32101",
  epoch: 1,
  readsScopes: false,
  ...overrides
})
const facts: Account.AccountFacts = { login: "selected-user", scopes: [], boxes: [] }
const settle = async () => {
  for (let i = 0; i < 3; i++) await new Promise<void>((resolve) => setImmediate(resolve))
}

/** Unit host ports: storage commit and network verdicts are independently held; no live-host proof. */
const fixture = (initial = authority(), heldAdmission = false) => {
  let selected = initial
  let disposed = false
  let retained: Account.AccountRequest | undefined
  let pending = false
  let signIns = 0
  const commit = deferred<void>()
  if (!heldAdmission) commit.resolve(undefined)
  const admissions: Account.AccountRequest[] = []
  const reads: {
    request: Account.AccountRequest
    signal: AbortSignal
    answer: ReturnType<typeof deferred<Account.AccountRead>>
  }[] = []
  const completed: Account.AccountRead[] = []
  const failures: string[] = []
  const reports: unknown[] = []
  const jobs: Promise<unknown>[] = []
  const shared = Account.accountReads()
  const host: Account.AccountHost = {
    authority: () => selected,
    disposed: () => disposed,
    boxes: () => [],
    signIn: () => {
      signIns++
    },
    admit: async (request) => {
      admissions.push(request)
      await commit.promise
      retained = request
      pending = true
    },
    pending: () => pending ? retained : undefined,
    current: (request) => retained?.id === request.id,
    read: async (request, _facts, signal) => {
      const answer = deferred<Account.AccountRead>()
      reads.push({ request, signal, answer })
      return answer.promise
    },
    complete: async (_request, answer) => {
      completed.push(answer)
      pending = false
    },
    work: (_request, run) => {
      const job = run()
      jobs.push(job)
      return job
    },
    failed: (detail) => {
      failures.push(detail)
    },
    report: (error) => {
      reports.push(error)
    }
  }
  const controller = Account.createAccountController(host, shared)
  return {
    host,
    shared,
    controller,
    commit,
    admissions,
    reads,
    completed,
    failures,
    reports,
    jobs,
    select: (value: Account.AccountAuthority) => {
      selected = value
    },
    retain: (value: Account.AccountRequest) => {
      retained = value
      pending = true
    },
    signIns: () => signIns,
    async close() {
      disposed = true
      controller.dispose()
      commit.resolve(undefined)
      for (const read of reads) read.answer.resolve({ facts })
      await Promise.allSettled(jobs)
    }
  }
}

describe("shared Account authority", () => {
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

  it("distinguishes pending identity from signed out without admitting or reading", async () => {
    const t = fixture(authority({ state: "unknown" }))
    try {
      expect(await t.controller.showAccount()).toBe(Account.IDENTITY_PENDING_TEXT)
      expect(t.signIns()).toBe(0)
      t.select(authority({ state: "signed-out" }))
      expect(await t.controller.showAccount()).toEqual({ value: Account.SIGNED_OUT_VALUE })
      expect(t.signIns()).toBe(1)
      expect(t.admissions).toEqual([])
      expect(t.reads).toEqual([])
    } finally {
      await t.close()
    }
  })

  it("shares a held durable admission across actors, then acknowledges before the read finishes", async () => {
    const t = fixture(authority(), true)
    const other = Account.createAccountController(t.host, t.shared)
    let acknowledged = false
    const first = t.controller.showAccount().then((value) => {
      acknowledged = true
      return value
    })
    const second = other.showAccount()
    try {
      await settle()
      expect(t.admissions).toHaveLength(1)
      expect(t.reads).toEqual([])
      expect(acknowledged).toBe(false)
      t.commit.resolve(undefined)
      expect(await first).toEqual({ value: "Requested" })
      expect(await second).toEqual({ value: "Requested" })
      expect(t.reads).toHaveLength(1)
      expect(t.completed).toEqual([])
      let unrelatedAction = false
      queueMicrotask(() => {
        unrelatedAction = true
      })
      await settle()
      expect(unrelatedAction).toBe(true)
      expect(t.completed).toEqual([])
      t.reads[0]!.answer.resolve({ facts })
      await Promise.all(t.jobs)
      expect(t.completed).toEqual([{ facts }])
    } finally {
      await t.close()
      await Promise.allSettled([first, second])
    }
  })

  for (const change of ["owner", "origin", "login", "readsScopes", "logout", "ABA", "dispose"] as const) {
    it(`rejects a late private answer after ${change}`, async () => {
      const t = fixture(authority({ login: "selected-user", provider: "github", readsScopes: true }))
      try {
        await t.controller.showAccount()
        expect(t.reads).toHaveLength(1)
        const initial = t.reads[0]!.request.authority
        if (change === "owner") t.select({ ...initial, owner: "other-owner" })
        if (change === "origin") t.select({ ...initial, origin: "http://127.0.0.1:32102" })
        if (change === "login") t.select({ ...initial, login: "replacement-login" })
        if (change === "readsScopes") t.select({ ...initial, readsScopes: false })
        if (change === "logout") t.select({ ...initial, state: "signed-out", epoch: 2 })
        if (change === "ABA") {
          t.select({ ...initial, state: "signed-out", epoch: 2 })
          t.select({ ...initial, epoch: 3 })
        }
        if (change === "dispose") t.controller.dispose()
        t.reads[0]!.answer.resolve({ facts: { ...facts, login: "private-old-owner" } })
        await Promise.all(t.jobs)
        expect(t.completed).toEqual([])
        expect(t.failures).toEqual([])
        expect(t.reports).toEqual([])
        if (change === "dispose") expect(t.reads[0]!.signal.aborted).toBe(true)
      } finally {
        await t.close()
      }
    })
  }

  it("admits a different owner while the old read remains held and rejects its later completion", async () => {
    const t = fixture()
    try {
      await t.controller.showAccount()
      const previous = t.reads[0]!
      t.select(authority({ owner: "replacement-owner" }))
      await t.controller.showAccount()
      expect(t.admissions).toHaveLength(2)
      expect(t.reads).toHaveLength(2)
      expect(t.reads[1]!.request.id).not.toBe(previous.request.id)
      expect(previous.signal.aborted).toBe(true)
      const replacement = { ...facts, login: "replacement-owner" }
      t.reads[1]!.answer.resolve({ facts: replacement })
      await t.jobs[1]
      expect(t.completed).toEqual([{ facts: replacement }])
      previous.answer.resolve({ facts: { ...facts, login: "private-old-owner" } })
      await Promise.all(t.jobs)
      expect(t.completed).toEqual([{ facts: replacement }])
      expect(t.failures).toEqual([])
    } finally {
      await t.close()
    }
  })

  it("cancels a superseded origin read and permits only the new selected origin to publish", async () => {
    const t = fixture()
    try {
      await t.controller.showAccount()
      t.select(authority({ origin: "http://127.0.0.1:32102", epoch: 2 }))
      await t.controller.showAccount()
      expect(t.reads).toHaveLength(2)
      expect(t.reads[0]!.signal.aborted).toBe(true)
      t.reads[1]!.answer.resolve({ facts })
      t.reads[0]!.answer.resolve({ facts: { ...facts, login: "private-old-owner" } })
      await Promise.all(t.jobs)
      expect(t.completed).toEqual([{ facts }])
    } finally {
      await t.close()
    }
  })

  it("retains a safe failure and allows a fresh request to recover without duplicate completion", async () => {
    const t = fixture()
    try {
      await t.controller.showAccount()
      t.reads[0]!.answer.resolve({ error: "Account could not be read." })
      await Promise.all(t.jobs)
      expect(t.failures).toEqual(["Account could not be read."])
      const oldId = t.reads[0]!.request.id
      await t.controller.showAccount()
      expect(t.reads[1]!.request.id).not.toBe(oldId)
      t.reads[1]!.answer.resolve({ facts })
      await Promise.all(t.jobs)
      expect(t.completed).toEqual([{ error: "Account could not be read." }, { facts }])
    } finally {
      await t.close()
    }
  })

  it("reconnects a retained matching request without new admission and refuses an old origin receipt", async () => {
    const t = fixture()
    const request: Account.AccountRequest = { id: "persisted-request", authority: authority(), read: "identity" }
    try {
      t.retain(request)
      t.controller.resumeAccount()
      t.controller.resumeAccount()
      expect(t.admissions).toEqual([])
      expect(t.reads).toHaveLength(1)
      expect(t.reads[0]!.request.id).toBe(request.id)
      t.reads[0]!.answer.resolve({ facts })
      await Promise.all(t.jobs)
      t.retain({ ...request, authority: authority({ origin: "http://127.0.0.1:32102" }) })
      t.controller.resumeAccount()
      expect(t.reads).toHaveLength(1)
    } finally {
      await t.close()
    }
  })

  it("persists verified snapshot facts in repository/name order without a permissions read", async () => {
    const t = fixture(authority({ login: "selected-user", provider: "local" }))
    const boxes = [
      { id: "3", repoId: "z/repo", name: "a", status: "running" },
      { id: "2", repoId: "a/repo", name: "z", status: "stopped" },
      { id: "1", repoId: "a/repo", name: "a", status: "running" }
    ]
    const admitted: Account.AccountFacts[] = []
    const controller = Account.createAccountController({
      ...t.host,
      boxes: () => boxes,
      admit: async (request, value) => {
        if (value !== undefined) admitted.push(value)
        await t.host.admit(request, value)
      }
    }, t.shared)
    try {
      expect(await controller.showAccount()).toEqual({ value: "account: @selected-user; 3 box(es) listed" })
      expect(admitted).toEqual([{
        login: "selected-user",
        provider: "local",
        scopes: [],
        boxes: [boxes[2], boxes[1], boxes[0]]
      }])
      expect(boxes.map((box) => box.id)).toEqual(["3", "2", "1"])
      expect(t.reads).toEqual([])
      controller.resumeAccount()
      expect(t.reads).toEqual([])
    } finally {
      await t.close()
    }
  })

  it("refuses a failed durable admission before any read and recovers through a new request", async () => {
    const t = fixture()
    const failure = new Error("owned-storage-refused")
    let refuse = true
    const controller = Account.createAccountController({
      ...t.host,
      admit: async (request, value) => {
        if (refuse) {
          refuse = false
          throw failure
        }
        await t.host.admit(request, value)
      }
    }, t.shared)
    try {
      await expect(controller.showAccount()).rejects.toBe(failure)
      expect(t.reads).toEqual([])
      expect(await controller.showAccount()).toEqual({ value: "Requested" })
      t.reads[0]!.answer.resolve({ facts })
      await Promise.all(t.jobs)
      expect(t.completed).toEqual([{ facts }])
    } finally {
      await t.close()
    }
  })

  it("does not launch a read after account replacement while admission is held", async () => {
    const t = fixture(authority(), true)
    const showing = t.controller.showAccount()
    try {
      t.select(authority({ owner: "replacement", epoch: 2 }))
      t.commit.resolve(undefined)
      expect(await showing).toEqual({ value: "Account request is no longer current." })
      expect(t.reads).toEqual([])
      expect(t.completed).toEqual([])
    } finally {
      await t.close()
      await Promise.allSettled([showing])
    }
  })

  for (const stale of [false, true]) {
    it(`reports a thrown read only while its request is ${stale ? "superseded" : "current"}`, async () => {
      const t = fixture()
      const thrown = new Error("private-diagnostic-only")
      try {
        await t.controller.showAccount()
        if (stale) t.select(authority({ epoch: 2 }))
        t.reads[0]!.answer.reject(thrown)
        await Promise.allSettled(t.jobs)
        await settle()
        expect(t.reports).toEqual(stale ? [] : [thrown])
        expect(t.completed).toEqual([])
        expect(t.failures).toEqual([])
      } finally {
        await t.close()
      }
    })
  }

  it("reports completion storage failure without a success receipt and can retry", async () => {
    const t = fixture()
    const failure = new Error("completion-storage-refused")
    let refuse = true
    const controller = Account.createAccountController({
      ...t.host,
      complete: async (request, answer) => {
        if (refuse) {
          refuse = false
          throw failure
        }
        await t.host.complete(request, answer)
      }
    }, t.shared)
    try {
      await controller.showAccount()
      t.reads[0]!.answer.resolve({ facts })
      await Promise.allSettled(t.jobs)
      await settle()
      expect(t.reports).toEqual([failure])
      expect(t.completed).toEqual([])
      await controller.showAccount()
      expect(t.admissions).toHaveLength(1)
      expect(t.reads).toHaveLength(2)
      expect(t.reads[1]!.request.id).toBe(t.reads[0]!.request.id)
      t.reads[1]!.answer.resolve({ facts })
      await Promise.allSettled(t.jobs)
      expect(t.completed).toEqual([{ facts }])
    } finally {
      await t.close()
    }
  })

  it("never resumes or admits after its host is disposed", async () => {
    const t = fixture()
    await t.close()
    t.retain({ id: "stored", authority: authority(), read: "identity" })
    t.controller.resumeAccount()
    expect(await t.controller.showAccount()).toEqual({ value: "Account request is no longer current." })
    expect(t.admissions).toEqual([])
    expect(t.reads).toEqual([])
  })

  for (const provider of ["github", "local"] as const) {
    for (const readsScopes of [false, true]) {
      it(`uses permission reads only for verified GitHub identity with scopes authority (${provider}/${readsScopes})`, async () => {
        const t = fixture(authority({ login: "selected-user", provider, readsScopes }))
        try {
          await t.controller.showAccount()
          expect(t.admissions[0]!.read).toBe(provider === "github" && readsScopes ? "permissions" : "snapshot")
          expect(t.reads).toHaveLength(provider === "github" && readsScopes ? 1 : 0)
          if (t.reads[0]) {
            t.reads[0].answer.resolve({ facts })
            await Promise.all(t.jobs)
          }
        } finally {
          await t.close()
        }
      })
    }
  }

  it("does not publish after another retained request supersedes the same owner and origin", async () => {
    const t = fixture()
    try {
      await t.controller.showAccount()
      t.retain({ ...t.reads[0]!.request, id: "newer-request" })
      await t.controller.showAccount()
      expect(t.admissions).toHaveLength(1)
      expect(t.reads).toHaveLength(2)
      expect(t.reads[1]!.request.id).toBe("newer-request")
      expect(t.reads[0]!.signal.aborted).toBe(true)
      t.reads[1]!.answer.resolve({ facts })
      await t.jobs[1]
      t.reads[0]!.answer.resolve({ facts: { ...facts, login: "private-old-answer" } })
      await Promise.all(t.jobs)
      expect(t.completed).toEqual([{ facts }])
      expect(t.failures).toEqual([])
    } finally {
      await t.close()
    }
  })

  it("ignores a superseded admission failure without exposing its storage diagnostics", async () => {
    const t = fixture()
    const storage = deferred<void>()
    const controller = Account.createAccountController({ ...t.host, admit: () => storage.promise }, t.shared)
    const showing = controller.showAccount()
    try {
      t.select(authority({ owner: "replacement", epoch: 2 }))
      storage.reject(new Error("private-storage-detail"))
      expect(await showing).toEqual({ value: "Account request is no longer current." })
      expect(t.reads).toEqual([])
      expect(t.reports).toEqual([])
    } finally {
      storage.resolve(undefined)
      await t.close()
      await Promise.allSettled([showing])
    }
  })

  it("honors a matching retained request on show instead of creating a second durable admission", async () => {
    const t = fixture()
    try {
      t.retain({ id: "durable-request", authority: authority(), read: "identity" })
      expect(await t.controller.showAccount()).toEqual({ value: "Requested" })
      expect(t.admissions).toEqual([])
      expect(t.reads[0]!.request.id).toBe("durable-request")
      t.reads[0]!.answer.resolve({ facts })
      await Promise.all(t.jobs)
      expect(t.completed).toEqual([{ facts }])
    } finally {
      await t.close()
    }
  })

  it("does not start a queued notification read after the selected authority changes", async () => {
    const t = fixture()
    const start = deferred<void>()
    const controller = Account.createAccountController({
      ...t.host,
      work: (_request, run) => {
        const job = start.promise.then(run)
        t.jobs.push(job)
        return job
      }
    }, t.shared)
    try {
      await controller.showAccount()
      t.select(authority({ epoch: 2 }))
      start.resolve(undefined)
      await Promise.all(t.jobs)
      expect(t.reads).toEqual([])
      expect(t.completed).toEqual([])
    } finally {
      start.resolve(undefined)
      await t.close()
    }
  })

  it("does not surface a failed completion after logout while its durable save is held", async () => {
    const t = fixture()
    const save = deferred<void>()
    const controller = Account.createAccountController({ ...t.host, complete: async () => save.promise }, t.shared)
    try {
      await controller.showAccount()
      t.reads[0]!.answer.resolve({ error: "Old account failed." })
      await settle()
      t.select(authority({ state: "signed-out", epoch: 2 }))
      save.resolve(undefined)
      await Promise.all(t.jobs)
      expect(t.failures).toEqual([])
      expect(t.reports).toEqual([])
    } finally {
      save.resolve(undefined)
      await t.close()
    }
  })

  it("does not invent a provider for a verified identity snapshot", async () => {
    const t = fixture(authority({ login: "selected-user" }))
    const admitted: Account.AccountFacts[] = []
    const controller = Account.createAccountController({
      ...t.host,
      admit: async (request, value) => {
        if (value !== undefined) admitted.push(value)
        await t.host.admit(request, value)
      }
    }, t.shared)
    try {
      expect(await controller.showAccount()).toEqual({ value: "account: @selected-user; 0 box(es) listed" })
      expect(admitted).toEqual([facts])
      expect(t.reads).toEqual([])
    } finally {
      await t.close()
    }
  })

  it("projects canonical selected identity without retaining credentials or invented scopes", () => {
    expect(
      Account.identityFacts({
        username: "SelectedUser",
        token: "private-token",
        scopes: ["invented"],
        email: "private-email"
      })
    ).toEqual({ login: "SelectedUser", scopes: [], boxes: [] })
    for (const value of [null, {}, { username: "" }, { username: 1 }, { username: "   " }]) {
      expect(Account.identityFacts(value)).toBeUndefined()
    }
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
