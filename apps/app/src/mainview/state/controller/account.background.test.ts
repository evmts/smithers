import { Database } from "bun:sqlite"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { APP_SCHEMA_VERSION } from "../../chain/SchemaVersion"
import { openSqliteRowStorage } from "../../chain/SqliteRowStorage"
import { PERSISTED_COLLECTION_SPECS } from "../AppStore"
import { expect, test } from "bun:test"
import { createAppStore } from "../AppStore"
import { createActorBindings } from "../ActorBindings"
import { memoryStorage, settle, unavailableAgent, waitFor } from "../TestFixtures"
import { createAccountController } from "./account"
import { createControllerContext } from "./context"
import { createFailureController } from "./failures"

const fixture = async (storage = memoryStorage(), provider: "github" | "local" = "github") => {
  const store = await createAppStore({ kind: "localStorage", storage })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "owner", provider, admin: false, scopesPlain: null }).isPersisted.promise
  const requests: { path: string; body: { procedure?: string; payload?: { name: string; requestId: string; input?: object } }; response: ReturnType<typeof Promise.withResolvers<Response>> }[] = []
  const ctx = createControllerContext(store, unavailableAgent, { toastDebounceMs: 1, fetchImpl: async (url, init) => {
    const response = Promise.withResolvers<Response>()
    requests.push({ path: String(url), body: init?.body ? JSON.parse(String(init.body)) : {}, response })
    return response.promise
  } })
  Object.assign(ctx, createFailureController(ctx))
  const actors = createActorBindings(ctx.onDispose)
  const account = actors.pair(ctx, context => createAccountController(context, { provider, readsScopes: provider === "github", nextOrdinal: store.nextOrdinal, promptSignIn: () => {} }))
  const card = () => { const row = store.collections.cards.get("account"); return row?.kind === "account" ? row : undefined }
  const reply = async (index: number, state: string = "completed", extra: object = {}) => {
    await waitFor(() => requests.length > index)
    const request = requests[index]!, requestId = request.body.payload!.requestId
    request.response.resolve(Response.json(request.body.procedure === "Operation.Dispatch"
      ? { operationId: `job-${requestId}`, requestId, kind: "requested", state, acceptedAt: "2026-10-01T00:00:00Z", ...extra }
      : { operationId: `job-${requestId}`, requestId, actor: "api", state, ...(state === "completed" ? { result: { login: "owner" } } : {}), ...extra }))
  }
  return { storage, store, ctx, account, requests, card, reply, agentShow: () => actors.select(account.showAccount)(), dispose: async () => {
    try { await ctx.dispose() } finally {
      for (const request of requests) request.response.resolve(new Response(null, { status: 503 }))
      await store.dispose?.()
    }
  } }
}

for (const provider of ["github", "local"] as const) {
  test(`${provider} Account acknowledges durable admission before server dispatch and execution; both actors join`, async () => {
    const t = await fixture(memoryStorage(), provider)
    try {
      expect(await t.account.showAccount()).toEqual({ value: "Requested" })
      await waitFor(() => t.requests.length === 1)
      expect(await t.agentShow()).toEqual({ value: "Requested" })
      expect(t.requests).toHaveLength(1)
      expect(t.requests[0]!.body).toEqual({ procedure: "Operation.Dispatch", payload: { name: "account.show", requestId: t.card()!.payload.refresh!.id, input: {} } })
      expect(t.card()?.payload.refresh?.state).toBe("requested")
      await t.store.dispatch({ type: "composer.changed", actor: "user", draft: "Still usable" }).isPersisted.promise
      await waitFor(() => t.store.collections.toasts.get("toast-account.permissions")?.status === "running")
      expect(t.store.session().draft).toBe("Still usable")
      await t.reply(0, "accepted")
      await waitFor(() => t.requests.length === 2)
      expect(t.card()?.payload.refresh).toMatchObject({ state: "requested", operationId: `job-${t.card()!.payload.refresh!.id}` })
      expect(t.requests[1]!.body).toEqual({ procedure: "Operation.Read", payload: { name: "account.show", requestId: t.card()!.payload.refresh!.id } })
      await t.reply(1)
      await waitFor(() => t.card()?.payload.refresh?.state === "complete")
      await waitFor(() => t.store.collections.toasts.get("toast-account.permissions")?.status === "ok")
      if (provider === "github") {
        await waitFor(() => t.requests.length === 3)
        t.requests[2]!.response.resolve(Response.json({ scopes: [{ scope: "issues", plain: "Read issues" }] }))
        await waitFor(() => t.card()?.payload.scopes.length === 1)
      } else expect(t.requests).toHaveLength(2)
    } finally { await t.dispose() }
  })
}

