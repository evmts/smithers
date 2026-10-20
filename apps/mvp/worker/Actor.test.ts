// Who may act (worker/Actor.ts): the roles that may ask Smithers, decision 0007 §2's `repo:ask`.
import { describe, expect, test } from "vitest"
import { ROLES } from "../src/features/auth/contract.ts"
import { type Actor, canAsk } from "./Actor.ts"

const person = (role: Actor["role"], act?: Actor["act"]): Actor => ({
  subject: { kind: "person", id: `person-${role ?? "none"}` },
  role,
  ...(act === undefined ? {} : { act }),
})

describe("canAsk", () => {
  test("Member and above may ask; a Guest and a person with no role may not", () => {
    expect([...ROLES, null].map((role) => [role, canAsk(person(role))])).toEqual([
      ["admin", true],
      ["maintainer", true],
      ["member", true],
      ["guest", false],
      [null, false],
    ])
  })

  test("an agent acting for a person asks with that person's role", () => {
    expect(canAsk(person("member", { kind: "agent", id: "agent-1" }))).toBe(true)
    expect(canAsk(person("guest", { kind: "agent", id: "agent-1" }))).toBe(false)
  })
})
