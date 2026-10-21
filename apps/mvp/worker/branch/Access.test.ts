// Who may do what on a branch's live workspace (worker/branch/Access.ts, decision 0013 §2 and §4): Google Docs-style
// sharing on this file's schema of the compose Postgres (`pnpm db:up`). A branch is private to its creator until they
// share it with people by name, to view or edit, or with anyone in the repository who has the link, Members only.
import { Option } from "effect"
import { beforeEach, describe, expect, test } from "vitest"
import type { Actor, Role } from "../Actor.ts"
import { resetBranches, shared, tracked } from "../test/branch.ts"
import { testFile } from "../test/harness.ts"
import {
  accessOf,
  branchAccess,
  canEdit,
  canView,
  ceilingOf,
  type Grants,
  isMember,
  policyOf,
  underPolicy,
} from "./Access.ts"

const runtime = testFile("access")
beforeEach(() => resetBranches(runtime))

const REPO = "github/octocat/spoon-knife"

const person = (role: Role | null, id = "person-1"): Option.Option<Actor> =>
  Option.some({ subject: { kind: "person", id }, role })

const grants = (fields: Partial<Grants> = {}): Grants => ({ createdBy: null, person: null, repository: null, ...fields })

describe("ceilingOf", () => {
  test("a Member or above may edit, a Guest only view, and no role nothing", () => {
    for (const role of ["admin", "maintainer", "member"] as const) expect(ceilingOf(role)).toBe("edit")
    expect(ceilingOf("guest")).toBe("view")
    expect(ceilingOf(null)).toBe("none")
  })
})

describe("accessOf", () => {
  test("a branch is its creator's: they own it, and nobody else sees it until it is shared", () => {
    expect(accessOf(person("member"), grants({ createdBy: "person-1" }))).toBe("owner")
    expect(accessOf(person("admin", "person-2"), grants({ createdBy: "person-1" }))).toBe("none")
    expect(accessOf(person("maintainer", "person-2"), grants({ createdBy: "person-1" }))).toBe("none")
  })

  test("a share by name grants view or edit, never above the person's role", () => {
    expect(accessOf(person("member"), grants({ createdBy: "x", person: "view" }))).toBe("view")
    expect(accessOf(person("member"), grants({ createdBy: "x", person: "edit" }))).toBe("edit")
    expect(accessOf(person("guest"), grants({ createdBy: "x", person: "view" }))).toBe("view")
    // A Guest shared to edit still only views: GitHub gives them no write.
    expect(accessOf(person("guest"), grants({ createdBy: "x", person: "edit" }))).toBe("view")
  })

  test("the link reaches Members and above, never a Guest", () => {
    expect(accessOf(person("member"), grants({ createdBy: "x", repository: "view" }))).toBe("view")
    expect(accessOf(person("admin"), grants({ createdBy: "x", repository: "edit" }))).toBe("edit")
    expect(accessOf(person("guest"), grants({ createdBy: "x", repository: "edit" }))).toBe("none")
  })

  test("the better of a share and the link wins", () => {
    expect(accessOf(person("member"), grants({ createdBy: "x", person: "view", repository: "edit" }))).toBe("edit")
    expect(accessOf(person("member"), grants({ createdBy: "x", person: "edit", repository: "view" }))).toBe("edit")
    expect(accessOf(person("guest"), grants({ createdBy: "x", person: "view", repository: "edit" }))).toBe("view")
  })

  test("the signed out, a person with no role, and a creator demoted to Guest get nothing of their own", () => {
    expect(accessOf(Option.none(), grants({ repository: "edit" }))).toBe("none")
    expect(accessOf(person(null), grants({ createdBy: "person-1", person: "edit", repository: "edit" }))).toBe("none")
    expect(accessOf(person("guest"), grants({ createdBy: "person-1" }))).toBe("none")
    expect(accessOf(person("guest"), grants({ createdBy: "person-1", person: "view" }))).toBe("view")
  })
})

describe("canView and canEdit", () => {
  test("view and up open a branch; owner and edit write to it", () => {
    expect([canView("owner"), canView("edit"), canView("view"), canView("none")]).toEqual([true, true, true, false])
    expect([canEdit("owner"), canEdit("edit"), canEdit("view"), canEdit("none")]).toEqual([true, true, false, false])
  })
})