for (const state of ["accepted", "dispatching", "running", "waiting"] as const) {
  test(`canonical ${state} receipt remains pending without supplementary permissions or false completion`, async () => {
    const t = await fixture()
    try {
      await t.account.showAccount(); await t.reply(0, "accepted"); await t.reply(1, state)
      await waitFor(() => t.requests.length === 3)
      expect(t.requests.map(request => request.body.procedure)).toEqual(["Operation.Dispatch", "Operation.Read", "Operation.Read"])
      expect(t.card()?.payload.refresh?.state).toBe("requested")
      expect(t.store.collections.toasts.get("toast-account.permissions")?.status).toBe("running")
      await t.reply(2)
      await waitFor(() => t.card()?.payload.refresh?.state === "complete")
    } finally { await t.dispose() }
  })
}

for (const accepted of [false, true]) {
  test(`reload reconnects the ${accepted ? "accepted" : "unacknowledged"} request with its original identity`, async () => {
    const storage = memoryStorage(), first = await fixture(storage)
    let second: Awaited<ReturnType<typeof fixture>> | undefined
    try {
      await first.account.showAccount(); await waitFor(() => first.requests.length === 1)
      if (accepted) { await first.reply(0, "accepted"); await waitFor(() => first.requests.length === 2) }
      const id = first.card()!.payload.refresh!.id
      await first.store.settled?.(); await first.dispose()
      second = await fixture(storage); second.account.resumeAccount(); second.account.resumeAccount()
      expect(await second.account.showAccount()).toEqual({ value: "Requested" })
      await waitFor(() => second!.requests.length === 1)
      expect(second.requests[0]!.body.procedure).toBe(accepted ? "Operation.Read" : "Operation.Dispatch")
      expect(second.requests[0]!.body.payload?.requestId).toBe(id)
      if (!accepted) { await second.reply(0, "accepted"); await second.reply(1) } else await second.reply(0)
      await waitFor(() => second!.card()?.payload.refresh?.state === "complete")
      expect((await second.store.verifyState()).valid).toBe(true)
    } finally { try { await first.dispose() } finally { await second?.dispose() } }
  })
}

for (const state of ["failed", "uncertain", "cancelled"] as const) {
  test(`only canonical terminal ${state} settles the identity job and survives reload`, async () => {
    const storage = memoryStorage(), t = await fixture(storage)
    let restored: Awaited<ReturnType<typeof fixture>> | undefined
    try {
      await t.account.showAccount(); await t.reply(0, "accepted"); await t.reply(1, state, state === "cancelled" ? {} : { error: "Identity unavailable" })
      await waitFor(() => t.card()?.payload.refresh?.state === (state === "cancelled" ? "cancelled" : "failed"))
      expect(t.requests).toHaveLength(2)
      const requestId = t.card()!.payload.refresh!.id
      await t.store.settled?.(); await t.dispose(); restored = await fixture(storage)
      restored.account.resumeAccount(); await waitFor(() => restored!.requests.length === 1)
      expect(restored.requests[0]!.body.procedure).toBe("Operation.Read")
      expect(restored.requests[0]!.body.payload?.requestId).toBe(requestId)
      expect(restored.card()?.payload.refresh?.state).toBe("requested")
      await restored.reply(0, state, state === "cancelled" ? {} : { error: "Identity unavailable" })
      await waitFor(() => restored!.card()?.payload.refresh?.state === (state === "cancelled" ? "cancelled" : "failed"))
    } finally { try { await t.dispose() } finally { await restored?.dispose() } }
  })
}

