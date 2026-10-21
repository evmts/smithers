/**
 * `Action.once`: a write keyed by the execution and the dispatch, found by
 * that key before it is written, and found again when the write fails. The
 * provider here is a map behind an injected service; its faults are the
 * service's own (a lost answer: the write lands, then the call fails).
 * Crashes on a durable engine are proved in `@smthrs/engine-store`
 * (`test/Once.test.ts`).
 */
import { describe, expect, it } from "@effect/vitest"
import { Action, Flow, Interpreter } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Cause, Effect, Exit, Layer, Metric, Option, Schema, Tracer } from "effect"
import { effect } from "./Harness.ts"
import { layerWired } from "./MemoryFlowRuntime.ts"

class Refused extends Schema.TaggedError<Refused>()("Once/Refused", { reason: Schema.String }) {}

/** A provider that keeps what it was asked to make, by key, and can be told to fail. */
interface Provider {
  readonly made: Map<string, string>
  readonly calls: Array<string>
  /** A fault applies to the `nth` call of its kind (1-based), or to the next one when `nth` is absent. */
  readonly faults: Array<{ readonly on: "find" | "perform"; readonly landed?: boolean; readonly nth?: number }>
}

const provider = (): Provider => ({ made: new Map(), calls: [], faults: [] })

const takeFault = (p: Provider, on: "find" | "perform") => {
  const nth = p.calls.filter((call) => call === on).length
  const index = p.faults.findIndex((fault) => fault.on === on && (fault.nth === undefined || fault.nth === nth))
  return index === -1 ? undefined : p.faults.splice(index, 1)[0]
}

const write = (p: Provider, text: string): Action.Keyed<string, Refused> =>
  Action.keyed({
    find: (key) =>
      Effect.suspend(() => {
        p.calls.push("find")
        if (takeFault(p, "find") !== undefined) return Effect.fail(new Refused({ reason: "lookup" }))
        return Effect.succeed(Option.fromUndefinedOr(p.made.get(key)))
      }),
    perform: (key) =>
      Effect.suspend(() => {
        p.calls.push("perform")
        const fault = takeFault(p, "perform")
        if (fault?.landed === true) p.made.set(key, text)
        if (fault !== undefined) return Effect.fail(new Refused({ reason: "lost" }))
        p.made.set(key, text)
        return Effect.succeed(text)
      })
  })

/** One step that writes `text` under each of `names`, answering what each write settled to. */
const Write = Action.make("Once/Write", {
  payload: { names: Schema.Array(Schema.String), text: Schema.String },
  success: Schema.Array(Schema.String),
  error: Refused,
  tier: "irreversible",
  idempotencyKey: "once"
})

/**
 * The step: each name's write through `once`, the whole body tried up to three times in one dispatch, as a retried
 * attempt runs it again. Every attempt reads the same dispatch key.
 */
const implement = (p: Provider, keys: Array<string>) =>
  Write.toLayer(({ names, text }) =>
    Action.retry(
      Effect.forEach(names, (name) =>
        Effect.gen(function*() {
          keys.push(yield* Action.effectKey(name))
          return yield* Action.once(name, write(p, text))
        })),
      { times: 2 }
    )
  )

const Writer = Flow.make("Once/Writer", {
  payload: { names: Schema.Array(Schema.String), text: Schema.String },
  success: Schema.Array(Schema.String),
  error: Refused,
  body: (payload) => Write.call(payload)
})

const Twice = Flow.make("Once/Twice", {
  payload: { text: Schema.String },
  success: Schema.Array(Schema.String),
  error: Refused,
  body: ({ text }) =>
    Write.call({ names: ["a"], text }).pipe(Node.andThen(Write.call({ names: ["a"], text: `${text}!` })))
})

const wired = (p: Provider, keys: Array<string>) =>
  layerWired(Layer.mergeAll(
    implement(p, keys),
    Interpreter.layer(Writer),
    Interpreter.layer(Twice)
  ))

const outcome = (registry: Metric.MetricRegistry, value: Action.EffectOutcome) =>
  Effect.map(
    Metric.value(Metric.withAttributes(Action.effects, { outcome: value })),
    (state) => state.count
  ).pipe(Effect.provideService(Metric.MetricRegistry, registry))

describe("Action.effectKey", () => {
  effect("is 64 hex, one per execution, dispatch and name, the same on every attempt", () =>
    Effect.gen(function*() {
      const p = provider()
      const keys: Array<string> = []
      // The first attempt's write lands and its answer is lost; the retry derives the same key and finds it.
      p.faults.push({ on: "perform", landed: true }, { on: "find", nth: 2 })
      const first = yield* Writer.execute({ names: ["a", "b"], text: "hello" }, { executionId: "e1" }).pipe(
        Effect.provide(wired(p, keys))
      )
      expect(first).toEqual(["hello", "hello"])
      expect(keys.every((key) => /^[0-9a-f]{64}$/.test(key))).toBe(true)
      // Attempt 1: a (lost, lookup failed), so the attempt failed; attempt 2: a again, then b.
      expect(keys).toHaveLength(3)
      expect(keys[0]).toBe(keys[1])
      expect(keys[2]).not.toBe(keys[0])
      expect(p.made.size).toBe(2)

      const other: Array<string> = []
      yield* Writer.execute({ names: ["a", "b"], text: "hello" }, { executionId: "e2" }).pipe(
        Effect.provide(wired(provider(), other))
      )
      expect(other).toHaveLength(2)
      expect(other).not.toContain(keys[0])
      expect(other).not.toContain(keys[2])

      // Two dispatches of one action in one execution: two keys for one name.
      const twice: Array<string> = []
      yield* Twice.execute({ text: "x" }, { executionId: "e3" }).pipe(Effect.provide(wired(provider(), twice)))
      expect(twice).toHaveLength(2)
      expect(twice[0]).not.toBe(twice[1])
    }))

  it.effect("dies outside a flow execution", () =>
    Effect.gen(function*() {
      const exit = yield* Effect.exit(
        Action.effectKey("a").pipe(Effect.provideService(Action.CurrentInvocationKey, "k"))
      )
      expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toMatchObject({
        _tag: "@smthrs/flow/EffectKeyUnavailable",
        name: "a"
      })
    }))

  effect("dies in a dispatch the runtime does not name", () =>
    Effect.gen(function*() {
      const exit = yield* Effect.exit(
        Writer.execute({ names: ["a"], text: "x" }, { executionId: "e4" }).pipe(
          Effect.provide(layerWired(Layer.mergeAll(
            Write.toLayer(({ names, text }) =>
              Effect.forEach(names, (name) => Action.once(name, write(provider(), text))).pipe(
                Effect.provideService(Action.CurrentInvocationKey, undefined)
              )
            ),
            Interpreter.layer(Writer)
          )))
        )
      )
      expect(JSON.stringify(exit)).toContain("EffectKeyUnavailable")
    }))
})

