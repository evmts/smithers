// The error codes log lines carry (worker/ErrorCode.ts): a code, never a message.
import { Data } from "effect"
import { SqlError } from "effect/sql"
import { describe, expect, test } from "vitest"
import { codeOf } from "./ErrorCode.ts"

class Tagged extends Data.TaggedError("SomethingFailed")<{ readonly message: string }> {}

describe("codeOf", () => {
  test("names a SQL failure by its reason", () => {
    const error = new SqlError.SqlError({ reason: new SqlError.ConnectionError({ cause: new Error("secret text") }) })
    expect(codeOf(error)).toBe("sql:ConnectionError")
  })

  test("names a tagged failure by its tag, never its message", () => {
    expect(codeOf(new Tagged({ message: "what someone wrote" }))).toBe("SomethingFailed")
  })

  test.each([new Error("what someone wrote"), "a string", null])("names anything else unknown: %s", (value) => {
    expect(codeOf(value)).toBe("unknown")
  })
})
