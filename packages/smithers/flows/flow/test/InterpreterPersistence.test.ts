import { expect, it } from "@effect/vitest"
import { Action, Flow, FlowRuntime, Interpreter } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Deferred, Effect, Exit, Layer, Schema } from "effect"
import { withCrypto } from "./Crypto.ts"
import { layerWired, makeInstance } from "./MemoryFlowRuntime.ts"

const Host = Flow.make("persistence/host", { payload: {}, body: () => Node.succeed(undefined) })
const Gate = Action.make("persistence/gate", { payload: {}, success: Schema.Number })
const Read = Action.make("persistence/read", { payload: { value: Schema.Number }, success: Schema.Number })
const turns = Effect.forEach(Array.from({ length: 30 }), () => Effect.yieldNow, { discard: true })

it.effect("does not expose success to a later consumer before settlement persistence fails", () =>
  Effect.gen(function*() {
    const recording = Deferred.makeUnsafe<void>()
    const consumed: Array<number> = []
    const instance = makeInstance(Host, "persistence")
    const body = Node.succeed(7).pipe(Node.bindPlanned((shared) =>
      Node.all({
        first: Read.call({ value: shared }),
        later: Gate.call({}).pipe(Node.andThen(Read.call({ value: shared })))
      })
    ))
    let blocked = false
    const exit = yield* withCrypto(
      Effect.exit(Interpreter.interpret(body)).pipe(
        Effect.updateService(FlowRuntime.FlowRuntime, (runtime) => ({
          ...runtime,
          recordNode: (record) => {
            if (record._tag === "NodeSettled" && record.value === 7 && !blocked) {
              blocked = true
              return Deferred.succeed(recording, undefined).pipe(
                Effect.andThen(turns),
                Effect.andThen(Effect.die("record failed"))
              )
            }
            return runtime.recordNode!(record)
          }
        })),
        Effect.provideService(FlowRuntime.FlowInstance, instance),
        Effect.provide(layerWired(Layer.mergeAll(
          Gate.toLayer(() => Deferred.await(recording).pipe(Effect.as(1))),
          Read.toLayer(({ value }) =>
            Effect.sync(() => {
              consumed.push(value)
              return value
            })
          )
        )))
      )
    )
    expect(Exit.isFailure(exit)).toBe(true)
    expect(blocked).toBe(true)
    expect(consumed).toEqual([])
  }))

it.effect("a join journal read preserves a waiting classification set by a concurrent sibling", () =>
  Effect.gen(function*() {
    const reading = Deferred.makeUnsafe<void>()
    const annotated = Deferred.makeUnsafe<void>()
    const instance = makeInstance(Host, "persistence")
    yield* withCrypto(
      Effect.exit(Interpreter.interpret(Node.all({
        join: Node.race({ value: Node.succeed(1) }),
        waiting: Gate.call({})
      }))).pipe(
        Effect.updateService(FlowRuntime.FlowRuntime, (runtime) => ({
          ...runtime,
          deferredResult: (deferred) =>
            Deferred.succeed(reading, undefined).pipe(
              Effect.andThen(Deferred.await(annotated)),
              Effect.andThen(runtime.deferredResult(deferred))
            )
        })),
        Effect.provideService(FlowRuntime.FlowInstance, instance),
        Effect.provide(layerWired(Gate.toLayer(() =>
          Deferred.await(reading).pipe(
            Effect.andThen(
              FlowRuntime.annotateWaiting({ reason: "approval", token: "sibling" }).pipe(
                Effect.provideService(FlowRuntime.FlowInstance, instance)
              )
            ),
            Effect.andThen(Deferred.succeed(annotated, undefined)),
            Effect.andThen(Effect.interrupt)
          )
        )))
      )
    )
    expect(instance.waiting).toEqual({ reason: "approval", token: "sibling" })
  }))

it.effect("a loser cannot open a child while the join decision is being persisted", () =>
  Effect.gen(function*() {
    const started = Deferred.makeUnsafe<void>()
    const release = Deferred.makeUnsafe<void>()
    const opened: Array<string> = []
    const Child = Flow.make("persistence/child", {
      payload: {},
      success: Schema.Number,
      body: () => Read.call({ value: 9 })
    })
    const body = Node.race({
      loser: Gate.call({}).pipe(Node.andThen(Child.child({}))),
      winner: Read.call({ value: 1 })
    })
    const result = yield* withCrypto(
      Interpreter.interpret(body).pipe(
        Effect.updateService(FlowRuntime.FlowRuntime, (runtime) => ({
          ...runtime,
          deferredDone: (deferred, options) =>
            Deferred.succeed(release, undefined).pipe(
              Effect.andThen(turns),
              Effect.andThen(runtime.deferredDone(deferred, options))
            )
        })),
        Effect.provideService(FlowRuntime.FlowInstance, makeInstance(Host, "persistence")),
        Effect.provide(layerWired(Layer.mergeAll(
          Interpreter.layer(Child),
          Gate.toLayer(() =>
            Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(release)), Effect.as(0))
          ),
          Read.toLayer(({ value }) =>
            value === 1
              ? Deferred.await(started).pipe(Effect.as(1))
              : Effect.sync(() => {
                opened.push("child")
                return value
              })
          )
        )))
      )
    )
    expect(result.value).toBe(1)
    expect(opened).toEqual([])
  }))
