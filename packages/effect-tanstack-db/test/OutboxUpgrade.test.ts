import { Schema } from "effect"
import { describe, expect, test } from "vitest"
import { Migrations } from "../src/index.ts"

// `Migrations.outbox`: a stored write, as @tanstack/offline-transactions serialized it, brought to this build's
// payload versions, or parked when this build can't send it as it was meant.

const AskV1 = Schema.Struct({ id: Schema.String, text: Schema.String, via: Schema.Literals(["person", "agent"]) })
const AskV2 = Schema.Struct({ id: Schema.String, text: Schema.String })
const AskV3 = Schema.Struct({ id: Schema.String, text: Schema.String, tags: Schema.Array(Schema.String) })
const toV2 = Migrations.step(
  AskV1,
  AskV2,
  ({ via, ...row }) => via === "agent" ? new Migrations.Unmigratable({ reason: "agent_write" }) : row
)
const toV3 = Migrations.step(AskV2, AskV3, (row) => ({ ...row, tags: [] }))

const asking = Migrations.payload({ key: "asking", versions: [AskV1, AskV2, AskV3], migrations: [toV2, toV3] })
const notes = Migrations.payload({ key: "notes", versions: [AskV2] })

const upgrade = Migrations.outbox(Migrations.registry({
  stores: [],
  outbox: {
    payloads: [asking, notes],
    mutations: ["ask", "note"],
    unstamped: { asking: 1, notes: 1 },
    renamed: { question: "ask" }
  }
}))

/** A write as the library stores it. */
const stored = (options: {
  readonly name?: string
  readonly mutations: ReadonlyArray<Record<string, unknown>>
  readonly versions?: Record<string, number>
}) =>
  JSON.stringify({
    id: "tx-1",
    mutationFnName: options.name ?? "ask",
    mutations: options.mutations,
    keys: ["asking/q1"],
    idempotencyKey: "q1",
    createdAt: "2026-10-20T00:00:00.000Z",
    retryCount: 0,
    nextAttemptAt: 0,
    metadata: { queuedAt: 1, ...(options.versions === undefined ? {} : { versions: options.versions }) },
    valueEncoding: 3
  })

const insert = (row: object, collectionId = "asking") => ({
  globalKey: `${collectionId}/q1`,
  type: "insert",
  modified: row,
  original: {},
  changes: row,
  collectionId
})

const parse = (result: Migrations.UpgradedWrite) => {
  expect(result._tag).toBe("Upgraded")
  return JSON.parse((result as { readonly value: string }).value)
}

