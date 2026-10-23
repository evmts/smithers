import { canonicalize } from "@smthrs/canonical"
import { digestSync } from "@smthrs/crypto"
import { Action, Flow, FlowRuntime, Interpreter } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Context, Crypto, Effect, Exit, Latch, Option, Schema, Scope } from "effect"

// This entry is bundled, never imported in the host. The SDK keeps its own
// deterministic intrinsics; repository code receives only public authoring APIs.
declare const __publish: (modules: unknown, run: (flow: unknown, input: any) => unknown) => void
const unavailable = () => {
  throw new Error("unsupported_runtime_operation")
}
const crypto = Crypto.make({
  randomBytes: unavailable,
  digest: (algorithm, bytes) =>
    algorithm === "SHA-256"
      ? Effect.sync(() => Uint8Array.from(digestSync(bytes).match(/../g)!, (h) => parseInt(h, 16)))
      : Effect.die("unsupported_digest")
})

const declarations = new Map<string, any>()
const actions = {
  ...Action,
  make: (...args: any[]) => {
    const declaration = (Action.make as any)(...args)
    if (declarations.has(declaration.name)) throw new Error("duplicate_action")
    declarations.set(declaration.name, declaration)
    return declaration
  }
}
__publish({
  "@smthrs/flow": { Flow, Action: actions },
  "@smthrs/plan": { Node },
  "effect": { Schema },
  "effect/Schema": Schema
}, (declaration: any, input: any) => {
  if (!Flow.isFlow(declaration) || declaration._tag !== input.expectedTag) throw new Error("invalid_flow")
  const decoded = Schema.decodeUnknownSync(Schema.toCodecJson(declaration.payloadSchema))(input.payload)
  const receipts = new Map(input.receipts.map((r: any) => [r.key, r]))
  if (receipts.size !== input.receipts.length) throw new Error("duplicate_receipt")
  const visited = new Set<string>()
  let request: unknown
  const table = Action.Implementations.of({
    add: unavailable,
    get: (name) =>
      Effect.succeed(
        input.allowedActions.includes(name) ?
          Option.some({
            name,
            implementationVersion: declarations.get(name)?.implementationVersion,
            action: (payload) =>
              Effect.gen(function*() {
                const key = yield* Action.DispatchSite
                const declaration = declarations.get(name)
                if (declaration === undefined) return yield* Effect.die("undeclared_action")
                const encoded = Schema.encodeSync(Schema.toCodecJson(declaration.payloadSchema))(payload)
                const receipt: any = receipts.get(key)
                if (receipt !== undefined) {
                  visited.add(key)
                  if (receipt.name !== name || canonicalize(receipt.payload) !== canonicalize(encoded)) {
                    return yield* Effect.die("receipt_changed")
                  }
                  if (receipt.outcome._tag === "Success") {
                    return Schema.decodeUnknownSync(Schema.toCodecJson(declaration.successSchema))(
                      receipt.outcome.value
                    )
                  }
                  return yield* Effect.fail(
                    Schema.decodeUnknownSync(Schema.toCodecJson(declaration.errorSchema))(receipt.outcome.error)
                  )
                }
                request ??= { _tag: "Action", key, name, payload: encoded }
                return yield* Effect.fail("action_requested")
              })
          }) :
          Option.none()
      )
  })
  let recordBytes = 0
  const runtime = FlowRuntime.FlowRuntime.of(
    new Proxy({}, {
      get: (_, key) => {
        if (key === "recordNode") {
          return (record: unknown) =>
            Effect.sync(() => {
              recordBytes += new TextEncoder().encode(JSON.stringify(record)).byteLength
              if (recordBytes > 262144) throw new Error("plan_limit")
            })
        }
        if (key === "nodeRecordBytes") return undefined
        return unavailable
      }
    }) as any
  )
  const instance = FlowRuntime.FlowInstance.of({
    executionId: "realm",
    lineageId: "realm",
    flow: declaration,
    scope: Scope.makeUnsafe(),
    suspended: false,
    interrupted: false,
    waiting: undefined,
    handoff: undefined,
    cause: undefined,
    actionState: {
      count: 0,
      latch: Latch.makeUnsafe(),
      nextOrdinal: unavailable,
      snapshots: new Map(),
      keylessInFlight: new Set()
    }
  })
  const exit = Effect.runSyncExit(
    Interpreter.interpret(declaration, decoded, { callbackIdentity: "stable" }).pipe(
      Effect.provideService(Action.Implementations, table),
      Effect.provideService(FlowRuntime.FlowRuntime, runtime),
      Effect.provideService(FlowRuntime.FlowInstance, instance),
      Effect.provideService(Crypto.Crypto, crypto)
    )
  )
  for (const key of receipts.keys()) if (!visited.has(key as string)) throw new Error("unused_receipt")
  if (request !== undefined) return request
  if (Exit.isFailure(exit)) throw new Error("interpretation_failed")
  const encoded = Schema.encodeSync(Schema.toCodecJson(declaration.successSchema))(exit.value.value)
  return { _tag: "Complete", value: encoded ?? null }
})
