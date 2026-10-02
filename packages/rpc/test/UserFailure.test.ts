import { describe, expect, test } from "vitest"
import {
  failureDetail,
  presentUserFailure,
  UNKNOWN_FAILURE,
  USER_FAILURE_ACTIONS,
  type UserFailureCopy,
  type UserFailureRegistry
} from "../src/UserFailure.ts"

class Busy extends Error {
  readonly _tag = "Busy" as const
  readonly tab: string
  constructor(tab: string) {
    super(`internal lease ${tab} held; stack jargon`)
    this.tab = tab
  }
}
class Gone extends Error {
  readonly _tag = "Gone" as const
}
type Known = Busy | Gone

const registry: UserFailureRegistry<Known> = {
  Busy: (failure) => ({
    fault: "infra",
    sentence: `Busy in ${failure.tab === "a" ? "one" : "another"} tab.`,
    actions: ["use-here"]
  }),
  Gone: { fault: "user", sentence: "Sign in again.", actions: ["sign-in", "retry"] }
}

describe("presentUserFailure", () => {
  test("a registry must list every tag in the union and nothing else", () => {
    // @ts-expect-error Gone is missing, so the registry does not compile.
    const missing: UserFailureRegistry<Known> = { Busy: UNKNOWN_FAILURE }
    const extra: UserFailureRegistry<Known> = {
      Busy: UNKNOWN_FAILURE,
      Gone: UNKNOWN_FAILURE,
      // @ts-expect-error Stray is not a tag of the union.
      Stray: UNKNOWN_FAILURE
    }
    expect([missing, extra]).toHaveLength(2)
  })

  test("fixed and derived entries give their copy and keep the raw text as detail only", () => {
    const busy = presentUserFailure(registry, new Busy("b"))
    expect(busy).toMatchObject({ tag: "Busy", fault: "infra", sentence: "Busy in another tab.", actions: ["use-here"] })
    expect(busy.sentence).not.toContain("lease")
    expect(busy.detail).toContain("internal lease b held")
    expect(presentUserFailure(registry, new Gone("x"))).toMatchObject({
      tag: "Gone",
      fault: "user",
      actions: ["sign-in", "retry"]
    })
  })

  test("a tagged cause under an untagged wrapper still gets its own copy", () => {
    const wrapped = new Error("prepare runtime and persisted state: boom", {
      cause: new Error("x", { cause: new Gone("deep") })
    })
    const shown = presentUserFailure(registry, wrapped)
    expect(shown.tag).toBe("Gone")
    expect(shown.detail).toContain("prepare runtime")
    expect(shown.detail).toContain("Caused by")
  })

  for (
    const [name, value] of [
      ["Error", new Error("SECRET raw message")],
      ["string", "SECRET raw string"],
      ["object", { _tag: "NotRegistered", message: "SECRET tagged" }],
      ["prototype key", { _tag: "toString", message: "SECRET proto" }],
      ["number", 42],
      ["null", null],
      ["undefined", undefined]
    ] as const
  ) {
    test(`an unknown ${name} never shows its message and is reported once`, () => {
      const reported: Array<unknown> = []
      const shown = presentUserFailure(registry, value, { onUnknown: (error) => reported.push(error) })
      expect(shown.tag).toBeNull()
      expect(shown.sentence).toBe(UNKNOWN_FAILURE.sentence)
      expect(shown.actions).toEqual(["retry"])
      expect(shown.fault).toBe("bug")
      expect(shown.sentence).not.toContain("SECRET")
      expect(reported).toEqual([value])
    })
  }

  test("a surface's own unknown copy replaces the default, and a throwing reporter is contained", () => {
    const fallback: UserFailureCopy = {
      fault: "infra",
      sentence: "Could not start.",
      actions: ["retry", "reset-local-data"]
    }
    const shown = presentUserFailure(registry, new Error("x"), {
      unknown: fallback,
      onUnknown: () => {
        throw new Error("reporter down")
      }
    })
    expect(shown).toMatchObject({ tag: null, ...fallback })
  })

  test("a cause cycle stops", () => {
    const a = new Error("a") as Error & { cause?: unknown }
    const b = new Error("b", { cause: a })
    a.cause = b
    expect(presentUserFailure(registry, a).tag).toBeNull()
  })

  test("every action id is distinct", () => {
    expect(new Set(USER_FAILURE_ACTIONS).size).toBe(USER_FAILURE_ACTIONS.length)
  })
})

