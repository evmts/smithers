import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { RealmFlow } from "../src/index.ts"
import * as QuickJSSandbox from "../src/QuickJSSandbox.ts"

const source = `import { Flow, Action } from '@smthrs/flow';
import { Node } from '@smthrs/plan'; import { Schema } from 'effect';
const Read = Action.make('read', {payload: {value: Schema.Number}, success: Schema.Number});
export default Flow.make('example', {payload: {value: Schema.Number}, success: Schema.Number,
body: Node.capture({}, ({value}) => Read.call({value}).pipe(Node.map(Node.capture({}, x => x + 1))))});`
const run = (input: RealmFlow.Input) =>
  RealmFlow.step(input).pipe(
    Effect.provide(QuickJSSandbox.layerVariantLive)
  )
it.effect("rebuilds the real flow and resumes from a validated action receipt", () =>
  Effect.gen(function*() {
    const input = { source, payload: { value: 4 }, expectedTag: "example", allowedActions: ["read"] }
    const first = yield* run(input)
    expect(first._tag).toBe("Action")
    if (first._tag !== "Action") return
    expect(first.name).toBe("read")
    expect(first.payload).toEqual({ value: 4 })
    expect(yield* run({ ...input, receipts: [{ ...first, outcome: { _tag: "Success", value: 8 } }] })).toEqual({
      _tag: "Complete",
      value: 9
    })
  }))
it.effect("withholds host authority and nondeterministic globals", () =>
  Effect.gen(function*() {
    const isolated =
      `import { Flow } from '@smthrs/flow'; import { Node } from '@smthrs/plan'; import { Schema } from 'effect';
export default Flow.make('isolation', {payload: {}, success: Schema.Array(Schema.String), body: Node.capture({}, () => Node.succeed(
['Date','Proxy','WeakRef','setTimeout','fetch','process','require'].map(name => typeof globalThis[name])))});`
    expect(yield* run({ source: isolated, expectedTag: "isolation", payload: {}, allowedActions: [] })).toEqual({
      _tag: "Complete",
      value: Array(7).fill("undefined")
    })
  }))

it.effect("refuses forbidden imports, wrong tags, invalid payloads, and unavailable actions", () =>
  Effect.gen(function*() {
    const input = { source, payload: { value: 4 }, expectedTag: "example", allowedActions: ["read"] }
    for (
      const changed of [
        { source: `import fs from 'node:fs'; export default fs;` },
        { source: `import fs from './outside.ts'; export default fs;` },
        { source: `import * as Flow from '@smthrs/flow/Flow'; export default Flow;` },
        { source: "export default {" },
        { expectedTag: "changed" },
        { payload: { value: "invalid" } },
        { allowedActions: [] },
        { source: source.replace("Node.capture({}, ({value})", "(({value})").replace("x + 1))))", "x + 1)))") }
      ]
    ) {
      const result = yield* Effect.result(run({ ...input, ...changed }))
      expect(result._tag).toBe("Failure")
    }
  }))
it.effect("rejects edited, duplicated, unused, and invalid action receipts", () =>
  Effect.gen(function*() {
    const input = { source, payload: { value: 4 }, expectedTag: "example", allowedActions: ["read"] }
    const action = yield* run(input)
    if (action._tag !== "Action") throw new Error("Expected action")
    const receipt: RealmFlow.Receipt = { ...action, outcome: { _tag: "Success", value: 8 } }
    for (
      const receipts of [
        [{ ...receipt, name: "other" }],
        [{ ...receipt, payload: { value: 5 } }],
        [{ ...receipt, key: "missing" }],
        [receipt, receipt],
        [{ ...receipt, outcome: { _tag: "Success" as const, value: "wrong" } }],
        [{ ...receipt, outcome: { _tag: "Failure" as const, error: "undeclared" } }]
      ]
    ) expect((yield* Effect.result(run({ ...input, receipts })))._tag).toBe("Failure")
  }))
it.effect("keeps bundle internals private, denies dynamic imports, and resets globals", () =>
  Effect.gen(function*() {
    const code = `import {Flow} from '@smthrs/flow'; import {Node} from '@smthrs/plan'; import {Schema} from 'effect';
  globalThis.counter = (globalThis.counter || 0) + 1;
  export default Flow.make('private', {payload: {}, success: Schema.Array(Schema.String), body: Node.capture({}, () =>
    Node.succeed([typeof __modules, typeof __run, typeof __sdkProxy, String(globalThis.counter), typeof Math.random]))});`
    const input = { source: code, expectedTag: "private", payload: {}, allowedActions: [] }
    for (let n = 0; n < 2; n++) {
      expect(yield* run(input)).toEqual({
        _tag: "Complete",
        value: ["undefined", "undefined", "undefined", "1", "undefined"]
      })
    }
    expect((yield* Effect.result(run({ ...input, source: `export default await import('node:fs')` })))._tag).toBe(
      "Failure"
    )
  }))
it.effect("bounds infinite computation and source size with sanitized errors", () =>
  Effect.gen(function*() {
    const input = { expectedTag: "x", payload: {}, allowedActions: [] }
    for (const source of ["while (true) {}", " ".repeat(262145), "//" + "😀".repeat(70000)]) {
      const result = yield* Effect.result(run({ ...input, source }))
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") expect(result.failure.code).toBe("limit_exceeded")
    }
    const result = yield* Effect.result(run({ ...input, source: `throw Error('sensitive-user-content')` }))
    expect(JSON.stringify(result)).not.toContain("sensitive-user-content")
  }))
