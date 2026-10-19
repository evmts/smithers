import * as DurableWriter from "@smthrs/database/DurableWriter"
import * as NodeDatabase from "@smthrs/database/node/NodeDatabase"
import * as Journal from "@smthrs/journal/Journal"
import * as Migrations from "@smthrs/journal/Migrations"
import * as SqlJournal from "@smthrs/journal/SqlJournal"
import { Effect, Layer } from "effect"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, expect, it } from "vitest"
import * as Mailbox from "../src/Mailbox.ts"

const directory = mkdtempSync(join(tmpdir(), "mailbox-"))
afterAll(() => rmSync(directory, { recursive: true, force: true }))
const over = (filename: string, principal: string | undefined) =>
  Mailbox.layer(principal).pipe(
    Layer.provideMerge(
      SqlJournal.layer({ capacity: 1024, overflow: "reject" }).pipe(Layer.provide(
        Layer.provideMerge(
          Migrations.layer,
          Layer.provideMerge(DurableWriter.layer(), NodeDatabase.layer({ filename }))
        )
      ))
    )
  )
const run = <A, E>(
  file: string,
  agent: string | undefined,
  f: (box: Mailbox.Service) => Effect.Effect<A, E, Journal.Journal>
) =>
  Effect.runPromise(
    Effect.gen(function*() {
      return yield* f(yield* Mailbox.Mailbox)
    }).pipe(
      Effect.provide(over(join(directory, file), agent)),
      Effect.scoped
    )
  )
const code = <A, E extends { code: string }, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.match({ onFailure: (error) => error.code, onSuccess: () => "success" }))

it("delivers a sent message to its addressee only", async () => {
  const sent = await run("delivery", "a", (box) => box.send({ to: "b", text: "hello" }))
  const batch = await run("delivery", "b", (box) => box.pull({}))
  expect(batch.messages).toEqual([expect.objectContaining({ from: "a", to: "b", id: sent.id, thread: sent.id })])
  expect(await run("delivery", "c", (box) => box.pull({}))).toEqual({ messages: [], receipt: null, more: false })
})
it("repeats a batch until ack", async () => {
  await run("ack", "a", (box) => box.send({ to: "b", text: "hello" }))
  const batch = await run("ack", "b", (box) => box.pull({}))
  expect(await run("ack", "b", (box) => box.pull({}))).toEqual(batch)
  expect(await run("ack", "b", (box) => box.ack({ receipt: batch.receipt! }))).toMatchObject({ duplicate: false })
  expect(await run("ack", "b", (box) => box.ack({ receipt: batch.receipt! }))).toMatchObject({ duplicate: true })
  expect(await run("ack", "b", (box) => box.pull({}))).toEqual({ messages: [], receipt: null, more: false })
  expect(await run("ack", "b", (box) => code(box.ack({ receipt: "unknown" })))).toBe("receipt_invalid")
})
it("refuses a from field and stamps the principal", async () => {
  expect(await run("from", "a", (box) => code(box.send({ to: "b", text: "hello", from: "ceo" } as never))))
    .toBe("message_invalid")
})
it("dedupes by key", async () => {
  const first = await run("key", "a", (box) => box.send({ to: "b", text: "hello", key: "retry" }))
  expect(await run("key", "a", (box) => box.send({ to: "b", text: "hello", key: "retry" })))
    .toEqual({ ...first, duplicate: true })
  expect(await run("key", "a", (box) => code(box.send({ to: "b", text: "changed", key: "retry" }))))
    .toBe("message_key_reused")
  const entries = await run("key", "a", () =>
    Effect.gen(function*() {
      const journal = yield* Journal.Journal
      return yield* journal.entries({ runId: "flows.messages" as never, limit: 100 })
    }))
  expect(entries.entries).toHaveLength(1)
  expect(entries.entries[0]?.eventType).toBe("flows/messages/Sent")
})
it("refuses secret-shaped text", async () => {
  expect(await run("secret", "a", (box) => code(box.send({ to: "b", text: "ghp_" + "a".repeat(36) }))))
    .toBe("message_secret_refused")
  expect((await run("secret", "b", (box) => box.pull({}))).messages).toEqual([])
  const journaled = await run("secret", "a", () =>
    Effect.gen(function*() {
      const journal = yield* Journal.Journal
      return yield* journal.entries({ runId: "flows.messages" as never, limit: 100 })
    }))
  expect(journaled.entries).toEqual([])
})
it("links replies", async () => {
  const root = await run("reply", "a", (box) => box.send({ to: "b", text: "ping" }))
  const reply = await run("reply", "b", (box) => box.send({ to: "a", text: "pong", re: root.id }))
  expect(reply.thread).toBe(root.id)
  expect(await run("reply", "b", (box) => code(box.send({ to: "a", text: "bad", re: "m-0000000000000000" }))))
    .toBe("message_invalid")
})
it("survives a restart", async () => {
  await run("restart", "a", (box) => box.send({ to: "b", text: "durable" }))
  const batch = await run("restart", "b", (box) => box.pull({}))
  expect(await run("restart", "b", (box) => box.pull({}))).toEqual(batch)
})
it("needs an agent", async () => {
  expect(await run("anonymous", undefined, (box) => code(box.send({ to: "b", text: "hello" })))).toBe("agent_unknown")
})

