import { describe, expect, test } from "vitest"
import { CAPACITY_COPY, FAILURE_COPY, SIGN_IN_TO_CLONE } from "./contract"
import type { BlobRow, CloneRow } from "./rows"
import type { Repository } from "./schema"
import {
  capacityText,
  commitOf,
  fileLinksOf,
  fileProps,
  formatBytes,
  headerOf,
  parseTimestamp,
  refsProps,
  revisionLabel,
  treeProps,
} from "./view"

// What the view shows, from the rows the queries read.

const SHA = "c".repeat(40)

const repository = (fields: Partial<Repository> = {}): Repository => ({
  id: "github/octocat/spoon-knife",
  owner: "octocat",
  name: "Spoon-Knife",
  status: "ready",
  failure: null,
  capacity: null,
  storedBytes: null,
  retryAt: null,
  defaultBranch: "main",
  headSha: SHA,
  headMessage: "Fix the fork\n\nLonger body",
  headAuthor: "The Octocat",
  headAt: "2026-10-20 12:00:00+00",
  attempt: 1,
  cloneId: "0b6c1d2e-3f40-4a51-8b62-7c83d94ea5f6",
  requestedAt: "2026-10-20 11:59:00+00",
  settledAt: "2026-10-20 12:00:05+00",
  ...fields,
})

const clone = (status: CloneRow["status"]): CloneRow => ({ id: "github/o/n", owner: "o", name: "n", status })

describe("treeProps and fileProps", () => {
  test("no row and a loading row are loading", () => {
    expect(treeProps(undefined)).toEqual({ state: "loading" })
    expect(treeProps({ key: "k", state: "loading", paths: [], truncated: false, message: null })).toEqual({
      state: "loading",
    })
    expect(fileProps(undefined)).toEqual({ state: "loading" })
    expect(fileProps({ key: "k", state: "loading", contents: null, size: null, message: null })).toEqual({
      state: "loading",
    })
  })

  test("a ready list, and a file as text, binary or too large", () => {
    expect(treeProps({ key: "k", state: "ready", paths: ["a"], truncated: true, message: null })).toEqual({
      state: "ready",
      paths: ["a"],
      truncated: true,
    })
    expect(fileProps({ key: "k", state: "text", contents: "hi", size: 2, message: null })).toEqual({
      state: "text",
      contents: "hi",
      size: 2,
    })
    expect(fileProps({ key: "k", state: "text", contents: null, size: null, message: null })).toEqual({
      state: "text",
      contents: "",
      size: 0,
    })
    expect(fileProps({ key: "k", state: "binary", contents: null, size: 9, message: null })).toEqual({
      state: "binary",
      size: 9,
    })
    expect(fileProps({ key: "k", state: "too-large", contents: null, size: null, message: null })).toEqual({
      state: "too-large",
      size: 0,
    })
  })

  test("a failed load carries its message", () => {
    expect(treeProps({ key: "k", state: "failed", paths: [], truncated: false, message: "Busy" })).toEqual({
      state: "failed",
      message: "Busy",
    })
    expect(treeProps({ key: "k", state: "failed", paths: [], truncated: false, message: null })).toEqual({
      state: "failed",
      message: "",
    })
    expect(fileProps({ key: "k", state: "failed", contents: null, size: null, message: "Gone" })).toEqual({
      state: "failed",
      message: "Gone",
    })
    expect(fileProps({ key: "k", state: "failed", contents: null, size: null, message: null })).toEqual({
      state: "failed",
      message: "",
    })
  })
})

describe("headerOf", () => {
  test("this tab's own request wins until Electric delivers what it did", () => {
    expect(headerOf(repository({ status: "failed", failure: "not_found" }), clone("requesting"), true)).toEqual({
      kind: "cloning",
    })
    expect(headerOf(undefined, clone("sign_in"), null)).toEqual({ kind: "sign_in", text: SIGN_IN_TO_CLONE })
    expect(headerOf(undefined, clone("limit"), true)).toEqual({ kind: "refused", text: CAPACITY_COPY.paused })
    expect(headerOf(undefined, clone("failed"), true)).toEqual({ kind: "refused", text: FAILURE_COPY.unavailable })
  })

  test("no repository is Clone, or sign-in for a signed-out person", () => {
    expect(headerOf(undefined, undefined, true)).toEqual({ kind: "clone" })
    expect(headerOf(undefined, undefined, null)).toEqual({ kind: "clone" })
    expect(headerOf(undefined, undefined, false)).toEqual({ kind: "sign_in", text: SIGN_IN_TO_CLONE })
    // Before the repositories' shape has answered, a repository the device hasn't seen offers nothing.
    expect(headerOf(undefined, undefined, true, false)).toEqual({ kind: "unknown" })
    expect(headerOf(undefined, undefined, false, false)).toEqual({ kind: "unknown" })
    expect(headerOf(repository({ status: "ready" }), undefined, true, false)).toEqual({ kind: "ready" })
    expect(headerOf(undefined, clone("requesting"), true, false)).toEqual({ kind: "cloning" })
  })

  test("a repository shows its status", () => {
    expect(headerOf(repository({ status: "cloning" }), undefined, true)).toEqual({ kind: "cloning" })
    expect(headerOf(repository(), undefined, false)).toEqual({ kind: "ready" })
    expect(headerOf(repository({ status: "failed", failure: "timed_out" }), undefined, true)).toEqual({
      kind: "refused",
      text: FAILURE_COPY.timed_out,
    })
    expect(headerOf(repository({ status: "failed" }), undefined, true)).toEqual({
      kind: "refused",
      text: FAILURE_COPY.unavailable,
    })
    expect(headerOf(repository({ status: "capacity", capacity: "storage" }), undefined, true)).toEqual({
      kind: "refused",
      text: CAPACITY_COPY.storage,
    })
  })
})

