import { describe, expect, it } from "vitest"
import { compareVersions, verifyHost } from "../examples/check-runtime.ts"

describe("examples/check-runtime", () => {
  it("compares versions and refuses an unsupported operator", () => {
    expect(compareVersions()).toEqual({
      atLeast: true,
      exact: true,
      below: false,
      caret: "unsupported_requirement"
    })
  })

  it("verifies a satisfying host and reports the refusal for an older one", async () => {
    expect(await verifyHost("26.10.0")).toBe("26.10.0")
    expect(await verifyHost("24.9.0")).toBe("unsatisfied")
  })
})