describe("underPolicy", () => {
  test("applies a whole permission list to one principal and role", () => {
    const policy = { createdBy: "owner", grants: { ben: "edit", gus: "view", repository: "view" } } as const
    expect(underPolicy(policy, "owner", "member")).toBe("owner")
    expect(underPolicy(policy, "ben", "member")).toBe("edit")
    expect(underPolicy(policy, "gus", "guest")).toBe("view")
    expect(underPolicy(policy, "maya", "member")).toBe("view")
    expect(underPolicy(policy, "stranger", "guest")).toBe("none")
    expect(underPolicy({ createdBy: null, grants: {} }, "maya", "admin")).toBe("none")
    // A grant can't be read off a key every object has.
    expect(underPolicy({ createdBy: null, grants: {} }, "constructor", "member")).toBe("none")
  })
})

describe("isMember", () => {
  test("is a signed-in Member or above", () => {
    expect(isMember(person("member"))).toBe(true)
    expect(isMember(person("guest"))).toBe(false)
    expect(isMember(person(null))).toBe(false)
    expect(isMember(Option.none())).toBe(false)
  })
})

describe("branchAccess and policyOf", () => {
  test("read the branch, its conversation and the asker's access, by branch or by conversation", async () => {
    const branch = await tracked(runtime, REPO, "feature/share", "open", "person-1")
    const owner = await runtime.runPromise(branchAccess(person("member"), branch.branchId))
    expect(owner).toEqual({ ...branch, createdBy: "person-1", access: "owner" })
    const byConversation = await runtime.runPromise(branchAccess(person("member"), branch.conversationId, "conversation"))
    expect(byConversation).toEqual(owner)
    expect(await runtime.runPromise(branchAccess(person("member", "person-2"), branch.branchId)))
      .toMatchObject({ access: "none" })
    expect(await runtime.runPromise(branchAccess(Option.none(), branch.branchId))).toMatchObject({ access: "none" })
  })

  test("a share and the link reach the people they name", async () => {
    const branch = await tracked(runtime, REPO, "feature/shared", "open", "person-1")
    await shared(runtime, branch.branchId, "person-2", "edit", "ben")
    await shared(runtime, branch.branchId, "person-3", "view", "gus")
    expect(await runtime.runPromise(branchAccess(person("member", "person-2"), branch.branchId)))
      .toMatchObject({ access: "edit" })
    expect(await runtime.runPromise(branchAccess(person("guest", "person-3"), branch.branchId)))
      .toMatchObject({ access: "view" })
    expect(await runtime.runPromise(branchAccess(person("member", "person-4"), branch.branchId)))
      .toMatchObject({ access: "none" })
    await shared(runtime, branch.branchId, "repository", "view")
    expect(await runtime.runPromise(branchAccess(person("member", "person-4"), branch.branchId)))
      .toMatchObject({ access: "view" })
    // `repository` names the link's grant, never a person who might share its id.
    expect(await runtime.runPromise(branchAccess(person("guest", "repository"), branch.branchId)))
      .toMatchObject({ access: "none" })
    expect(await runtime.runPromise(policyOf(branch.branchId))).toEqual({
      createdBy: "person-1",
      grants: { "person-2": "edit", "person-3": "view", repository: "view" },
    })
  })

  test("a team branch (no creator, or the default branch) is open to Members with the link to edit", async () => {
    const team = await tracked(runtime, REPO, "team")
    const main = await tracked(runtime, REPO, "main", "locked", "person-1")
    for (const branch of [team, main]) {
      expect(await runtime.runPromise(branchAccess(person("member"), branch.branchId)))
        .toMatchObject({ createdBy: null, access: "edit" })
      expect(await runtime.runPromise(branchAccess(person("guest"), branch.branchId))).toMatchObject({ access: "none" })
    }
    expect(await runtime.runPromise(policyOf(main.branchId))).toEqual({
      createdBy: null,
      grants: { repository: "edit" },
    })
  })

  test("no such branch, or conversation, is undefined; a branch no one tracks has an empty policy", async () => {
    expect(await runtime.runPromise(branchAccess(person("member"), crypto.randomUUID()))).toBeUndefined()
    expect(await runtime.runPromise(branchAccess(person("member"), crypto.randomUUID(), "conversation")))
      .toBeUndefined()
    expect(await runtime.runPromise(policyOf(crypto.randomUUID()))).toEqual({ createdBy: null, grants: {} })
  })
})
