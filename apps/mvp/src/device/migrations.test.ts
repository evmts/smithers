import { Collection, Migrations } from "@smthrs/effect-tanstack-db"
import { Effect, Schema } from "effect"
import { describe, expect, test } from "vitest"
import { Asking, Message } from "../features/chat/schema"
import { Sending as IssueSending } from "../features/issues/schema"
import { View } from "../features/views/schema"
import {
  deviceFrom,
  type Fixture,
  keptRows,
  persistenceOn,
  plain,
  prepare,
  syncedCollection
} from "../test/deviceFixture"
import deployed from "./fixtures/7b96f878.json" with { type: "json" }
import currentDeployed from "./fixtures/c6940ac53e5a.json" with { type: "json" }
import {
  AuthConfirmedStore,
  ChatDraftsStore,
  ChatUnsentStore,
  deviceRegistry,
  IssueDraftsStore,
  IssueRequestedStore,
  MessagesStore,
  outboxUpgrade,
  PreferencesStore,
  ViewsStore
} from "./registry"

// Every migration, run against the device a deployed build left (decision 0021 §5): its fixture is written through
// TanStack DB's own persistence at that build's versions, brought forward as the leader's `device/prepare` does, and
// opened as this build opens it. A deploy adds its build's fixture beside this one.

const fixtures: ReadonlyArray<Fixture> = [deployed as Fixture, currentDeployed as Fixture]

/** The rows local store `store` opens with on the device at `path`, as this build opens it. */
const opened = <A extends object>(path: string, store: Migrations.Local<A, string>) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function*() {
        const collection = yield* Collection.persisted(store)
        yield* collection.restored
        return (yield* collection.toArray).map(plain)
      })
    ).pipe(Effect.provide(persistenceOn(path, deviceRegistry)))
  )

/** The rows synced store `store`'s collection `id` holds once the server's `rows` arrive. */
const synced = <A extends object>(path: string, store: Migrations.Synced<A>, id: string, rows: ReadonlyArray<A>) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function*() {
        const collection = yield* syncedCollection(id, store.schema, store.schemaVersion, rows, (row: any) => row.id)
        yield* collection.preload
        return (yield* collection.toArray).map(plain)
      })
    ).pipe(Effect.provide(persistenceOn(path, deviceRegistry)))
  )

const rowsOf = (fixture: Fixture, collection: string) => fixture.collections[collection]!.rows

test("the c6940ac53e5a fixture uses that deployed build's recorded schemas and valid rows", () => {
  for (const [id, collection] of Object.entries(currentDeployed.collections)) {
    const store = deviceRegistry.stores.find((entry) => entry.id === id.split(":")[0])
    if (store === undefined) throw new Error(`Missing fixture store ${id}`)
    const schema = store._tag === "Local" ? store.versions[collection.version - store.first]! : store.schema
    expect(Migrations.fingerprint(schema), id).toBe(
      currentDeployed.schemaFingerprints[id as keyof typeof currentDeployed.schemaFingerprints]
    )
    for (const row of collection.rows) expect(Schema.is(schema)(row), id).toBe(true)
  }
  for (const [key, fingerprint] of Object.entries(currentDeployed.payloadFingerprints)) {
    const payload = deviceRegistry.outbox.payloads.find((entry) => entry.key === key)!
    const schema = payload.versions[key === "issue-sending" ? 1 : 0]!
    expect(Migrations.fingerprint(schema), key).toBe(fingerprint)
  }
})