describe("Action.once", () => {
  /** Runs `once` inside one dispatch of `Writer`, against `p`. */
  const run = (p: Provider, text = "made") =>
    Effect.gen(function*() {
      const registry: Metric.MetricRegistry = new Map()
      const spans: Array<Tracer.NativeSpan> = []
      const exit = yield* Effect.exit(
        Writer.execute({ names: ["w"], text }, { executionId: `run-${crypto.randomUUID()}` }).pipe(
          Effect.provide(layerWired(Layer.mergeAll(
            implement(p, []),
            Interpreter.layer(Writer)
          ))),
          Effect.provideService(Metric.MetricRegistry, registry),
          Effect.provideService(
            Tracer.Tracer,
            Tracer.make({
              span(options) {
                const span = new Tracer.NativeSpan(options)
                spans.push(span)
                return span
              }
            })
          )
        )
      )
      const counts = {
        performed: yield* outcome(registry, "performed"),
        adopted: yield* outcome(registry, "adopted"),
        adopted_after_failure: yield* outcome(registry, "adopted_after_failure"),
        failed: yield* outcome(registry, "failed")
      }
      const once = spans.filter((span) => span.name === "Action.once")
      return { exit, counts, once }
    })

  effect(
    "writes when nothing was made, and labels the span with the name and outcome, never the key",
    () =>
      Effect.gen(function*() {
        const p = provider()
        const { counts, exit, once } = yield* run(p)
        expect(exit).toEqual(Exit.succeed(["made"]))
        expect(p.calls).toEqual(["find", "perform"])
        expect(counts).toEqual({ performed: 1, adopted: 0, adopted_after_failure: 0, failed: 0 })
        expect(once).toHaveLength(1)
        expect(Object.fromEntries(once[0]!.attributes)).toEqual({
          "smithers.effect.name": "w",
          "smithers.effect.outcome": "performed"
        })
        const [key] = [...p.made.keys()]
        expect(JSON.stringify([...once[0]!.attributes])).not.toContain(key!)
      })
  )

  effect("adopts what an earlier attempt made, without writing", () =>
    Effect.gen(function*() {
      const p = provider()
      // Attempt 1: find (none), perform (lands, answer lost), find (fails): the attempt fails. Attempt 2: find: adopted.
      p.faults.push({ on: "perform", landed: true }, { on: "find", nth: 2 })
      const { counts, exit } = yield* run(p)
      expect(exit).toEqual(Exit.succeed(["made"]))
      expect(p.calls).toEqual(["find", "perform", "find", "find"])
      expect(p.made.size).toBe(1)
      expect(counts).toEqual({ performed: 0, adopted: 1, adopted_after_failure: 0, failed: 1 })
    }))

  effect("adopts a write whose answer was lost, found by a second lookup", () =>
    Effect.gen(function*() {
      const p = provider()
      p.faults.push({ on: "perform", landed: true })
      const { counts, exit } = yield* run(p)
      expect(exit).toEqual(Exit.succeed(["made"]))
      expect(p.calls).toEqual(["find", "perform", "find"])
      expect(p.made.size).toBe(1)
      expect(counts).toEqual({ performed: 0, adopted: 0, adopted_after_failure: 1, failed: 0 })
    }))

  effect("fails with the write's own failure when nothing landed", () =>
    Effect.gen(function*() {
      const p = provider()
      p.faults.push({ on: "perform" }, { on: "perform" }, { on: "perform" })
      const { counts, exit } = yield* run(p)
      expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toMatchObject({ reason: "lost" })
      expect(p.made.size).toBe(0)
      // Three attempts, each: find, perform, find.
      expect(p.calls).toEqual(Array.from({ length: 3 }, () => ["find", "perform", "find"]).flat())
      expect(counts.failed).toBe(3)
    }))

  effect("never writes when the first lookup cannot tell", () =>
    Effect.gen(function*() {
      const p = provider()
      p.faults.push({ on: "find" }, { on: "find" }, { on: "find" })
      const { counts, exit } = yield* run(p)
      expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toMatchObject({ reason: "lookup" })
      expect(p.calls).toEqual(["find", "find", "find"])
      expect(counts).toEqual({ performed: 0, adopted: 0, adopted_after_failure: 0, failed: 0 })
    }))
})
