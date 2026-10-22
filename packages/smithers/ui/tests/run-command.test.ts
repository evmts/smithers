import { expect, test } from "bun:test"
import { Context, Effect } from "effect"
import { runSourceCommand } from "../src/run-command"

test.each([
  '{"name":"todo","input":{"text":"keep  spaces"}}',
  '{"cardId":"run-1","operation":"stop"}',
  '{"cardId":"run-1","operation":"retry"}',
  '{"operation":"stop-all"}',
  '{"name":"todo","sourceCard":"explicit"}'
])("a synchronous dispatch failure propagates without a second dispatch: %s", (args) => {
  const failure = new Error("dispatch failed")
  const seen: unknown[] = []
  const Dispatch = Context.Service<{
    readonly send: (name: string, args?: string) => Effect.Effect<void>
  }>("test/run-command/Dispatch")
  const send = runSourceCommand("origin", (name, args) => Effect.runSync(
    Effect.flatMap(Dispatch, service => service.send(name, args)).pipe(
      Effect.provideService(Dispatch, {
        send: (name, args) => Effect.sync(() => { seen.push([name, args]); throw failure })
      })
    )
  ))
  expect(() => send("flow.run", args)).toThrow("dispatch failed")
  const payload = JSON.parse(args)
  const expected = payload.operation === "stop" || payload.operation === "retry" || payload.sourceCard !== undefined
    ? args : JSON.stringify({ ...payload, sourceCard: "origin" })
  expect(seen).toEqual([["flow.run", expected]])
})

test("malformed and non-object JSON still reach the dispatcher once", () => {
  const seen: unknown[] = []
  const send = runSourceCommand("origin", (name, args) => { seen.push([name, args]) })
  for (const args of ['{broken', '{', '[]', 'null', 'plain']) send("flow.run", args)
  expect(seen).toEqual(['{broken', '{', '[]', 'null', 'plain'].map(args => ["flow.run", `sourceCard=origin ${args}`]))
})

test("lifecycle card controls keep their target while launch and stop-all retain their source", () => {
  const seen: unknown[] = []
  const send = runSourceCommand("origin", (name, args) => { seen.push([name, args]) })
  send("flow.run", '{"cardId":"run-1","operation":"stop"}')
  send("flow.run", '{"cardId":"request-1","operation":"retry"}')
  send("flow.run", '{"operation":"stop-all","repo":"owner/repo"}')
  send("flow.run", '{"name":"todo","input":{"text":"keep  spaces"}}')
  send("flow.run", '{"name":"todo","sourceCard":"explicit"}')
  expect(seen).toEqual([
    ["flow.run", '{"cardId":"run-1","operation":"stop"}'],
    ["flow.run", '{"cardId":"request-1","operation":"retry"}'],
    ["flow.run", '{"operation":"stop-all","repo":"owner/repo","sourceCard":"origin"}'],
    ["flow.run", '{"name":"todo","input":{"text":"keep  spaces"},"sourceCard":"origin"}'],
    ["flow.run", '{"name":"todo","sourceCard":"explicit"}']
  ])
})