for (const failure of ["network", "http", "json", "shape", "row", "duplicate"] as const) {
  test(`${failure} supplementary permissions failure cannot fail the completed identity job`, async () => {
    const t = await fixture()
    try {
      await t.account.showAccount(); await t.reply(0, "accepted"); await t.reply(1)
      await waitFor(() => t.requests.length === 3)
      expect(t.card()?.payload.refresh?.state).toBe("complete")
      const read = t.requests[2]!.response
      if (failure === "network") read.reject(new Error("private network details"))
      else read.resolve(failure === "http" ? new Response("private response", { status: 503 }) : failure === "json" ? new Response("private invalid JSON")
        : Response.json(failure === "shape" ? {} : { scopes: failure === "row" ? [{ scope: "issues" }] : [{ scope: "issues", plain: "Read issues" }, { scope: "issues", plain: "Read issues" }] }))
      await waitFor(() => t.card()?.payload.permissionsError !== undefined)
      expect(t.card()?.payload.refresh?.state).toBe("complete")
      expect(t.card()?.payload.scopes).toEqual([])
      expect(JSON.stringify(t.card())).not.toContain("private")
      await t.store.settled?.(); expect((await t.store.verifyState()).valid).toBe(true)
    } finally { await t.dispose() }
  })
}

for (const boundary of ["dispatch", "read"] as const) {
  test(`transport failure at ${boundary} presents observation failure and reconnects the same request`, async () => {
    const t = await fixture()
    try {
      await t.account.showAccount(); await waitFor(() => t.requests.length === 1)
      if (boundary === "read") { await t.reply(0, "accepted"); await waitFor(() => t.requests.length === 2) }
      t.requests.at(-1)!.response.resolve(new Response("private upstream details", { status: 503 }))
      await waitFor(() => t.store.collections.toasts.get("toast-account.permissions")?.status === "failed")
      await waitFor(() => t.card()?.payload.refresh?.state === "failed")
      expect(JSON.stringify(t.card())).not.toContain("private")
      expect(t.requests).toHaveLength(boundary === "dispatch" ? 1 : 2)
      const requestId = t.card()!.payload.refresh!.id
      const index = t.requests.length
      await t.account.showAccount(); await waitFor(() => t.requests.length > index)
      if (boundary === "dispatch") expect(t.requests[index]!.body.payload?.requestId).toBe(requestId)
      else expect(t.requests[index]!.body.payload?.requestId).not.toBe(requestId)
      expect(t.requests[index]!.body.procedure).toBe("Operation.Dispatch")
      await t.reply(index, "accepted"); await t.reply(index + 1)
      await waitFor(() => t.card()?.payload.refresh?.state === "complete")
    } finally { await t.dispose() }
  })
}

for (const stage of ["requested", "complete"] as const) {
  test(`Account waits for the ${stage} card receipt before acknowledging or finishing`, async () => {
    const t = await fixture(), saved = Promise.withResolvers<void>(), dispatch = t.store.dispatch
    let held = false
    Object.assign(t.store, { dispatch: (event: Parameters<typeof dispatch>[0]) => {
      const write = dispatch(event)
      if (event.type === "card.upsert" && event.card.kind === "account" && event.card.payload.refresh?.state === stage && (stage === "complete" || event.card.payload.refresh.operationId === undefined)) {
        held = true; return { ...write, isPersisted: { promise: write.isPersisted.promise.then(() => saved.promise) } }
      }
      return write
    } })
    try {
      let acknowledged = false
      const admission = t.account.showAccount().then(value => { acknowledged = true; return value })
      if (stage === "complete") { await admission; await t.reply(0, "accepted"); await t.reply(1) }
      await waitFor(() => held); await settle()
      if (stage === "requested") { expect(acknowledged).toBe(false); expect(t.requests).toHaveLength(0) }
      else { expect(t.requests).toHaveLength(2); expect(t.store.collections.toasts.get("toast-account.permissions")?.status).toBe("running") }
      saved.resolve(); expect(await admission).toEqual({ value: "Requested" })
      if (stage === "complete") await waitFor(() => t.store.collections.toasts.get("toast-account.permissions")?.status === "ok")
    } finally { saved.resolve(); Object.assign(t.store, { dispatch }); await t.dispose() }
  })
}

for (const ending of ["sign-out", "remove card"] as const) {
  test(`a stale server response after ${ending} cannot restore Account or show a failure`, async () => {
    const t = await fixture()
    try {
      await t.account.showAccount(); await waitFor(() => t.requests.length === 1)
      await t.store.dispatch(ending === "sign-out" ? { type: "identity.session.cleared", actor: "user" } : { type: "card.removed", actor: "user", id: "account" }).isPersisted.promise
      await t.reply(0, "accepted"); await settle(); await t.store.settled?.()
      expect(t.requests).toHaveLength(1); expect(t.card()).toBeUndefined()
      expect(t.store.collections.toasts.has("toast-account.permissions")).toBe(false)
    } finally { await t.dispose() }
  })
}

