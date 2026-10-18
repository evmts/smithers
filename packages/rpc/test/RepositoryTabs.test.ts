import { describe, expect, it } from "vitest"
import { RepositoryTabsSchema } from "../src/RepositoryHome.ts"
import { formatRepositorySubject, splitRepositoryPath } from "../src/RepositorySubjectPath.ts"

const docs = { type: "docs", title: "Docs", root: "docs/user/src", index: "001-onboarding.md" }
const evaluation = {
  type: "eval",
  title: "Golden set",
  suite: "convert-golden",
  cases: ".smithers/flows/convert/golden",
  command: "node .smithers/flows/convert/score.mjs"
}
describe("repository tabs", () => {
  it("reads docs and evals and ignores future kinds", () => {
    expect(RepositoryTabsSchema.parse({ tabs: [docs, { type: "future" }, evaluation] }).tabs).toEqual([
      docs,
      evaluation
    ])
    expect(RepositoryTabsSchema.parse({ tabs: [] }).tabs).toEqual([])
    expect(RepositoryTabsSchema.parse({ tabs: [{ ...docs, nav: "docs/user/inventory.md" }] }).tabs[0]).toEqual({
      ...docs,
      nav: "docs/user/inventory.md"
    })
  })
  it("rejects excess tabs and ambiguous routes", () => {
    expect(
      RepositoryTabsSchema.safeParse({
        tabs: [docs, evaluation, { ...evaluation, suite: "two" }, { ...evaluation, suite: "three" }]
      }).success
    ).toBe(false)
    expect(RepositoryTabsSchema.safeParse({ tabs: [docs, docs] }).success).toBe(false)
    expect(RepositoryTabsSchema.safeParse({ tabs: [evaluation, evaluation] }).success).toBe(false)
  })
  it.each([
    "../docs",
    "docs/../secret",
    "/docs",
    "https://host/docs",
    "docs\\page",
    "%2e%2e/page",
    "docs//page",
    "./docs"
  ])("rejects escaping paths: %s", (path) => {
    for (const key of ["root", "index", "nav"]) {
      expect(RepositoryTabsSchema.safeParse({ tabs: [{ ...docs, [key]: path }] }).success).toBe(false)
    }
    expect(RepositoryTabsSchema.safeParse({ tabs: [{ ...evaluation, cases: path }] }).success).toBe(false)
  })
  it.each([
    "docs",
    "docs/001-onboarding.md",
    "docs/guide/hello%20world.md",
    "evals/convert-golden",
    "evals/convert-golden?case=01-basic"
  ])("round trips %s", (path) => {
    const subject = splitRepositoryPath(`/owner/repo/${path}`)?.subject
    expect(subject).toBeDefined()
    expect(formatRepositorySubject(subject!)).toBe(path)
  })
  it.each([
    "docs/../secret",
    "docs/%2e%2e/secret",
    "docs/%ff",
    "docs/%2fsecret",
    "evals",
    "evals/suite/extra",
    "evals/suite?case=../secret"
  ])(
    "refuses %s",
    (path) => {
      expect(splitRepositoryPath(`/owner/repo/${path}`)).toBeUndefined()
    }
  )
})