describe("failureDetail", () => {
  test("prints errors, strings, objects and unprintable values without throwing", () => {
    expect(failureDetail(new TypeError("bad"))).toContain("bad")
    expect(failureDetail("plain")).toBe("plain")
    expect(failureDetail({ a: 1 })).toBe("{\"a\":1}")
    expect(failureDetail(undefined)).toBe("undefined")
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(failureDetail(cyclic)).toBe("Unprintable error")
    const stackless = new Error("no stack")
    stackless.stack = ""
    expect(failureDetail(stackless)).toBe("Error: no stack")
  })
})

describe("serialized tagged diagnostic detail", () => {
  test("retains the complete own-data message verbatim, bypasses toJSON and omits unrelated metadata", () => {
    let calls = 0
    const message = `first line <script>alert("x")</script> & 'quoted'\nlast line`
    const error = {
      _tag: "AgentFailed",
      message,
      token: "omitted-private-field",
      toJSON: () => {
        calls++
        throw new Error("must not serialize")
      }
    }
    expect(failureDetail(error)).toBe(message)
    expect(calls).toBe(0)
    expect(failureDetail({ _tag: "", message: "" })).toBe("")
  })

  for (
    const [name, stack, expected] of [
      ["distinct", "trace line\nsecond trace", "message\ntrace line\nsecond trace"],
      ["same", "message", "message"],
      ["empty", "", "message"],
      ["non-string", 42, "message"]
    ] as const
  ) {
    test(`an own-data ${name} stack follows the message only when distinct and nonempty`, () => {
      expect(failureDetail({ _tag: "AgentFailed", message: "message", stack })).toBe(expected)
    })
  }

  test("never invokes recognized stack, cause, toJSON or unrelated getters", () => {
    const reads: string[] = []
    const error = { _tag: "AgentFailed", message: "owned diagnostic" }
    for (const field of ["stack", "cause", "toJSON", "privateMetadata"]) {
      Object.defineProperty(error, field, {
        enumerable: true,
        get: () => {
          reads.push(field)
          throw new Error("getter invoked")
        }
      })
    }
    expect(failureDetail(error)).toBe("owned diagnostic")
    expect(reads).toEqual([])
  })

  test("does not consume inherited optional metadata", () => {
    const prototype = { stack: "inherited trace", cause: "inherited cause" }
    const error = Object.assign(Object.create(prototype), { _tag: "AgentFailed", message: "own message" })
    expect(failureDetail(error)).toBe("own message")
  })

  test("appends defined own-data causes, including null, and ignores undefined", () => {
    expect(failureDetail({ _tag: "AgentFailed", message: "outer", cause: { _tag: "Cause", message: "inner" } })).toBe(
      "outer\nCaused by: inner"
    )
    expect(failureDetail({ _tag: "AgentFailed", message: "outer", cause: null })).toBe("outer\nCaused by: null")
    expect(failureDetail({ _tag: "AgentFailed", message: "outer", cause: undefined })).toBe("outer")
  })

  test("bounds serialized chains and cycles to eight messages", () => {
    let chain: unknown = { _tag: "Cause", message: "9" }
    for (let index = 8; index >= 0; index--) chain = { _tag: "Cause", message: String(index), cause: chain }
    expect(failureDetail(chain)).toBe(
      "0\nCaused by: 1\nCaused by: 2\nCaused by: 3\nCaused by: 4\nCaused by: 5\nCaused by: 6\nCaused by: 7"
    )
    const cycle: { _tag: string; message: string; cause?: unknown } = { _tag: "Cause", message: "cycle" }
    cycle.cause = cycle
    expect(failureDetail(cycle)).toBe(
      "cycle\nCaused by: cycle\nCaused by: cycle\nCaused by: cycle\nCaused by: cycle\nCaused by: cycle\nCaused by: cycle\nCaused by: cycle"
    )
    expect(failureDetail(chain, 7)).toBe("0")
  })

  test("preserves native Error and string rendering independently of serialized recognition", () => {
    const native = new Error("native", { cause: "native cause" })
    native.stack = "trace native"
    expect(failureDetail(native)).toBe("trace native\nCaused by: native cause")
    expect(failureDetail("plain\ntext")).toBe("plain\ntext")
  })

  test("preserves JSON fallback for arrays, malformed and inherited required fields", () => {
    const values = [
      [Object.assign([1, 2], { _tag: "AgentFailed", message: "array message" }), "[1,2]"],
      [{ _tag: "AgentFailed", message: 1 }, "{\"_tag\":\"AgentFailed\",\"message\":1}"],
      [{ _tag: 1, message: "text" }, "{\"_tag\":1,\"message\":\"text\"}"],
      [{ message: "plain JSON" }, "{\"message\":\"plain JSON\"}"],
      [Object.assign(Object.create({ _tag: "Inherited" }), { message: "own" }), "{\"message\":\"own\"}"],
      [Object.assign(Object.create({ message: "inherited" }), { _tag: "Own" }), "{\"_tag\":\"Own\"}"]
    ]
    for (const [value, expected] of values) expect(failureDetail(value)).toBe(expected)
    let reads = 0
    const accessor = { message: "own" }
    Object.defineProperty(accessor, "_tag", {
      enumerable: true,
      get: () => {
        reads++
        return "Accessor"
      }
    })
    expect(failureDetail(accessor)).toBe("{\"message\":\"own\",\"_tag\":\"Accessor\"}")
    expect(reads).toBe(1)
    let messageReads = 0
    const accessorMessage = { _tag: "Accessor" }
    Object.defineProperty(accessorMessage, "message", {
      enumerable: true,
      get: () => {
        messageReads++
        return "legacy getter"
      }
    })
    expect(failureDetail(accessorMessage)).toBe("{\"_tag\":\"Accessor\",\"message\":\"legacy getter\"}")
    expect(messageReads).toBe(1)
    expect(failureDetail({ toJSON: () => "legacy JSON" })).toBe("\"legacy JSON\"")
  })

  test("combines native and serialized causes without changing native stack text", () => {
    const native = new Error("native inner")
    native.stack = "native inner trace"
    expect(failureDetail({ _tag: "Serialized", message: "outer", cause: native })).toBe(
      "outer\nCaused by: native inner trace"
    )
    const outer = new Error("native outer", { cause: { _tag: "Serialized", message: "inner" } })
    outer.stack = "native outer trace"
    expect(failureDetail(outer)).toBe("native outer trace\nCaused by: inner")
  })

  test("known and unknown presenters keep their safe sentence separate from full serialized detail", () => {
    const known = presentUserFailure(registry, { _tag: "Gone", message: "private diagnostic\nsecond line" })
    expect(known.sentence).toBe("Sign in again.")
    expect(known.detail).toBe("private diagnostic\nsecond line")
    const reported: unknown[] = []
    const error = { _tag: "Unregistered", message: "private unknown diagnostic", token: "omit-me" }
    const unknown = presentUserFailure(registry, error, {
      onUnknown: (value) => {
        reported.push(value)
      }
    })
    expect(unknown.sentence).toBe("Something went wrong on our side. Not your fault.")
    expect(unknown.detail).toBe("private unknown diagnostic")
    expect(unknown.tag).toBeNull()
    expect(reported).toEqual([error])
    expect([known.sentence, unknown.sentence].join(" ")).not.toContain("private")
  })
})