test("clearing Chat during admission suppresses dispatch and cannot acknowledge the removed card", async () => {
  const t = await fixture(), saved = Promise.withResolvers<void>(), dispatch = t.store.dispatch
  let held = false
  Object.assign(t.store, { dispatch: (event: Parameters<typeof dispatch>[0]) => {
    const write = dispatch(event)
    if (event.type === "card.upsert" && event.card.kind === "account") { held = true; return { ...write, isPersisted: { promise: write.isPersisted.promise.then(() => saved.promise) } } }
    return write
  } })
  try {
    const reading = t.account.showAccount(); await waitFor(() => held)
    await t.store.dispatch({ type: "conversation.cleared", actor: "user", branchId: "next-conversation", notes: [] }).isPersisted.promise
    saved.resolve(); expect(await reading).toEqual({ value: "Account request is no longer current." })
    expect(t.requests).toHaveLength(0); expect(t.card()).toBeUndefined()
  } finally { saved.resolve(); Object.assign(t.store, { dispatch }); await t.dispose() }
})

for (const stage of ["requested", "complete"] as const) {
  test(`refused ${stage} persistence keeps the job honest and permits a real retry`, async () => {
    const backing = memoryStorage()
    let armed = false, refused = 0
    const storage = { ...backing, setItem: (key: string, value: string) => {
      if (armed && key.endsWith(".staged")) {
        armed = false; refused++
        throw Object.assign(new Error("The quota has been exceeded."), { name: "QuotaExceededError", code: 22 })
      }
      backing.setItem(key, value)
    } }
    const t = await fixture(storage)
    try {
      if (stage === "requested") {
        armed = true; await expect(t.account.showAccount()).rejects.toThrow()
        expect(t.requests).toHaveLength(0); expect(t.card()).toBeUndefined()
      } else {
        await t.account.showAccount(); await t.reply(0, "accepted"); await waitFor(() => t.requests.length === 2)
        await t.store.settled?.(); armed = true; await t.reply(1)
        await waitFor(() => t.store.collections.toasts.get("toast-account.permissions")?.status === "failed")
        await waitFor(() => t.card()?.payload.refresh?.state === "failed")
        expect(t.requests).toHaveLength(2)
      }
      expect(refused).toBe(1)
      await t.account.showAccount()
      if (stage === "requested") { await t.reply(0, "accepted"); await t.reply(1) }
      else { await waitFor(() => t.requests.length === 3); expect(t.requests[2]!.body.procedure).toBe("Operation.Dispatch"); await t.reply(2, "accepted"); await t.reply(3) }
      await waitFor(() => t.card()?.payload.refresh?.state === "complete")
      await t.store.settled?.(); expect((await t.store.verifyState()).valid).toBe(true)
    } finally { armed = false; await t.dispose() }
  })
}

test("Chat clear permits a new request while stale server completion cannot finish it", async () => {
  const t = await fixture()
  try {
    await t.account.showAccount(); await t.reply(0, "accepted"); await waitFor(() => t.requests.length === 2)
    const previous = t.card()!.payload.refresh!.id
    await t.store.dispatch({ type: "conversation.cleared", actor: "user", branchId: "next-conversation", notes: [] }).isPersisted.promise
    expect(t.card()).toBeUndefined()
    expect(await t.account.showAccount()).toEqual({ value: "Requested" })
    await waitFor(() => t.requests.length === 3)
    const current = t.card()!.payload.refresh!.id
    expect(current).not.toBe(previous)
    await t.reply(1); await settle()
    expect(t.card()?.payload.refresh).toMatchObject({ id: current, state: "requested" })
    expect(t.requests).toHaveLength(3)
    await t.reply(2, "accepted"); await t.reply(3)
    await waitFor(() => t.card()?.payload.refresh?.state === "complete")
    expect(t.card()?.payload.refresh?.id).toBe(current)
  } finally { await t.dispose() }
})

for (const invalid of ["request", "operation"] as const) {
  test(`foreign ${invalid} receipt cannot complete the selected Account`, async () => {
    const t = await fixture()
    try {
      await t.account.showAccount(); await t.reply(0, "accepted"); await t.reply(1, "completed", invalid === "request" ? { requestId: "foreign" } : { operationId: "foreign" })
      await waitFor(() => t.store.collections.toasts.get("toast-account.permissions")?.status === "failed")
      await waitFor(() => t.card()?.payload.refresh?.state === "failed")
      expect(t.requests).toHaveLength(2)
    } finally { await t.dispose() }
  })
}