describe.each(fixtures)("the device build $build left", (fixture) => {
  test("is brought to this build's versions: local rows migrated, synced ones left to sync again, nothing kept aside", async () => {
    const { path } = await deviceFrom(fixture)
    const report = await prepare(path, deviceRegistry)
    const outcomes = Object.fromEntries(
      report.collections.map(({ collection, outcome, from, to, migrated, kept }) => [
        collection,
        `${outcome} ${from}→${to} migrated ${migrated} kept ${kept}`
      ])
    )
    const branch = Object.keys(fixture.collections).find((id) => id.startsWith("chat-messages:"))!
    const legacy = fixture.build === "7b96f878"
    expect(outcomes).toEqual({
      "auth-confirmed": "migrated 1→2 migrated 1 kept 0",
      "chat-drafts": "current 1→1 migrated 0 kept 0",
      "chat-messages": legacy ? "resync 2→3 migrated 0 kept 0" : "current 3→3 migrated 0 kept 0",
      [branch]: legacy ? "resync 2→3 migrated 0 kept 0" : "current 3→3 migrated 0 kept 0",
      "chat-unsent": "current 1→1 migrated 0 kept 0",
      flows: legacy ? "resync 1→2 migrated 0 kept 0" : "current 2→2 migrated 0 kept 0",
      "issue-drafts": "current 1→1 migrated 0 kept 0",
      "issue-items": legacy ? "resync 1→3 migrated 0 kept 0" : "current 3→3 migrated 0 kept 0",
      "issue-requested": legacy ? "migrated 1→2 migrated 2 kept 0" : "current 2→2 migrated 0 kept 0",
      preferences: "current 1→1 migrated 0 kept 0",
      "repo-repositories": legacy ? "resync 2→3 migrated 0 kept 0" : "current 3→3 migrated 0 kept 0",
      runs: "current 1→1 migrated 0 kept 0",
      views: legacy ? "resync 1→2 migrated 0 kept 0" : "current 2→2 migrated 0 kept 0"
    })
    expect(report.epoch).toBe(deviceRegistry.epoch)
    expect(await keptRows(path)).toEqual([])
  })

  test("keeps every local row, in this build's shapes, and opens each store at its declared version", async () => {
    const { path } = await deviceFrom(fixture)
    await prepare(path, deviceRegistry)
    const byId = (rows: ReadonlyArray<object>) => [...rows].sort((a: any, b: any) => (a.id < b.id ? -1 : 1))
    expect(byId(await opened(path, ChatUnsentStore))).toEqual(rowsOf(fixture, "chat-unsent"))
    expect(byId(await opened(path, ChatDraftsStore))).toEqual(byId(rowsOf(fixture, "chat-drafts")))
    expect(await opened(path, IssueDraftsStore)).toEqual(rowsOf(fixture, "issue-drafts"))
    const confirmed = await opened(path, AuthConfirmedStore)
    expect(confirmed).toEqual(rowsOf(fixture, "auth-confirmed"))
    expect(confirmed.every(Schema.is(AuthConfirmedStore.schema))).toBe(true)
    // A login-only legacy proof cannot acquire an invented stable person during migration.
    expect(confirmed[0]).not.toHaveProperty("personId")
    expect(await opened(path, PreferencesStore)).toEqual(rowsOf(fixture, "preferences"))
    // Who acted is no longer the row's to say; everything else is as it was.
    const requested = byId(await opened(path, IssueRequestedStore))
    expect(requested).toEqual(
      byId(rowsOf(fixture, "issue-requested")).map((row) => {
        const { via: _via, ...rest } = row as Record<string, unknown>
        return rest
      })
    )
    expect(requested.every(Schema.is(IssueRequestedStore.schema))).toBe(true)
  })

  test("syncs a changed collection afresh: the device holds what a new device would", async () => {
    const { path } = await deviceFrom(fixture)
    await prepare(path, deviceRegistry)
    const server: ReadonlyArray<typeof Message.Type> = [
      // Unchanged stores retain the cached user row; the complete server
      // snapshot includes it. The older schema still proves a fresh resync.
      ...(fixture.build === "7b96f878" ? [] : [rowsOf(fixture, "chat-messages")[0] as unknown as typeof Message.Type]),
      {
        ...(rowsOf(fixture, "chat-messages")[1] as unknown as typeof Message.Type),
        parts: [{ id: "part-1", kind: "step", flow: "repo/read", status: "done" }]
      }
    ]
    expect(await synced(path, MessagesStore, "chat-messages", server)).toEqual(server)
    const view: typeof View.Type = {
      ...(rowsOf(fixture, "views")[0] as unknown as typeof View.Type),
      props: { url: "https://effect.website", title: "Effect" }
    }
    expect(await synced(path, ViewsStore, "views", [view])).toEqual([view])
    const fresh = await deviceFrom({ ...fixture, collections: {}, outbox: {} })
    expect(await synced(fresh.path, MessagesStore, "chat-messages", server)).toEqual(server)
  })

  test("carries every pending write across: each one this build can send is upgraded, the rest parked", () => {
    const outcomes = Object.values(fixture.outbox).map((stored) => {
      const write = JSON.parse(stored)
      const upgraded = outboxUpgrade.write(stored)
      return { name: write.mutationFnName, via: write.mutations[0].modified.via, upgraded }
    })
    expect(outcomes.map(({ name, upgraded, via }) => [name, via ?? "-", upgraded._tag])).toEqual(
      fixture.build === "7b96f878" ?
        [
          ["ask", "-", "Upgraded"],
          ["issue-write", "person", "Upgraded"],
          ["issue-write", "agent", "Parked"]
        ] :
        [
          ["ask", "-", "Current"],
          ["issue-write", "-", "Upgraded"],
          ["issue-write", "-", "Upgraded"]
        ]
    )
    const [ask, person, agent] = outcomes.map(({ upgraded }) => upgraded)
    const valueOf = (upgraded: Migrations.UpgradedWrite, index: number) => {
      if (upgraded._tag === "Current") return Object.values(fixture.outbox)[index]!
      if (upgraded._tag === "Upgraded") return upgraded.value
      throw new Error(`Unexpected parked write at ${index}`)
    }
    const rowOf = (upgraded: Migrations.UpgradedWrite, index = 0) =>
      JSON.parse(valueOf(upgraded, index)).mutations[0].modified
    // A question is the same question, stamped; an issue write names nobody now.
    expect(Schema.is(Asking)(rowOf(ask!))).toBe(true)
    expect(JSON.parse(valueOf(ask!, 0)).metadata.versions).toEqual({ asking: 1 })
    expect(Schema.is(IssueSending)(rowOf(person!))).toBe(true)
    expect(rowOf(person!)).not.toHaveProperty("via")
    if (fixture.build === "7b96f878") {
      expect(agent).toEqual({ _tag: "Parked", reason: "agent_write" })
    } else {
      expect(Schema.is(IssueSending)(rowOf(agent!))).toBe(true)
      expect(rowOf(agent!)).toMatchObject({
        id: "c0ffee00-0000-4000-8000-000000000004",
        body: "Triaged by the agent.",
        credential: "fixture-expired-agent-credential",
        v: 3
      })
      expect(JSON.parse((agent as { readonly value: string }).value).metadata.versions).toEqual({ "issue-sending": 3 })
    }
  })
})
