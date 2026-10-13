/*
 * The header's repository and branch rule. Expected values are authored
 * literals: the rule must never name a branch the state does not hold.
 */
import { describe, expect, test } from "bun:test"
import { headerSelectionOf } from "./HeaderSelection"
import type { Session } from "./AppState"

type Input = Parameters<typeof headerSelectionOf>[0]
const navigation = (owner: string | null, selected_branch: string): NonNullable<Session["branchNavigation"]> => ({ owner, open: false, selected_branch, nodes: [] })
const repositories: Input["repositories"] = [
  { id: "acme/api", head: { bookmark: "trunk", changeId: "c1", commitId: "k1" } },
  { id: "acme/unloaded", head: null },
  { id: "acme/blank", head: { bookmark: "", changeId: null, commitId: null } }
]

describe("headerSelectionOf", () => {
  test("no session, no selection and an unparsable key all mean no repository and no branch", () => {
    expect(headerSelectionOf({ session: undefined, repositories, owner: "maya" })).toEqual({ repository: null, branch: null })
    expect(headerSelectionOf({ session: { activeRepoKey: null }, repositories, owner: "maya" })).toEqual({ repository: null, branch: null })
    expect(headerSelectionOf({ session: { activeRepoKey: "not a repository" }, repositories, owner: "maya" })).toEqual({ repository: null, branch: null })
  })

  test("a branch pick without a repository names no branch", () => {
    expect(headerSelectionOf({ session: { activeRepoKey: null, branchNavigation: navigation("maya", "main") }, repositories, owner: "maya" }))
      .toEqual({ repository: null, branch: null })
  })

  test("a selected repository names its own default branch, never a literal", () => {
    expect(headerSelectionOf({ session: { activeRepoKey: "acme/api" }, repositories, owner: "maya" })).toEqual({ repository: "acme/api", branch: "trunk" })
  })

  test("a working copy selects its repository", () => {
    expect(headerSelectionOf({ session: { activeRepoKey: "acme/api#workspace:7" }, repositories, owner: "maya" })).toEqual({ repository: "acme/api", branch: "trunk" })
  })

  test("a repository with no loaded default, a blank default, or no row has no branch", () => {
    expect(headerSelectionOf({ session: { activeRepoKey: "acme/unloaded" }, repositories, owner: "maya" })).toEqual({ repository: "acme/unloaded", branch: null })
    expect(headerSelectionOf({ session: { activeRepoKey: "acme/blank" }, repositories, owner: "maya" })).toEqual({ repository: "acme/blank", branch: null })
    expect(headerSelectionOf({ session: { activeRepoKey: "acme/gone" }, repositories, owner: "maya" })).toEqual({ repository: "acme/gone", branch: null })
  })

  test("this account's pick wins over the default", () => {
    expect(headerSelectionOf({ session: { activeRepoKey: "acme/api", branchNavigation: navigation("maya", "retry-webhooks") }, repositories, owner: "maya" }))
      .toEqual({ repository: "acme/api", branch: "retry-webhooks" })
  })

  test("another account's pick, a signed-out pick and a cleared pick give way to the default", () => {
    expect(headerSelectionOf({ session: { activeRepoKey: "acme/api", branchNavigation: navigation("ben", "retry-webhooks") }, repositories, owner: "maya" }).branch).toBe("trunk")
    expect(headerSelectionOf({ session: { activeRepoKey: "acme/api", branchNavigation: navigation("maya", "retry-webhooks") }, repositories, owner: null }).branch).toBe("trunk")
    expect(headerSelectionOf({ session: { activeRepoKey: "acme/api", branchNavigation: navigation("maya", "") }, repositories, owner: "maya" }).branch).toBe("trunk")
  })

  test("a signed-out pick is kept for a signed-out reader", () => {
    expect(headerSelectionOf({ session: { activeRepoKey: "acme/api", branchNavigation: navigation(null, "docs") }, repositories, owner: null }).branch).toBe("docs")
  })

  test("a pick the repository's loaded branches do not hold gives way to the default; one they hold stays", () => {
    const session = { activeRepoKey: "acme/api", branchNavigation: navigation("maya", "retry-webhooks") }
    expect(headerSelectionOf({ session, repositories, owner: "maya", branches: ["trunk", "docs"] }).branch).toBe("trunk")
    expect(headerSelectionOf({ session, repositories, owner: "maya", branches: ["trunk", "retry-webhooks"] }).branch).toBe("retry-webhooks")
    expect(headerSelectionOf({ session, repositories, owner: "maya", branches: [] }).branch).toBe("trunk")
  })

  test("an install names its one repository and its trunk, whatever the session selected", () => {
    expect(headerSelectionOf({ session: { activeRepoKey: "other/repo" }, repositories, owner: "maya", installRepository: "acme/install" }))
      .toEqual({ repository: "acme/install", branch: "main" })
    expect(headerSelectionOf({ session: { activeRepoKey: null, branchNavigation: navigation("maya", "retry-webhooks") }, repositories, owner: "maya", installRepository: "acme/install" }))
      .toEqual({ repository: "acme/install", branch: "retry-webhooks" })
  })

  test("an install whose repository is not read yet falls back to the session, not to a made-up name", () => {
    expect(headerSelectionOf({ session: { activeRepoKey: null }, repositories, owner: "maya", installRepository: null })).toEqual({ repository: null, branch: null })
  })
})
