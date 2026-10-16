import { describe, expect, it } from "vitest"
import { checkAPolicy } from "../examples/check-a-policy.ts"

describe("examples", () => {
  it("check-a-policy allows the read, denies the lockfile, and asks about the spawn", async () => {
    expect(await checkAPolicy()).toEqual({
      read: "allowed",
      lockfile: "permission_denied",
      spawn: "permission_required"
    })
  })
})