it("keeps new mail behind the outstanding batch and isolates receipts by reader", async () => {
  const first = await run("ordering", "a", (box) => box.send({ to: "b", text: "one" }))
  const batch = await run("ordering", "b", (box) => box.pull({ limit: 1 }))
  const next = await run("ordering", "a", (box) => box.send({ to: "b", text: "two" }))
  expect(next.seq).toBeGreaterThan(first.seq)
  expect(await run("ordering", "b", (box) => box.pull({ limit: 50 }))).toEqual(batch)
  expect(await run("ordering", "c", (box) => code(box.ack({ receipt: batch.receipt! })))).toBe("receipt_invalid")
  await run("ordering", "b", (box) => box.ack({ receipt: batch.receipt! }))
  expect((await run("ordering", "b", (box) => box.pull({}))).messages.map((message) => message.id)).toEqual([next.id])
})
it("bounds encoded batches and preserves all remaining messages", async () => {
  await run("size", "a", (box) =>
    Effect.gen(function*() {
      for (let i = 0; i < 8; i++) yield* box.send({ to: "b", text: "界".repeat(4000) })
    }))
  const batch = await run("size", "b", (box) => box.pull({ limit: 50 }))
  expect(batch.messages.length).toBeGreaterThan(0)
  expect(new TextEncoder().encode(JSON.stringify(batch)).length).toBeLessThanOrEqual(65536)
  expect(batch.more).toBe(true)
  await run("size", "b", (box) => box.ack({ receipt: batch.receipt! }))
  const rest = await run("size", "b", (box) => box.pull({ limit: 50 }))
  expect(batch.messages.length + rest.messages.length).toBe(8)
  expect(rest.more).toBe(false)
  expect(new Set([...batch.messages, ...rest.messages].map((message) => message.id)).size).toBe(8)
})
it("refuses invalid inputs without writing and allows newline data", async () => {
  const inputs = [
    { to: "b", text: "" },
    { to: "b", text: "x".repeat(4001) },
    { to: "b", text: "tab\there" },
    { to: "b", text: "bad\rline" },
    { to: "b", text: "nul\u0000" },
    { to: "b", text: "\ud800" },
    { to: "B", text: "hello" },
    { to: "b", text: "hello", kind: "Bad" },
    { to: "b", text: "hello", key: "bad/key" }
  ]
  for (const input of inputs) {
    expect(await run("invalid", "a", (box) => code(box.send(input)))).toBe("message_invalid")
  }
  for (const limit of [0, 51, 1.5]) {
    expect(await run("invalid", "b", (box) => code(box.pull({ limit })))).toBe("message_invalid")
  }
  expect(await run("invalid", "a", (box) => code(box.send({ to: "telegram:will", text: "hello" }))))
    .toBe("message_forbidden")
  expect((await run("invalid", "b", (box) => box.pull({}))).messages).toEqual([])
  await run("invalid", "a", (box) => box.send({ to: "b", text: "line\nline", kind: "fyi" }))
  expect((await run("invalid", "b", (box) => box.pull({}))).messages[0]).toMatchObject({
    text: "line\nline",
    kind: "fyi"
  })
})
it("namespaces keys by sender and admits unkeyed messages separately", async () => {
  const first = await run("namespaced", "a", (box) => box.send({ to: "c", text: "same", key: "retry" }))
  const other = await run("namespaced", "b", (box) => box.send({ to: "c", text: "same", key: "retry" }))
  expect(other.id).not.toBe(first.id)
  const unkeyed = await run("namespaced", "a", (box) => box.send({ to: "c", text: "same" }))
  expect((await run("namespaced", "a", (box) => box.send({ to: "c", text: "same" }))).id).not.toBe(unkeyed.id)
  expect((await run("namespaced", "c", (box) => box.pull({}))).messages).toHaveLength(4)
})
it("keeps the root across nested replies and refuses invalid principals on every operation", async () => {
  const root = await run("nested", "a", (box) => box.send({ to: "b", text: "root" }))
  const reply = await run("nested", "b", (box) => box.send({ to: "a", text: "reply", re: root.id }))
  expect((await run("nested", "a", (box) => box.send({ to: "b", text: "again", re: reply.id }))).thread).toBe(root.id)
  for (const principal of [undefined, "", "Bad", "bridge:telegram"]) {
    expect(await run("nested", principal, (box) => code(box.pull({})))).toBe("agent_unknown")
    expect(await run("nested", principal, (box) => code(box.ack({ receipt: "unknown" })))).toBe("agent_unknown")
  }
})

it("serializes independent writers and reader layers on one file", async () => {
  const input = { to: "b", text: "race", key: "one" }
  const sent = await Promise.all([
    run("concurrent", "a", (box) => box.send(input)),
    run("concurrent", "a", (box) => box.send(input))
  ])
  expect(sent[0]?.id).toBe(sent[1]?.id)
  expect(sent.map((value) => value.duplicate).sort()).toEqual([false, true])
  const batches = await Promise.all([
    run("concurrent", "b", (box) => box.pull({})),
    run("concurrent", "b", (box) => box.pull({}))
  ])
  expect(batches[0]).toEqual(batches[1])
  expect(batches[0]?.messages).toHaveLength(1)
})
