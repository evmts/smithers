// Each person's user in a branch's machine (worker/branch/Users.ts).
import { describe, expect, test } from "vitest"
import { provisionArgv, userOf, WORKSPACE_GROUP } from "./Users.ts"

describe("userOf", () => {
  test("is a valid Linux user name, the same for the same person and different for another", () => {
    const user = userOf("12345")
    expect(user).toMatch(/^p[0-9a-f]{16}$/)
    expect(userOf("12345")).toBe(user)
    expect(userOf("12346")).not.toBe(user)
    expect(userOf("local-developer")).toMatch(/^p[0-9a-f]{16}$/)
  })
})

describe("provisionArgv", () => {
  test("makes the user in the workspace group unless it exists, with the name as an argument", () => {
    const [shell, flag, script, name, user] = provisionArgv("pabc")
    expect([shell, flag, name, user]).toEqual(["sh", "-c", "provision", "pabc"])
    expect(script).toContain(`--gid ${WORKSPACE_GROUP}`)
    expect(script).toContain('id -u "$1"')
    expect(script).not.toContain("pabc")
  })
})
