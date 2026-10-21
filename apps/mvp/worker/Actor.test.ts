// Who may act (worker/Actor.ts): the roles that may ask Smithers, decision 0007 §2's `repo:ask`, and clone.
import { describe, expect, test } from "vitest"
import { ROLES } from "../src/features/auth/contract.ts"
import { type Actor, boundTo, canAsk, canClone } from "./Actor.ts"

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

describe("canClone", () => {
  test("Member and above may clone; a Guest and a person with no role may not", () => {
    expect([...ROLES, null].map((role) => [role, canClone(person(role))])).toEqual([
      ["admin", true],
      ["maintainer", true],
      ["member", true],
      ["guest", false],
      [null, false],
    ])
  })
})


test("a run-bound actor stays on its root chain, or its own id when no root was recorded", () => {
  expect(boundTo(person("member"), "any-run")).toBe(true)
  const legacy = person("member", { kind: "agent", id: "Run-A" })
  expect(boundTo(legacy, "run-a")).toBe(true)
  expect(boundTo(legacy, "another-run")).toBe(false)
  const nested = person("member", { kind: "agent", id: "child", root: "Root-A" })
  expect(boundTo(nested, "root-a")).toBe(true)
  expect(boundTo(nested, "child")).toBe(false)
})