for (const stage of ["admission", "receipt", "completion"] as const) {
  test(`real HTTP Account cannot cross its held SQLite ${stage} COMMIT`, async () => {
    const directory = mkdtempSync(join(tmpdir(), "smithers-account-sqlite-")), path = join(directory, "app.sqlite")
    const database = new Database(path)
    database.query("PRAGMA journal_mode = WAL").run()
    const committed = new Database(path, { readonly: true })
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
    const calls: string[] = []
    let armed = false, matchingWrite = false, held = false
    let store: Awaited<ReturnType<typeof createAppStore>> | undefined
    let restored: Awaited<ReturnType<typeof createAppStore>> | undefined
    let ctx: ReturnType<typeof createControllerContext> | undefined
    let admission: Promise<unknown> | undefined
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
      expect(new URL(request.url).pathname).toBe("/api/workflow/rpc")
      const body = await request.json() as { procedure: string; payload: { name: string; requestId: string; input?: object } }
      expect(body.payload.name).toBe("account.show")
      calls.push(body.procedure)
      const common = { requestId: body.payload.requestId, operationId: `job-${body.payload.requestId}` }
      if (body.procedure === "Operation.Dispatch") {
        expect(body.payload.input).toEqual({})
        return Response.json({ ...common, kind: "requested", state: "accepted", acceptedAt: "2026-10-01T00:00:00Z" })
      }
      expect(body.procedure).toBe("Operation.Read")
      expect(body.payload).not.toHaveProperty("input")
      return Response.json({ ...common, actor: "api", state: "completed", result: { login: "owner" } })
    } })
    const open = async (connection: Database, hold: boolean) => {
      let ownsConnection = true
      try {
        const adapter = await openSqliteRowStorage({ execute: async <Row>(sql: string, params: ReadonlyArray<unknown> = []) => {
          if (hold && armed && /^\s*INSERT\b/i.test(sql) && params[0] === "app-cards" && typeof params[3] === "string") {
            const row = JSON.parse(params[3])
            const refresh = row.payload?.refresh
            if (row.id === "account" && refresh && (stage === "admission" ? refresh.operationId === undefined
              : stage === "receipt" ? refresh.state === "requested" && refresh.operationId !== undefined : refresh.state === "complete")) matchingWrite = true
          }
          if (hold && armed && matchingWrite && /^\s*COMMIT\b/i.test(sql)) {
            armed = false; held = true; entered.resolve(); await release.promise
          }
          const statement = connection.query(sql)
          if (/^\s*(SELECT|PRAGMA)/i.test(sql)) return statement.all(...params as []) as ReadonlyArray<Row>
          statement.run(...params as []); return []
        }, close: () => { ownsConnection = false; connection.close() } }, { collections: PERSISTED_COLLECTION_SPECS, schemaVersion: APP_SCHEMA_VERSION })
        return await createAppStore({ kind: "opfs", ...adapter, storageEventApi: { addEventListener: () => {}, removeEventListener: () => {} } })
      } catch (error) {
        if (ownsConnection) connection.close()
        throw error
      }
    }
    try {
      store = await open(database, true)
      await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "owner", provider: "local", admin: false, scopesPlain: null }).isPersisted.promise
      ctx = createControllerContext(store, unavailableAgent, { baseUrl: server.url.origin, toastDebounceMs: 1 })
      Object.assign(ctx, createFailureController(ctx))
      const account = createAccountController(ctx, { provider: "local", readsScopes: false, nextOrdinal: store.nextOrdinal, promptSignIn: () => {} })
      armed = true
      let acknowledged = false
      admission = account.showAccount().then(value => { acknowledged = true; return value })
      await entered.promise
      expect(held).toBe(true)
      const prior = committed.query("SELECT value FROM smithers_collection_rows WHERE collection_id = ? AND row_key = ?").get("app-cards", "s:account") as { value: string } | null
      if (stage === "admission") {
        expect(prior).toBeNull(); expect(acknowledged).toBe(false); expect(calls).toEqual([])
      } else {
        const card = JSON.parse(prior!.value)
        expect(card.payload.refresh.state).toBe("requested")
        if (stage === "receipt") { expect(card.payload.refresh.operationId).toBeUndefined(); expect(calls).toEqual(["Operation.Dispatch"]) }
        else { expect(card.payload.refresh.operationId).toBeString(); expect(calls).toEqual(["Operation.Dispatch", "Operation.Read"]) }
        expect(acknowledged).toBe(true)
        expect(store.collections.toasts.get("toast-account.permissions")?.status).not.toBe("ok")
      }
      release.resolve(); expect(await admission).toEqual({ value: "Requested" })
      await waitFor(() => store!.collections.toasts.get("toast-account.permissions")?.status === "ok")
      await store.settled?.()
      const persisted = committed.query("SELECT value FROM smithers_collection_rows WHERE collection_id = ? AND row_key = ?").get("app-cards", "s:account") as { value: string }
      const pointer = JSON.parse(persisted.value).payload.refresh
      expect(pointer).toMatchObject({ state: "complete", operationId: `job-${pointer.id}` })
      expect(calls).toEqual(["Operation.Dispatch", "Operation.Read"])
      await ctx.dispose(); await store.dispose?.(); store = undefined
      restored = await open(new Database(path), false)
      const row = restored.collections.cards.get("account")
      expect(row?.kind === "account" ? row.payload.refresh : undefined).toEqual(pointer)
      expect((await restored.verifyState()).valid).toBe(true)
    } finally {
      release.resolve()
      try { await ctx?.dispose(); await admission } finally {
        try { await restored?.dispose?.() } finally {
          try { await store?.dispose?.() } finally {
            try { await server.stop(true) } finally { try { committed.close() } finally { rmSync(directory, { recursive: true, force: true }) } }
          }
        }
      }
    }
  })
}

