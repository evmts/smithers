/*
 * The header's repository and branch rule. Expected values are authored
 * literals: the rule must never name a branch the state does not hold, and a
 * hosted pick must never be read from the conversation's branch.
 */
import { describe, expect, test } from "bun:test"
import { headerSelectionOf } from "./HeaderSelection"
import type { Session } from "./AppState"

type Input = Parameters<typeof headerSelectionOf>[0]
const navigation = (owner: string | null, selected_branch: string): NonNullable<Session["branchNavigation"]> => ({ owner, open: false, selected_branch, nodes: [] })
const picks = (rows: Readonly<Record<string, string>>) => (repository: string) => rows[repository]
const repositories: Input["repositories"] = [
  { id: "acme/api", head: { bookmark: "trunk", changeId: "c1", commitId: "k1" } },
  { id: "acme/unloaded", head: null },
  { id: "acme/blank", head: { bookmark: "", changeId: null, commitId: null } }
]

describe("headerSelectionOf on a hosted page", () => {
  test("no session, no selection and an unparsable key all mean no repository and no branch", () => {
    expect(headerSelectionOf({ session: undefined, repositories, owner: "maya" })).toEqual({ repository: null, branch: null })
    expect(headerSelectionOf({ session: { activeRepoKey: null }, repositories, owner: "maya" })).toEqual({ repository: null, branch: null })
    expect(headerSelectionOf({ session: { activeRepoKey: "not a repository" }, repositories, owner: "maya" })).toEqual({ repository: null, branch: null })
  })

  test("a pick without a selected repository names no branch", () => {
    expect(headerSelectionOf({ session: { activeRepoKey: null }, repositories, owner: "maya", pickOf: picks({ "acme/api": "docs" }) })).toEqual({ repository: null, branch: null })
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

  test("the pick made in the selected repository wins over its default; another repository's pick does not apply", () => {
    const pickOf = picks({ "acme/api": "retry-webhooks", "acme/other": "docs" })
    expect(headerSelectionOf({ session: { activeRepoKey: "acme/api" }, repositories, owner: "maya", pickOf })).toEqual({ repository: "acme/api", branch: "retry-webhooks" })
    expect(headerSelectionOf({ session: { activeRepoKey: "acme/unloaded" }, repositories, owner: "maya", pickOf })).toEqual({ repository: "acme/unloaded", branch: null })
  })

  test("a pick names a branch a repository without a loaded default still shows", () => {
    expect(headerSelectionOf({ session: { activeRepoKey: "acme/unloaded" }, repositories, owner: "maya", pickOf: picks({ "acme/unloaded": "docs" }) }).branch).toBe("docs")
  })

  test("the conversation's branch is not the header's branch: it is ignored whatever it holds", () => {
    for (const conversation of ["main", "retry-webhooks", "earlier", ""]) {
      expect(headerSelectionOf({ session: { activeRepoKey: "acme/api", branchNavigation: navigation("maya", conversation) }, repositories, owner: "maya" }))
        .toEqual({ repository: "acme/api", branch: "trunk" })
    }
  })

  test("a pick the repository's loaded branches do not hold gives way to the default; one they hold stays; a blank pick is no pick", () => {
    const session = { activeRepoKey: "acme/api" }
    const pickOf = picks({ "acme/api": "retry-webhooks" })
    expect(headerSelectionOf({ session, repositories, owner: "maya", pickOf, branches: ["trunk", "docs"] }).branch).toBe("trunk")
    expect(headerSelectionOf({ session, repositories, owner: "maya", pickOf, branches: ["trunk", "retry-webhooks"] }).branch).toBe("retry-webhooks")
    expect(headerSelectionOf({ session, repositories, owner: "maya", pickOf, branches: [] }).branch).toBe("trunk")
    expect(headerSelectionOf({ session, repositories, owner: "maya", pickOf: picks({ "acme/api": "" }) }).branch).toBe("trunk")
  })
})

describe("headerSelectionOf on an install", () => {
  test("it names its one repository and its trunk, whatever the session selected", () => {
    expect(headerSelectionOf({ session: { activeRepoKey: "other/repo" }, repositories, owner: "maya", installRepository: "acme/install" }))
      .toEqual({ repository: "acme/install", branch: "main" })
  })

  test("its branch is the conversation's branch for this account, and a hosted pick is not consulted", () => {
    expect(headerSelectionOf({ session: { activeRepoKey: null, branchNavigation: navigation("maya", "retry-webhooks") }, repositories, owner: "maya", installRepository: "acme/install", pickOf: picks({ "acme/install": "docs" }) }))
      .toEqual({ repository: "acme/install", branch: "retry-webhooks" })
  })

  test("another account's conversation branch and a blank one fall back to the trunk", () => {
    expect(headerSelectionOf({ session: { activeRepoKey: null, branchNavigation: navigation("ben", "retry-webhooks") }, repositories, owner: "maya", installRepository: "acme/install" }).branch).toBe("main")
    expect(headerSelectionOf({ session: { activeRepoKey: null, branchNavigation: navigation("maya", "") }, repositories, owner: "maya", installRepository: "acme/install" }).branch).toBe("main")
  })

  test("with its repository not read yet it names nothing, not a made-up name", () => {
    expect(headerSelectionOf({ session: { activeRepoKey: null }, repositories, owner: "maya", installRepository: null })).toEqual({ repository: null, branch: null })
  })
})
