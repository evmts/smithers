// Who may watch and write a branch's live workspace (worker/branch/Access.ts, decision 0013 §2).
import { Option } from "effect"
import { describe, expect, test } from "vitest"
import type { Actor, Role } from "../Actor.ts"
import { LIVE_BRANCHES_PUBLIC, mayWatch, mayWrite, watchPolicy } from "./Access.ts"

const person = (role: Role | null): Option.Option<Actor> =>
  Option.some({ subject: { kind: "person", id: "1" }, role })

describe("mayWatch", () => {
  test("Members and above watch, on a public repository and a private one alike", () => {
    for (const role of ["member", "maintainer", "admin"] as const) {
      expect(mayWatch(person(role), "public")).toBe(true)
      expect(mayWatch(person(role), "private")).toBe(true)
    }
  })

  test("a Guest, a person with no role and the signed out don't, even on a public repository (question 1: yes)", () => {
    expect(LIVE_BRANCHES_PUBLIC).toBe(false)
    for (const actor of [person("guest"), person(null), Option.none()]) {
      expect(mayWatch(actor, "public")).toBe(false)
      expect(mayWatch(actor, "private")).toBe(false)
    }
  })
})

describe("watchPolicy", () => {
  test("a public live workspace (question 1: no) lets anyone watch a public repository, never a private one", () => {
    const watch = watchPolicy(true)
    for (const actor of [person("guest"), person(null), Option.none()]) {
      expect(watch(actor, "public")).toBe(true)
      expect(watch(actor, "private")).toBe(false)
    }
    expect(watch(person("member"), "private")).toBe(true)
  })
})

describe("mayWrite", () => {
  test("a Member writes an open branch, never a locked or restricted one in this slice", () => {
    expect(mayWrite(person("member"), "open")).toBe(true)
    expect(mayWrite(person("admin"), "locked")).toBe(false)
    expect(mayWrite(person("admin"), "restricted")).toBe(false)
  })

  test("a Guest and the signed out never write", () => {
    expect(mayWrite(person("guest"), "open")).toBe(false)
    expect(mayWrite(Option.none(), "open")).toBe(false)
  })
})
