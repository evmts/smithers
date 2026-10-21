import { describe, expect, test } from "vitest"
import { COMMANDS } from "../commands/catalog"
import { HOME_INVALID, HOME_UNREADABLE } from "./contract"
import { emptyCurrent, type HomeRow } from "./rows"
import { draftFor, filesOf, homePageOf, offered, tabsOf } from "./view"

// What the page shows of a home, from its rows: the home, nothing while it is read, or the tree with its one line.

const current = { ...emptyCurrent, owner: "maya", name: "tinyhttp", key: "github/maya/tinyhttp@abc", defaultBranch: "main" }
const row = (fields: Partial<HomeRow>): HomeRow => ({
  key: current.key,
  state: "declared",
  blocks: [{ type: "text", text: "Hi" }],
  skipped: 0,
  reason: null,
  ...fields,
})

describe("homePageOf", () => {
  test("the tree until the repository is ready, nothing while its home is read, then the home", () => {
    expect(homePageOf(emptyCurrent, undefined)).toEqual({ kind: "tree", notice: null })
    expect(homePageOf({ ...current, defaultBranch: null }, undefined)).toEqual({ kind: "tree", notice: null })
    expect(homePageOf(current, undefined)).toEqual({ kind: "loading" })
    expect(homePageOf(current, row({}))).toEqual({
      kind: "home",
      blocks: [{ type: "text", text: "Hi" }],
      askHref: "/maya/tinyhttp/tree/main",
    })
  })

  test("the tree, with its line, for every home that can't show", () => {
    expect(homePageOf(current, row({ blocks: [] }))).toEqual({ kind: "tree", notice: null })
    expect(homePageOf(current, row({ state: "absent", blocks: [] }))).toEqual({ kind: "tree", notice: null })
    expect(homePageOf(current, row({ state: "invalid", blocks: [] }))).toEqual({ kind: "tree", notice: HOME_INVALID })
    expect(homePageOf(current, row({ state: "unreadable", blocks: [] }))).toEqual({
      kind: "tree",
      notice: HOME_UNREADABLE,
    })
  })

  test("names in the links are encoded", () => {
    expect(homePageOf({ ...current, name: "a b", defaultBranch: "fix/ü" }, row({}))).toMatchObject({
      askHref: "/maya/a%20b/tree/fix/%C3%BC",
    })
  })
})

describe("tabsOf", () => {
  test("the Home and Code tabs only for a home that shows", () => {
    expect(tabsOf(current, row({}))).toEqual({ owner: "maya", repo: "tinyhttp", ref: "main", _splat: "" })
    expect(tabsOf({ ...current, defaultBranch: "a/b/c" }, row({}))).toMatchObject({ ref: "a", _splat: "b/c" })
    expect(tabsOf(current, row({ state: "absent", blocks: [] }))).toBeUndefined()
    expect(tabsOf(current, undefined)).toBeUndefined()
  })
})

describe("offered and draftFor", () => {
  test("a command the composer has starts it; anything else starts nothing", () => {
    const command = COMMANDS[0]!.name
    expect(offered(command)).toBe(true)
    expect(draftFor(command)).toBe(`/${command} `)
    expect(offered("issue.implement")).toBe(false)
    expect(draftFor("issue.implement")).toBeUndefined()
    expect(draftFor(undefined)).toBeUndefined()
  })
})

describe("filesOf", () => {
  test("each Markdown block's file by its path, in the states the home view takes", () => {
    expect(
      filesOf([
        { path: "a.md", state: "text", text: "# A" },
        { path: "b.md", state: "loading", text: null },
        { path: "c.md", state: "failed", text: null },
        { path: "d.md", state: "text", text: null },
      ]),
    ).toEqual({
      "a.md": { state: "text", text: "# A" },
      "b.md": { state: "loading" },
      "c.md": { state: "failed" },
      "d.md": { state: "text", text: "" },
    })
  })
})