describe("a stored write", () => {
  test("from before stamping is brought from the unstamped versions to this build's, and stamped", () => {
    const write = parse(upgrade.write(stored({ mutations: [insert({ id: "q1", text: "hi", via: "person" })] })))
    expect(write.mutations[0]).toMatchObject({
      modified: { id: "q1", text: "hi", tags: [] },
      original: {},
      changes: { id: "q1", text: "hi", tags: [] },
      collectionId: "asking"
    })
    expect(write.metadata).toEqual({ queuedAt: 1, versions: { asking: 3 } })
    expect(write.mutationFnName).toBe("ask")
    expect(write.idempotencyKey).toBe("q1")
  })

  test("stamped at this build's versions is current; an unstamped one already current is stamped", () => {
    expect(upgrade.write(stored({ mutations: [insert({ id: "q1", text: "hi" }, "notes")], versions: { notes: 1 } })))
      .toEqual({ _tag: "Current" })
    const stamped = parse(
      upgrade.write(stored({ name: "note", mutations: [insert({ id: "q1", text: "hi" }, "notes")] }))
    )
    expect(stamped.metadata.versions).toEqual({ notes: 1 })
    expect(stamped.mutations[0].modified).toEqual({ id: "q1", text: "hi" })
  })

  test("stamped at an older version is brought forward from it", () => {
    const write = parse(
      upgrade.write(stored({ mutations: [insert({ id: "q1", text: "hi" })], versions: { asking: 2 } }))
    )
    expect(write.mutations[0].modified).toEqual({ id: "q1", text: "hi", tags: [] })
  })

  test("an update brings its row before forward too, and keeps only the fields it changed", () => {
    const write = parse(upgrade.write(stored({
      mutations: [{
        type: "update",
        collectionId: "asking",
        modified: { id: "q1", text: "after", via: "person" },
        original: { id: "q1", text: "before", via: "person" },
        changes: { text: "after" }
      }]
    })))
    expect(write.mutations[0]).toMatchObject({
      modified: { id: "q1", text: "after", tags: [] },
      original: { id: "q1", text: "before", tags: [] },
      changes: { text: "after" }
    })
  })

  test("a delete keeps its changes as stored", () => {
    const write = parse(upgrade.write(stored({
      mutations: [{
        type: "delete",
        collectionId: "asking",
        modified: { id: "q1", text: "x", via: "person" },
        original: { id: "q1", text: "x", via: "person" },
        changes: { id: "q1" }
      }]
    })))
    expect(write.mutations[0].changes).toEqual({ id: "q1" })
  })

  test("a mutation renamed since takes its new name", () => {
    const write = parse(upgrade.write(stored({
      name: "question",
      mutations: [insert({ id: "q1", text: "hi", tags: [] })],
      versions: { asking: 3 }
    })))
    expect(write.mutationFnName).toBe("ask")
  })

  test("is parked when this build can't send it as it was meant, and why", () => {
    const reason = (text: string) => (upgrade.write(text) as { readonly reason?: string }).reason
    expect(reason("{not json")).toBe("unreadable")
    expect(reason("null")).toBe("unreadable")
    expect(reason(JSON.stringify({ mutationFnName: "ask" }))).toBe("unreadable")
    expect(reason(stored({ name: "gone", mutations: [] }))).toBe("mutation")
    expect(reason(stored({ mutations: [insert({ id: "q1" }, "elsewhere")] }))).toBe("collection")
    expect(reason(stored({ mutations: [insert({ id: "q1", text: "hi" })], versions: { asking: 4 } }))).toBe("newer")
    expect(reason(stored({ mutations: [insert({ id: "q1", text: "hi" })], versions: { notes: 1 } }))).toBe("unknown")
    expect(reason(stored({ mutations: [insert({ id: "q1", text: "hi" })], versions: { asking: 0 } }))).toBe("unknown")
    expect(reason(stored({ mutations: [insert({ id: "q1", text: "hi" })], versions: { asking: 1.5 } }))).toBe("unknown")
    expect(reason(stored({ mutations: [insert({ id: "q1", text: 3, via: "person" })] }))).toBe("decode")
    expect(reason(stored({ mutations: [insert({ id: "q1", text: "hi", via: "agent" })] }))).toBe("agent_write")
    expect(
      reason(stored({
        mutations: [{
          type: "update",
          collectionId: "asking",
          modified: { id: "q1", text: "hi", via: "person" },
          original: { id: "q1", text: "hi", via: "agent" },
          changes: {}
        }]
      }))
    ).toBe("agent_write")
  })

  test("is parked when a migration throws or answers a row this build's schema refuses", () => {
    const Throwing = Migrations.step(AskV1, AskV2, () => {
      throw new Error("boom")
    })
    const Invalid = Migrations.step(AskV1, AskV2, () => ({ id: 1 }) as never)
    const reasonWith = (step: Migrations.Step) =>
      (Migrations.outbox(Migrations.registry({
        stores: [],
        outbox: {
          payloads: [Migrations.payload({ key: "asking", versions: [AskV1, AskV2], migrations: [step] })],
          mutations: ["ask"],
          unstamped: { asking: 1 }
        }
      })).write(stored({ mutations: [insert({ id: "q1", text: "hi", via: "person" })] })) as {
        readonly reason: string
      })
        .reason
    expect(reasonWith(Throwing)).toBe("defect")
    expect(reasonWith(Invalid)).toBe("invalid")
  })

  test("with no unstamped versions declared, a write from before stamping is parked as unknown", () => {
    const strict = Migrations.outbox(
      Migrations.registry({ stores: [], outbox: { payloads: [notes], mutations: ["note"] } })
    )
    expect(strict.stamp).toEqual({ notes: 1 })
    expect(strict.write(stored({ name: "note", mutations: [insert({ id: "q1", text: "hi" }, "notes")] })))
      .toEqual({ _tag: "Parked", reason: "unknown" })
  })

  test("stamps every payload's version on new writes", () => {
    expect(upgrade.stamp).toEqual({ asking: 3, notes: 1 })
  })
})