test("restored completed facts are cleared until the same canonical operation is re-observed", async () => {
  const storage = memoryStorage(), first = await fixture(storage)
  let restored: Awaited<ReturnType<typeof fixture>> | undefined
  try {
    await first.account.showAccount(); await first.reply(0, "accepted"); await first.reply(1)
    await waitFor(() => first.requests.length === 3)
    first.requests[2]!.response.resolve(Response.json({ scopes: [{ scope: "private-old", plain: "private-old" }] }))
    await waitFor(() => first.card()?.payload.scopes.length === 1)
    const pointer = first.card()!.payload.refresh!
    await first.store.settled?.(); await first.dispose(); restored = await fixture(storage)
    restored.account.resumeAccount(); await waitFor(() => restored!.requests.length === 1)
    expect(restored.requests[0]!.body).toEqual({ procedure: "Operation.Read", payload: { name: "account.show", requestId: pointer.id } })
    expect(restored.card()?.payload.scopes).toEqual([])
    expect(restored.card()?.payload.refresh).toMatchObject({ id: pointer.id, operationId: pointer.operationId, state: "requested" })
    await restored.reply(0)
    await waitFor(() => restored!.card()?.payload.refresh?.state === "complete")
    expect(JSON.stringify(restored.card())).not.toContain("private-old")
  } finally { try { await first.dispose() } finally { await restored?.dispose() } }
})

for (const boundary of ["dispatch", "read"] as const) {
  for (const change of ["owner", "provider", "sign-out", "dispose"] as const) {
    test(`${change} during server ${boundary} fences its completion and supplementary reads`, async () => {
      const t = await fixture()
      try {
        await t.account.showAccount(); await waitFor(() => t.requests.length === 1)
        if (boundary === "read") { await t.reply(0, "accepted"); await waitFor(() => t.requests.length === 2) }
        if (change === "owner" || change === "provider") await t.store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: change === "owner" ? "replacement" : "owner", provider: change === "provider" ? "local" : "github", admin: false, scopesPlain: null }).isPersisted.promise
        else if (change === "sign-out") await t.store.dispatch({ type: "identity.session.cleared", actor: "user" }).isPersisted.promise
        else await t.ctx.dispose()
        const stoppedToast = t.store.collections.toasts.get("toast-account.permissions")
        await t.reply(boundary === "dispatch" ? 0 : 1, boundary === "dispatch" ? "accepted" : "completed")
        await settle(); await t.store.settled?.()
        expect(t.requests).toHaveLength(boundary === "dispatch" ? 1 : 2)
        if (change !== "dispose") expect(t.card()).toBeUndefined()
        else expect(t.card()?.payload.refresh?.state).toBe("requested")
        if (change === "dispose") expect(t.store.collections.toasts.get("toast-account.permissions")).toEqual(stoppedToast)
        else expect(t.store.collections.toasts.has("toast-account.permissions")).toBe(false)
      } finally { await t.dispose() }
    })
  }
}
