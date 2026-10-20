import { describe, expect, it } from "@effect/vitest"
import { RetryPolicy } from "@smthrs/flow"
import { Cause, Context, Effect } from "effect"

class FaultSource extends Context.Service<FaultSource, { readonly failure: unknown }>()("FailureType/FaultSource") {}

const classify = Effect.gen(function*() {
  const source = yield* FaultSource
  return yield* Effect.fail(source.failure).pipe(
    Effect.catchCause((cause) => Effect.succeed(RetryPolicy.failureType(cause)))
  )
})

describe("failureType", () => {
  it.effect("classifies injected failures by tag or name without their message", () =>
    Effect.gen(function*() {
      for (
        const [failure, expected] of [
          [{ _tag: "Refused", message: "private payload", code: "private code" }, "Refused"],
          [new TypeError("private payload"), "TypeError"],
          [{ name: "RemoteFailure", message: "private payload" }, "RemoteFailure"],
          ["private payload", "unknown"],
          [null, "unknown"]
        ] as const
      ) {
        expect(yield* classify.pipe(Effect.provideService(FaultSource, { failure }))).toBe(expected)
      }
    }))

  it("preserves squashed defect, interruption and empty cause names", () => {
    expect(RetryPolicy.failureType(Cause.die(new RangeError("private payload")))).toBe("RangeError")
    expect(RetryPolicy.failureType(Cause.interrupt())).toBe("Error")
    expect(RetryPolicy.failureType(Cause.empty)).toBe("Error")
  })

  it("does not invoke failure accessors or serialize the payload", () => {
    let reads = 0
    const failure = Object.defineProperties({}, {
      _tag: {
        get: () => {
          reads++
          throw new Error("private payload")
        }
      },
      name: {
        get: () => {
          reads++
          throw new Error("private payload")
        }
      },
      message: {
        get: () => {
          reads++
          throw new Error("private payload")
        }
      },
      toString: {
        value: () => {
          reads++
          throw new Error("private payload")
        }
      }
    })
    expect(RetryPolicy.failureType(Cause.fail(failure))).toBe("unknown")
    expect(reads).toBe(0)
  })
})