describe("capacityText", () => {
  test("names the size of a repository over the limit, and when GitHub gives the size again", () => {
    expect(capacityText(repository({ status: "capacity", capacity: "too_large", storedBytes: 1.2 * 1024 ** 3 }))).toBe(
      `${CAPACITY_COPY.too_large} · 1.2 GB`,
    )
    expect(capacityText(repository({ status: "capacity", capacity: "too_large" }))).toBe(CAPACITY_COPY.too_large)
    expect(
      capacityText(repository({ status: "capacity", capacity: "size_unknown", retryAt: "2026-10-20 15:40:00+00" })),
    ).toMatch(new RegExp(`^${CAPACITY_COPY.size_unknown} \\d`))
    expect(capacityText(repository({ status: "capacity", capacity: "size_unknown" }))).toBe(
      CAPACITY_COPY.size_unknown,
    )
    expect(capacityText(repository({ status: "capacity" }))).toBe(CAPACITY_COPY.paused)
  })
})

describe("formatting", () => {
  test("bytes in the largest whole unit", () => {
    expect(formatBytes(512)).toBe("512 B")
    expect(formatBytes(2048)).toBe("2.0 KB")
    expect(formatBytes(5 * 1024 ** 2)).toBe("5.0 MB")
    expect(formatBytes(3 * 1024 ** 5)).toBe("3072.0 TB")
  })

  test("Postgres timestamps and ISO ones", () => {
    expect(parseTimestamp("2026-10-20 15:40:00+00")).toBe(Date.UTC(2026, 9, 20, 15, 40))
    expect(parseTimestamp("2026-10-20 15:40:00.5-07")).toBe(Date.UTC(2026, 9, 20, 22, 40, 0, 500))
    expect(parseTimestamp("2026-10-20T15:40:00Z")).toBe(Date.UTC(2026, 9, 20, 15, 40))
  })
})

describe("commitOf", () => {
  test("the head commit's first line, author, short SHA and time", () => {
    expect(commitOf(repository())).toEqual({
      message: "Fix the fork",
      author: "The Octocat",
      shortSha: "ccccccc",
      at: Date.UTC(2026, 9, 20, 12),
    })
    expect(commitOf(repository({ headMessage: null, headAuthor: null }))).toMatchObject({ message: "", author: "" })
  })

  test("nothing before Settle wrote the head", () => {
    expect(commitOf(undefined)).toBeUndefined()
    expect(commitOf(repository({ headSha: null }))).toBeUndefined()
    expect(commitOf(repository({ headAt: null }))).toBeUndefined()
  })

  test("only at the head: another commit's details aren't on the device", () => {
    expect(commitOf(repository(), SHA)?.shortSha).toBe("ccccccc")
    expect(commitOf(repository(), null)).toBeUndefined()
    expect(commitOf(repository(), "d".repeat(40))).toBeUndefined()
  })
})

describe("the picker", () => {
  test("refs as the picker takes them: loading, ready or failed", () => {
    const row = { key: "k", branches: [{ name: "main", sha: SHA }], tags: [], truncated: true, message: null }
    expect(refsProps(undefined)).toEqual({ state: "loading" })
    expect(refsProps({ ...row, state: "loading" })).toEqual({ state: "loading" })
    expect(refsProps({ ...row, state: "ready" })).toEqual({
      state: "ready",
      branches: [{ name: "main", sha: SHA }],
      tags: [],
      truncated: true,
    })
    expect(refsProps({ ...row, state: "failed", message: "Code Storage is busy" })).toEqual({
      state: "failed",
      message: "Code Storage is busy",
    })
    expect(refsProps({ ...row, state: "failed" })).toEqual({ state: "failed", message: "" })
  })

  test("a branch or tag shows its name, a commit its short SHA", () => {
    expect(revisionLabel("feature/x")).toBe("feature/x")
    expect(revisionLabel(SHA)).toBe("ccccccc")
  })
})

describe("fileLinksOf", () => {
  const view = { owner: "octocat", name: "Spoon-Knife", sha: SHA, path: "docs/a b.md" }
  const blob = (fields: Partial<BlobRow>): BlobRow => ({
    key: "k",
    state: "text",
    contents: "x",
    size: 1,
    message: null,
    ...fields,
  })

  test("a text file: Raw and Download at its commit, and its text to copy", () => {
    const raw = `/api/repos/octocat/Spoon-Knife/raw/${SHA}/docs/a%20b.md`
    expect(fileLinksOf(view, blob({}))).toEqual({ raw, download: { href: raw, name: "a b.md" }, copyContents: true })
    expect(fileLinksOf(view, blob({ state: "binary", contents: null }))).toEqual({
      raw,
      download: { href: raw, name: "a b.md" },
      copyContents: false,
    })
  })

  test("a file over the limit opens GitHub's raw bytes; one not loaded yet, failed, or at no commit has nothing", () => {
    expect(fileLinksOf(view, blob({ state: "too-large", contents: null, size: 600_000 }))).toEqual({
      raw: `https://github.com/octocat/Spoon-Knife/raw/${SHA}/docs/a%20b.md`,
      copyContents: false,
    })
    for (const file of [undefined, blob({ state: "loading" }), blob({ state: "failed", message: "Not found" })]) {
      expect(fileLinksOf(view, file)).toEqual({ copyContents: false })
    }
    expect(fileLinksOf({ ...view, sha: null }, blob({}))).toEqual({ copyContents: false })
  })
})
