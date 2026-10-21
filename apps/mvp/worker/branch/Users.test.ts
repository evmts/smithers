// Each person's user in a branch's machine (worker/branch/Users.ts).
import { describe, expect, test } from "vitest"
import { SANDBOX_USER } from "../../src/features/terminal/contract.ts"
import { envOf, idOf, PERSON_UID_BASE, provisionArgv, uidOf, userOf, WORKSPACE_GROUP } from "./Users.ts"

describe("userOf", () => {
  test("is a valid Linux user name, the same for the same person and different for another", () => {
    const user = userOf("12345")
    expect(user).toMatch(/^p[0-9a-f]{16}$/)
    expect(userOf("12345")).toBe(user)
    expect(userOf("12346")).not.toBe(user)
    expect(userOf("local-developer")).toMatch(/^p[0-9a-f]{16}$/)
  })
})

describe("idOf", () => {
  test("answers the numeric uid:gid a deployed container needs: root, the checkout's user, and each person's", () => {
    expect(idOf("root")).toBe("0:0")
    expect(idOf(SANDBOX_USER)).toBe("1000:2000")
    const user = userOf("12345")
    expect(idOf(user)).toBe(`${uidOf(user)}:2000`)
    // The person's uid comes from their name: the same on every machine, above every system and image user.
    expect(uidOf(user)).toBe(PERSON_UID_BASE + Math.floor(Number.parseInt(user.slice(1, 9), 16) / 4))
    expect(uidOf("p00000003aaaaaaaa")).toBe(PERSON_UID_BASE)
    expect(uidOf("pffffffff00000000")).toBe(PERSON_UID_BASE + 2 ** 30 - 1)
    expect(uidOf("pffffffff00000000")).toBeLessThan(2 ** 31)
    // 30 bits, not 24: names alike in their first 24 bits get different uids.
    expect(uidOf("p95d4362bd3cd4315")).not.toBe(uidOf("p95d4361a36944b76"))
    expect(idOf(userOf("12346"))).not.toBe(idOf(user))
  })

  test("answers nothing for any other name", () => {
    for (const name of ["smithers2", "p123", "pABCDEF0123456789", "nobody", "", "0:0"]) expect(idOf(name)).toBeUndefined()
  })
})

describe("envOf", () => {
  test("gives a command its home, its user and a UTF-8 locale, which exec doesn't", () => {
    expect(envOf("root")).toEqual({ HOME: "/root", USER: "root", LOGNAME: "root", LANG: "C.UTF-8" })
    expect(envOf("pabc")).toEqual({ HOME: "/home/pabc", USER: "pabc", LOGNAME: "pabc", LANG: "C.UTF-8" })
  })
})

describe("provisionArgv", () => {
  test("makes the user with its uid in the workspace group unless it exists, with the name and uid as arguments", () => {
    const user = userOf("12345")
    const [shell, flag, script, name, argName, uid] = provisionArgv(user)
    expect([shell, flag, name, argName, uid]).toEqual(["sh", "-c", "provision", user, String(uidOf(user))])
    expect(script).toContain(`--gid ${WORKSPACE_GROUP}`)
    expect(script).toContain('--uid "$2"')
    expect(script).toContain('id -u "$1"')
    expect(script).not.toContain(user)
  })
})