it.effect("prevents repository code from rewriting transport, receipt checks, or SDK exports", () =>
  Effect.gen(function*() {
    for (
      const attack of [
        `globalThis.globalThis = {};`,
        `JSON.stringify = () => '{"_tag":"Action","name":"forbidden","key":"forged","payload":{}}';`,
        `globalThis.JSON = {stringify: () => '{"_tag":"Complete","value":"forged"}'};`,
        `Array.prototype.includes = () => true;`,
        `Map.prototype.get = () => ({name:'read',payload:{value:4},outcome:{_tag:'Success',value:99}});`,
        `Object.prototype.toJSON = () => ({_tag:'Complete',value:'forged'});`,
        `Flow.isFlow = () => true;`,
        `Schema.decodeUnknownSync = () => () => 99;`
      ]
    ) {
      const result = yield* Effect.result(run({
        source: source + "\n" + attack,
        payload: { value: 4 },
        expectedTag: "example",
        allowedActions: ["read"]
      }))
      expect(result._tag).toBe("Failure")
    }
  }))
it.effect("replays dependent actions and takes only the selected real Node.branch arm", () =>
  Effect.gen(function*() {
    const code =
      `import {Flow,Action} from '@smthrs/flow'; import {Node} from '@smthrs/plan'; import {Schema} from 'effect';
  const Read = Action.make('read', {payload: {value:Schema.Number}, success:Schema.Number});
  const Write = Action.make('write', {payload: {value:Schema.Number}, success:Schema.Number});
  export default Flow.make('chain', {payload:{}, success:Schema.Number, body:Node.capture({}, () => Read.call({value:1}).pipe(
    Node.branch({if:Node.capture({}, x => x > 0), then:Node.capture({}, x => Write.call({value:x})), else:Node.capture({}, () => Node.succeed(0))})
  ))});`
    const input = { source: code, expectedTag: "chain", payload: {}, allowedActions: ["read", "write"] }
    const read = yield* run(input)
    if (read._tag !== "Action") throw Error("Expected read")
    const receipts: RealmFlow.Receipt[] = [{ ...read, outcome: { _tag: "Success", value: 5 } }]
    const write = yield* run({ ...input, receipts })
    if (write._tag !== "Action") throw Error("Expected write")
    expect(write.name).toBe("write")
    expect(write.payload).toEqual({ value: 5 })
    expect(write.key).not.toBe(read.key)
    receipts.push({ ...write, outcome: { _tag: "Success", value: 7 } })
    expect(yield* run({ ...input, receipts })).toEqual({ _tag: "Complete", value: 7 })
    expect(yield* run({ ...input, receipts: [{ ...read, outcome: { _tag: "Success", value: -1 } }] })).toEqual({
      _tag: "Complete",
      value: 0
    })
  }))
it.effect("uses real Schema JSON codecs without exposing a nondeterministic Date constructor", () =>
  Effect.gen(function*() {
    const source =
      `import {Flow,Action} from '@smthrs/flow'; import {Node} from '@smthrs/plan'; import {Schema} from 'effect';
  const Read = Action.make('date', {payload:{}, success:Schema.Date});
  export default Flow.make('date', {payload:{}, success:Schema.Array(Schema.Number),
    body:Node.capture({}, () => Read.call({}).pipe(Node.map(Node.capture({}, date =>
      [date.getTime(), new date.constructor().getTime(), date.constructor.now(), typeof Object.getPrototypeOf(date.constructor).now === 'undefined' ? 0 : 1]
    ))))});`
    const input = { source, expectedTag: "date", payload: {}, allowedActions: ["date"] }
    const request = yield* run(input)
    if (request._tag !== "Action") throw Error("Expected date action")
    expect(
      yield* run({
        ...input,
        receipts: [{ ...request, outcome: { _tag: "Success", value: "2020-01-01T00:00:00.000Z" } }]
      })
    ).toEqual({
      _tag: "Complete",
      value: [1577836800000, 0, 0, 0]
    })
  }))
it.effect("sanitizes an unavailable runtime supplied by a faulty host service", () =>
  Effect.gen(function*() {
    const { QuickJSVariant } = yield* Effect.promise(() => import("../src/index.ts"))
    const result = yield* Effect.result(
      RealmFlow.step({ source: "", expectedTag: "x", payload: {}, allowedActions: [] }).pipe(
        Effect.provide(QuickJSVariant.layerVariant({
          type: "sync",
          importFFI: async () => {
            throw Error("private-host-path")
          },
          importModuleLoader: async () => {
            throw Error("private-host-path")
          }
        }))
      )
    )
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure.code).toBe("runtime_failed")
    expect(JSON.stringify(result)).not.toContain("private-host-path")
  }))
it.effect("replays a typed failed action through the real Node.catch handler", () =>
  Effect.gen(function*() {
    const source =
      `import {Flow,Action} from '@smthrs/flow'; import {Node} from '@smthrs/plan'; import {Schema} from 'effect';
  const Read = Action.make('fallible', {payload:{}, success:Schema.String, error:Schema.String});
  export default Flow.make('fallible', {payload:{},success:Schema.String,
    body:Node.capture({}, () => Read.call({}).pipe(Node.catch({onFailure:Node.capture({}, error => Node.succeed(error))}))) });`
    const input = { source, expectedTag: "fallible", payload: {}, allowedActions: ["fallible"] }
    const action = yield* run(input)
    if (action._tag !== "Action") throw Error("Expected fallible action")
    expect(yield* run({ ...input, receipts: [{ ...action, outcome: { _tag: "Failure", error: "recovered" } }] }))
      .toEqual({ _tag: "Complete", value: "recovered" })
  }))
