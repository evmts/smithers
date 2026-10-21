/**
 * Pull requests, branch refs and commits against a stateful fake GitHub on a
 * real socket.
 *
 * Writes change the fake's state, so the cases assert on what the repository
 * ends up holding: a pull request opened whose answer was lost is found by its
 * head and marker, a merge is fenced by the head the person saw, and a commit
 * is fenced by the branch's expected head.
 */
import { Effect, Option } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import type { IntegrationError } from "../src/core/IntegrationError.ts"
import * as Commits from "../src/github/Commits.ts"
import type { GitHubClient } from "../src/github/GitHubClient.ts"
import { withWriteMarker } from "../src/github/Issues.ts"
import * as Pulls from "../src/github/Pulls.ts"
import * as Refs from "../src/github/Refs.ts"
import { type Fixture, json, startFixture } from "./Fixture.ts"
import { gitHubLayer } from "./Http.ts"

type Raw = Record<string, unknown>

const USER = { id: 1, login: "octocat" }
const BASE = "a".repeat(40)
const OTHER = "b".repeat(40)
const sha = (n: number) => n.toString(16).padStart(40, "c")

interface FakeGitHub {
  readonly fixture: Fixture
  readonly refs: Map<string, string>
  readonly pulls: Array<Raw>
  readonly reviews: Map<number, Array<Raw>>
  readonly commits: Map<string, Raw>
  /** The next write applies, then answers 502. */
  lose: boolean
  /** The next GraphQL call answers this body. */
  graphqlAnswer: unknown
  /** Raw items every pull listing starts with. */
  junk: Array<unknown>
  readonly writes: () => ReadonlyArray<string>
}

let github: FakeGitHub | undefined

afterEach(async () => {
  await github?.fixture.close()
  github = undefined
})

let clock = Date.parse("2026-10-20T10:00:00Z")
const stamp = () => new Date(clock += 1000).toISOString()
let nextCommit = 1

const rawPull = (number: number, input: Raw): Raw => {
  const at = stamp()
  return {
    id: 7000 + number,
    node_id: `PR_${number}`,
    number,
    title: input["title"],
    body: input["body"],
    state: "open",
    draft: input["draft"] ?? false,
    merged: false,
    merged_at: null,
    merge_commit_sha: null,
    merged_by: null,
    mergeable_state: "clean",
    user: USER,
    head: { ref: input["head"], sha: github!.refs.get(input["head"] as string) },
    base: { ref: input["base"], sha: github!.refs.get(input["base"] as string) },
    commits: 1,
    additions: 1,
    deletions: 0,
    changed_files: 1,
    created_at: at,
    updated_at: at,
    closed_at: null
  }
}

// A listing omits the merge and size fields, as GitHub's does.
const listed = (pull: Raw): Raw => {
  const { merged: _m, merged_by: _b, mergeable_state: _s, commits: _c, additions: _a, deletions: _d, changed_files: _f, ...rest } =
    pull
  return rest
}

const startGitHub = async (): Promise<FakeGitHub> => {
  const state = {
    refs: new Map<string, string>([["main", BASE]]),
    pulls: [] as Array<Raw>,
    reviews: new Map<number, Array<Raw>>(),
    commits: new Map<string, Raw>([[BASE, { sha: BASE, message: "Initial commit", tree: { sha: "t0" }, parents: [] }]]),
    lose: false,
    graphqlAnswer: undefined as unknown,
    junk: [] as Array<unknown>
  }
  const write = (response: Parameters<typeof json>[0], status: number, body: unknown) => {
    if (state.lose) {
      state.lose = false
      return json(response, 502, { message: "Bad Gateway" })
    }
    json(response, status, body)
  }
  const fixture: Fixture = await startFixture((request, response) => {
    const url = new URL(request.url, "http://github.test")
    const path = url.pathname
    const body = request.body.length > 0 ? JSON.parse(request.body) : undefined
    if (path === "/graphql") {
      const input = body.variables.input
      if (state.graphqlAnswer !== undefined) {
        const answer = state.graphqlAnswer
        state.graphqlAnswer = undefined
        return json(response, 200, answer)
      }
      const head = state.refs.get(input.branch.branchName)
      if (head !== input.expectedHeadOid) {
        return json(response, 200, {
          data: { createCommitOnBranch: null },
          errors: [{ type: "STALE_DATA", message: `Expected branch to point to "${input.expectedHeadOid}" but it did not.` }]
        })
      }
      const oid = sha(nextCommit++)
      state.commits.set(oid, {
        sha: oid,
        message: `${input.message.headline}${input.message.body === undefined ? "" : `\n\n${input.message.body}`}`,
        tree: { sha: `tree-${oid}` },
        parents: [{ sha: head }]
      })
      state.refs.set(input.branch.branchName, oid)
      return write(response, 200, { data: { createCommitOnBranch: { commit: { oid, url: "https://github.test" } } } })
    }
    if (path === "/repos/o/r/git/refs" && request.method === "POST") {
      const name = (body.ref as string).replace(/^refs\/heads\//, "")
      if (state.refs.has(name)) return json(response, 422, { message: "Reference already exists" })
      state.refs.set(name, body.sha)
      return write(response, 201, { ref: body.ref, object: { sha: body.sha, type: "commit" } })
    }
    const ref = /^\/repos\/o\/r\/git\/ref\/heads\/(.+)$/.exec(path)
    if (ref !== null) {
      if (ref[1] === "boom") return json(response, 500, { message: "Server Error" })
      const head = state.refs.get(ref[1]!)
      if (head === undefined) return json(response, 404, { message: "Not Found" })
      return json(response, 200, { ref: `refs/heads/${ref[1]}`, object: { sha: head, type: "commit" } })
    }
    const commit = /^\/repos\/o\/r\/git\/commits\/([0-9a-f]{40})$/.exec(path)
    if (commit !== null) {
      const found = state.commits.get(commit[1]!)
      return found === undefined ? json(response, 404, { message: "Not Found" }) : json(response, 200, found)
    }
    const compared = /^\/repos\/o\/r\/compare\/([0-9a-f]{40})\.\.\.([0-9a-f]{40})$/.exec(path)
    if (compared !== null) {
      const count = compared[2] === OTHER ? Commits.MAX_COMPARE_FILES : 1
      const files = Array.from({ length: count }, (_, i) => ({
        sha: "x",
        filename: `f${i}.md`,
        status: "modified",
        additions: 1,
        deletions: 0,
        changes: 1,
        ...(i === 0 ? { patch: "@@ -1 +1,2 @@\n a\n+b" } : {})
      }))
      return json(response, 200, { ahead_by: 1, behind_by: 0, total_commits: 1, files })
    }
    if (path === "/repos/o/r/pulls") {
      if (request.method === "POST") {
        if (state.refs.get(body.head) === state.refs.get(body.base)) {
          return json(response, 422, { message: "No commits between main and head" })
        }
        const pull = rawPull(state.pulls.length + 1, body)
        state.pulls.push(pull)
        return write(response, 201, pull)
      }
      const head = url.searchParams.get("head")
      const matching = state.pulls.filter((pull) =>
        head === null || `o:${(pull["head"] as Raw)["ref"]}` === head
      )
      return json(response, 200, [...state.junk, ...matching.map(listed)])
    }
    const pullOf = /^\/repos\/o\/r\/pulls\/(\d+)(\/[a-z]+)?$/.exec(path)
    const pull = pullOf === null ? undefined : state.pulls.find((candidate) => candidate["number"] === Number(pullOf[1]))
    if (pullOf !== null && pull === undefined) return json(response, 404, { message: "Not Found" })
    if (pull !== undefined) {
      const number = pull["number"] as number
      const tail = pullOf![2]
      if (tail === undefined && request.method === "PATCH") {
        Object.assign(pull, { state: body.state, closed_at: stamp(), updated_at: stamp() })
        return write(response, 200, pull)
      }
      if (tail === undefined) return json(response, 200, pull)
      if (tail === "/merge") {
        if (pull["draft"] === true) return json(response, 405, { message: "Pull Request is not mergeable" })
        if ((pull["head"] as Raw)["sha"] !== body.sha) {
          return json(response, 409, { message: "Head branch was modified. Review and try the merge again." })
        }
        const merged = sha(nextCommit++)
        Object.assign(pull, { state: "closed", merged: true, merge_commit_sha: merged, merged_at: stamp(), merged_by: USER })
        state.refs.set("main", merged)
        return write(response, 200, { sha: merged, merged: true, message: "Pull Request successfully merged" })
      }
      if (tail === "/commits") {
        return json(response, 200, [{
          sha: (pull["head"] as Raw)["sha"],
          commit: { message: "T1: Add a line\n\nSmithers for @maya", author: { name: "Smithers", date: stamp() } },
          author: null
        }])
      }
      const reviews = state.reviews.get(number) ?? []
      if (request.method === "POST") {
        const review = {
          id: 9000 + reviews.length,
          node_id: `PRR_${reviews.length}`,
          user: USER,
          body: body.body,
          state: body.event === "COMMENT" ? "COMMENTED" : body.event === "APPROVE" ? "APPROVED" : "CHANGES_REQUESTED",
          commit_id: body.commit_id,
          submitted_at: stamp()
        }
        state.reviews.set(number, [...reviews, review])
        return write(response, 200, review)
      }
      return json(response, 200, reviews)
    }
    json(response, 404, { message: "Not Found" })
  })
  github = Object.assign(state, {
    fixture,
    writes: () =>
      fixture.requests.filter((request) => request.method !== "GET").map((request) =>
        `${request.method} ${new URL(request.url, "http://github.test").pathname}`
      )
  }) as FakeGitHub
  return github
}

const layer = () => gitHubLayer({ token: "token-for-tests", apiBaseUrl: github!.fixture.origin }, {})

const run = <A>(effect: Effect.Effect<A, IntegrationError, GitHubClient>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(layer())))

const failure = <A>(effect: Effect.Effect<A, IntegrationError, GitHubClient>): Promise<IntegrationError> =>
  Effect.runPromise(Effect.flip(effect).pipe(Effect.provide(layer())))

const README = btoa("# Scratch\n\nA line\n")

/** A branch from main with one commit on it, through the module under test. */
const branchWithCommit = async (name: string) => {
  await run(Refs.createBranch("o", "r", { name, sha: BASE }))
  return run(Commits.createOnBranch("o", "r", {
    branch: name,
    expectedHeadOid: BASE,
    headline: "T1: Add a line",
    body: "Smithers for @maya",
    additions: [{ path: "README.md", contents: README }],
    deletions: []
  }))
}

describe("Refs", () => {
  it("creates a branch at a commit and reads its head back; a missing branch is none", async () => {
    await startGitHub()
    expect(await run(Refs.createBranch("o", "r", { name: "smithers/t1-add-a-line", sha: BASE }))).toEqual({
      name: "smithers/t1-add-a-line",
      sha: BASE
    })
    expect(Option.getOrThrow(await run(Refs.getBranch("o", "r", "smithers/t1-add-a-line"))).sha).toBe(BASE)
    expect(Option.isNone(await run(Refs.getBranch("o", "r", "nope")))).toBe(true)
    expect(github!.writes()).toEqual(["POST /repos/o/r/git/refs"])
  })

  it("refuses a branch that exists with GitHub's 422, and a lost answer is unknown until read back", async () => {
    await startGitHub()
    expect((await failure(Refs.createBranch("o", "r", { name: "main", sha: BASE }))).details?.["status"]).toBe(422)
    github!.lose = true
    const lost = await failure(Refs.createBranch("o", "r", { name: "t2", sha: BASE }))
    expect(lost.details?.["outcomeUnknown"]).toBe(true)
    expect(Option.getOrThrow(await run(Refs.getBranch("o", "r", "t2"))).sha).toBe(BASE)
  })

  it("fails other answers of a read", async () => {
    await startGitHub()
    const failed = await failure(Refs.getBranch("o", "r", "boom"))
    expect([failed.details?.["status"], failed.details?.["retryable"]]).toEqual([500, true])
  })

  it("validates branch names and SHAs before any request", async () => {
    await startGitHub()
    for (const name of ["", "a..b", "/a", "a/", "a//b", ".hidden", "a/.b", "x.lock", "a b", "a~1", "x".repeat(201)]) {
      expect(Refs.isBranch(name)).toBe(false)
      expect((await failure(Refs.getBranch("o", "r", name))).reason).toBe("invalid-config")
    }
    expect(Refs.isBranch(42)).toBe(false)
    expect(Refs.isBranch("smithers/t12-fix_it.v2")).toBe(true)
    expect((await failure(Refs.createBranch("o", "r", { name: "ok", sha: "nope" }))).details?.["field"]).toBe("sha")
    expect((await failure(Refs.createBranch("o", "r", { name: "ok", sha: 7 as unknown as string }))).reason).toBe(
      "invalid-config",
    )
    expect((await failure(Refs.requireBranch(7 as unknown as string))).details?.["branch"]).toBe("number")
    expect((await failure(Refs.getBranch("bad owner", "r", "main"))).reason).toBe("invalid-config")
    expect((await failure(Refs.createBranch("bad owner", "r", { name: "a", sha: BASE }))).reason).toBe("invalid-config")
    expect(github!.fixture.requests).toHaveLength(0)
  })
})

describe("Commits", () => {
  it("appends one commit fenced by the expected head, and reads it back with its parent", async () => {
    await startGitHub()
    const oid = await branchWithCommit("t1")
    expect(github!.refs.get("t1")).toBe(oid)
    const commit = await run(Commits.getCommit("o", "r", oid))
    expect(commit.parents.map((parent) => parent.sha)).toEqual([BASE])
    expect(commit.message).toBe("T1: Add a line\n\nSmithers for @maya")
    const sent = JSON.parse(github!.fixture.requests.find((request) => request.url === "/graphql")!.body)
    expect(sent.variables.input).toEqual({
      branch: { repositoryNameWithOwner: "o/r", branchName: "t1" },
      expectedHeadOid: BASE,
      message: { headline: "T1: Add a line", body: "Smithers for @maya" },
      fileChanges: { additions: [{ path: "README.md", contents: README }], deletions: [] }
    })
  })

  it("refuses a moved branch as stale, other GraphQL errors as 422, and an answer with no commit", async () => {
    await startGitHub()
    await branchWithCommit("t1")
    const stale = await failure(Commits.createOnBranch("o", "r", {
      branch: "t1",
      expectedHeadOid: BASE,
      headline: "again",
      additions: [],
      deletions: ["README.md"]
    }))
    expect(stale.details).toMatchObject({ status: 409, stale: true, retryable: false, outcomeUnknown: false })
    github!.graphqlAnswer = { data: null, errors: [{ message: "Something went wrong" }] }
    const other = await failure(Commits.createOnBranch("o", "r", {
      branch: "t1",
      expectedHeadOid: github!.refs.get("t1")!,
      headline: "again",
      additions: [],
      deletions: ["README.md"]
    }))
    expect(other.details).toMatchObject({ status: 422, stale: false })
    for (const answer of [{ data: null, errors: [] }, { data: { createCommitOnBranch: null } }, {}]) {
      github!.graphqlAnswer = answer
      const empty = await failure(Commits.createOnBranch("o", "r", {
        branch: "t1",
        expectedHeadOid: github!.refs.get("t1")!,
        headline: "again",
        additions: [],
        deletions: ["README.md"]
      }))
      expect(empty.details).toMatchObject({ status: 422, stale: false })
    }
  })

  it("leaves a lost answer unknown; the branch read back shows whether it landed", async () => {
    await startGitHub()
    await run(Refs.createBranch("o", "r", { name: "t1", sha: BASE }))
    github!.lose = true
    const lost = await failure(Commits.createOnBranch("o", "r", {
      branch: "t1",
      expectedHeadOid: BASE,
      headline: "T1: Add a line",
      additions: [{ path: "README.md", contents: README }],
      deletions: []
    }))
    expect(lost.details?.["outcomeUnknown"]).toBe(true)
    const head = Option.getOrThrow(await run(Refs.getBranch("o", "r", "t1"))).sha
    expect((await run(Commits.getCommit("o", "r", head))).parents[0]!.sha).toBe(BASE)
  })

  it("validates every input before any request", async () => {
    await startGitHub()
    const valid = {
      branch: "t1",
      expectedHeadOid: BASE,
      headline: "x",
      additions: [{ path: "a.md", contents: "" }],
      deletions: []
    }
    const cases: Array<[Partial<Parameters<typeof Commits.createOnBranch>[2]>, string]> = [
      [{ branch: "a..b" }, "branch"],
      [{ expectedHeadOid: "abc" }, "expectedHeadOid"],
      [{ headline: "   " }, "headline"],
      [{ headline: "two\nlines" }, "headline"],
      [{ headline: 3 as unknown as string }, "headline"],
      [{ additions: [], deletions: [] }, "fileChanges"],
      [{ additions: Array.from({ length: 1001 }, () => ({ path: "a", contents: "" })) }, "fileChanges"],
      [{ additions: [{ path: "../etc", contents: "" }] }, "additions"],
      [{ additions: [{ path: "a\\b", contents: "" }] }, "additions"],
      [{ additions: [{ path: "a\u0001", contents: "" }] }, "additions"],
      [{ additions: [{ path: "a\u007f", contents: "" }] }, "additions"],
      [{ additions: [{ path: "x".repeat(4097), contents: "" }] }, "additions"],
      [{ additions: [{ path: 9 as unknown as string, contents: "" }] }, "additions"],
      [{ additions: [{ path: "a", contents: "not base64!" }] }, "additions"],
      [{ additions: [{ path: "a", contents: "abc" }] }, "additions"],
      [{ additions: [{ path: "a", contents: 5 as unknown as string }] }, "additions"],
      [{ deletions: ["a//b"] }, "deletions"]
    ]
    for (const [change, field] of cases) {
      const refused = await failure(Commits.createOnBranch("o", "r", { ...valid, ...change }))
      expect([refused.reason, refused.details?.["field"]]).toEqual(["invalid-config", field])
    }
    expect((await failure(Commits.createOnBranch("bad owner", "r", valid))).reason).toBe("invalid-config")
    expect((await failure(Commits.getCommit("o", "r", "short"))).details?.["field"]).toBe("sha")
    expect((await failure(Commits.getCommit("bad owner", "r", BASE))).reason).toBe("invalid-config")
    expect((await failure(Commits.compare("o", "r", "x", BASE))).details?.["field"]).toBe("base")
    expect((await failure(Commits.compare("o", "r", BASE, "y"))).details?.["field"]).toBe("head")
    expect((await failure(Commits.compare("bad owner", "r", BASE, BASE))).reason).toBe("invalid-config")
    expect(github!.fixture.requests).toHaveLength(0)
  })

  it("compares two commits, flagging a listing GitHub may have cut", async () => {
    await startGitHub()
    const small = await run(Commits.compare("o", "r", BASE, sha(99)))
    expect(small).toEqual({
      aheadBy: 1,
      behindBy: 0,
      truncated: false,
      files: [{ filename: "f0.md", status: "modified", additions: 1, deletions: 0, patch: "@@ -1 +1,2 @@\n a\n+b" }]
    })
    const large = await run(Commits.compare("o", "r", BASE, OTHER))
    expect([large.files.length, large.truncated]).toEqual([Commits.MAX_COMPARE_FILES, true])
  })
})

describe("Pulls", () => {
  it("opens a pull request from a branch, reads it, lists it and finds it by head and marker", async () => {
    await startGitHub()
    const head = await branchWithCommit("smithers/t1-add")
    const body = withWriteMarker("Fixes #3", "write-1")
    const opened = await run(Pulls.createPull("o", "r", { head: "smithers/t1-add", base: "main", title: "T1", body }))
    expect([opened.number, opened.head.sha, opened.base.ref, opened.draft]).toEqual([1, head, "main", false])
    expect(JSON.parse(github!.fixture.requests.at(-1)!.body)).toEqual({
      head: "smithers/t1-add",
      base: "main",
      title: "T1",
      body,
      draft: false
    })
    const read = await run(Pulls.getPull("o", "r", 1))
    expect([read.merged, read.mergeable_state, read.changed_files]).toEqual([false, "clean", 1])
    const all = await run(Pulls.listPulls("o", "r"))
    expect([all.items.length, all.truncated, all.items[0]!.merged, all.items[0]!.commits]).toEqual([1, false, false, 0])
    expect(github!.fixture.requests.at(-1)!.url).toBe("/repos/o/r/pulls?state=all&sort=updated&direction=desc&per_page=100")
    expect(Option.getOrThrow(await run(Pulls.findPullByHead("o", "r", { head: "smithers/t1-add", writeId: "write-1" })))
      .number).toBe(1)
    expect(Option.getOrThrow(await run(Pulls.findPullByHead("o", "r", { head: "smithers/t1-add" }))).number).toBe(1)
    expect(Option.isNone(await run(Pulls.findPullByHead("o", "r", { head: "smithers/t1-add", writeId: "other" }))))
      .toBe(true)
    expect(Option.isNone(await run(Pulls.findPullByHead("o", "r", { head: "nothing" })))).toBe(true)
    expect(github!.fixture.requests.at(-1)!.url).toContain("head=o%3Anothing")
    const open = await run(Pulls.listPulls("o", "r", { state: "open", maxPages: 1 }))
    expect(open.items).toHaveLength(1)
  })

  it("adopts the earliest of two pull requests carrying the marker", async () => {
    await startGitHub()
    await branchWithCommit("t1")
    await run(Pulls.createPull("o", "r", { head: "t1", base: "main", title: "T1", body: withWriteMarker("", "w") }))
    await run(Pulls.createPull("o", "r", { head: "t1", base: "main", title: "T1", body: withWriteMarker("", "w") }))
    // GitHub lists newest first.
    github!.pulls.reverse()
    expect(Option.getOrThrow(await run(Pulls.findPullByHead("o", "r", { head: "t1", writeId: "w" }))).number).toBe(1)
  })

  it("opens a draft, refuses a branch with no commits, and leaves a lost answer unknown", async () => {
    await startGitHub()
    await run(Refs.createBranch("o", "r", { name: "empty", sha: BASE }))
    expect((await failure(Pulls.createPull("o", "r", { head: "empty", base: "main", title: "x", body: "" }))).details?.[
      "status"
    ]).toBe(422)
    await branchWithCommit("t1")
    const draft = await run(Pulls.createPull("o", "r", { head: "t1", base: "main", title: "x", body: "", draft: true }))
    expect(draft.draft).toBe(true)
    await branchWithCommit("t2")
    github!.lose = true
    const lost = await failure(Pulls.createPull("o", "r", { head: "t2", base: "main", title: "x", body: "" }))
    expect(lost.details?.["outcomeUnknown"]).toBe(true)
    expect(Option.isSome(await run(Pulls.findPullByHead("o", "r", { head: "t2" })))).toBe(true)
  })

  it("merges at the head the person saw, refuses a moved head (409) and a draft (405)", async () => {
    await startGitHub()
    const head = await branchWithCommit("t1")
    await run(Pulls.createPull("o", "r", { head: "t1", base: "main", title: "T1", body: "" }))
    expect((await failure(Pulls.mergePull("o", "r", 1, { sha: OTHER, method: "squash" }))).details?.["status"]).toBe(409)
    const merged = await run(Pulls.mergePull("o", "r", 1, {
      sha: head,
      method: "squash",
      commitTitle: "T1 (#1)",
      commitMessage: "Fixes #3"
    }))
    expect(merged.merged).toBe(true)
    expect(github!.refs.get("main")).toBe(merged.sha)
    expect(JSON.parse(github!.fixture.requests.at(-1)!.body)).toEqual({
      sha: head,
      merge_method: "squash",
      commit_title: "T1 (#1)",
      commit_message: "Fixes #3"
    })
    const read = await run(Pulls.getPull("o", "r", 1))
    expect([read.merged, read.merge_commit_sha, read.merged_by?.login]).toEqual([true, merged.sha, "octocat"])
    const draftHead = await branchWithCommit("t2")
    await run(Pulls.createPull("o", "r", { head: "t2", base: "main", title: "T2", body: "", draft: true }))
    expect((await failure(Pulls.mergePull("o", "r", 2, { sha: draftHead, method: "merge" }))).details?.["status"])
      .toBe(405)
    expect(JSON.parse(github!.fixture.requests.at(-1)!.body)).toEqual({ sha: draftHead, merge_method: "merge" })
  })

  it("closes a pull request, idempotently, and treats a lost close as retryable", async () => {
    await startGitHub()
    await branchWithCommit("t1")
    await run(Pulls.createPull("o", "r", { head: "t1", base: "main", title: "T1", body: "" }))
    expect((await run(Pulls.closePull("o", "r", 1))).state).toBe("closed")
    github!.lose = true
    expect((await failure(Pulls.closePull("o", "r", 1))).details?.["retryable"]).toBe(true)
    expect((await run(Pulls.closePull("o", "r", 1))).state).toBe("closed")
    expect((await failure(Pulls.closePull("o", "r", 9))).details?.["status"]).toBe(404)
  })

  it("lists commits, and submits a comment review that a lost answer finds by its marker", async () => {
    await startGitHub()
    const head = await branchWithCommit("t1")
    await run(Pulls.createPull("o", "r", { head: "t1", base: "main", title: "T1", body: "" }))
    const commits = await run(Pulls.listCommits("o", "r", 1))
    expect([commits.items[0]!.sha, commits.items[0]!.commit.message.split("\n")[0], commits.truncated]).toEqual([
      head,
      "T1: Add a line",
      false
    ])
    expect((await run(Pulls.listCommits("o", "r", 1, { maxPages: 1 }))).items).toHaveLength(1)
    expect((await run(Pulls.listReviews("o", "r", 1))).items).toEqual([])
    github!.lose = true
    const body = withWriteMarker("Looks right.", "review-1")
    const lost = await failure(Pulls.createReview("o", "r", 1, { commitId: head, event: "COMMENT", body }))
    expect(lost.details?.["outcomeUnknown"]).toBe(true)
    const found = Option.getOrThrow(await run(Pulls.findReviewByWrite("o", "r", 1, { writeId: "review-1" })))
    expect([found.state, found.commit_id]).toEqual(["COMMENTED", head])
    expect(Option.isNone(await run(Pulls.findReviewByWrite("o", "r", 1, { writeId: "review-2" })))).toBe(true)
    const approved = await run(Pulls.createReview("o", "r", 1, { commitId: head, event: "APPROVE", body: "" }))
    expect(approved.state).toBe("APPROVED")
    const changes = await run(Pulls.createReview("o", "r", 1, { commitId: head, event: "REQUEST_CHANGES", body: "No" }))
    expect(changes.state).toBe("CHANGES_REQUESTED")
    expect((await run(Pulls.listReviews("o", "r", 1, { maxPages: 1 }))).items).toHaveLength(3)
  })

  it("fails a listing GitHub shapes differently as decode-failed", async () => {
    await startGitHub()
    github!.junk = [{ number: "not a pull" }]
    expect((await failure(Pulls.listPulls("o", "r"))).reason).toBe("decode-failed")
  })

  it("validates every input before any request", async () => {
    await startGitHub()
    const refusals: Array<Effect.Effect<unknown, IntegrationError, GitHubClient>> = [
      Pulls.getPull("o", "r", 0),
      Pulls.getPull("bad owner", "r", 1),
      Pulls.getPull("o", "r", "1" as unknown as number),
      Pulls.listPulls("bad owner", "r"),
      Pulls.listPulls("o", "r", { head: "a..b" }),
      Pulls.findPullByHead("o", "r", { head: "x", writeId: "has space" }),
      Pulls.createPull("bad owner", "r", { head: "a", base: "main", title: "t", body: "" }),
      Pulls.createPull("o", "r", { head: "a..b", base: "main", title: "t", body: "" }),
      Pulls.createPull("o", "r", { head: "a", base: "", title: "t", body: "" }),
      Pulls.createPull("o", "r", { head: "a", base: "main", title: "  ", body: "" }),
      Pulls.createPull("o", "r", { head: "a", base: "main", title: 4 as unknown as string, body: "" }),
      Pulls.closePull("o", "r", -1),
      Pulls.closePull("bad owner", "r", 1),
      Pulls.mergePull("o", "r", 1, { sha: "short", method: "squash" }),
      Pulls.mergePull("o", "r", 1, { sha: 1 as unknown as string, method: "squash" }),
      Pulls.mergePull("o", "r", 1, { sha: BASE, method: "fast-forward" as Pulls.MergeMethod }),
      Pulls.mergePull("o", "r", 0, { sha: BASE, method: "squash" }),
      Pulls.mergePull("bad owner", "r", 1, { sha: BASE, method: "squash" }),
      Pulls.listCommits("o", "r", 0),
      Pulls.listCommits("bad owner", "r", 1),
      Pulls.listReviews("o", "r", 0),
      Pulls.listReviews("bad owner", "r", 1),
      Pulls.createReview("o", "r", 1, { commitId: "x", event: "COMMENT", body: "b" }),
      Pulls.createReview("o", "r", 1, { commitId: BASE, event: "DISMISS" as Pulls.ReviewEvent, body: "b" }),
      Pulls.createReview("o", "r", 1, { commitId: BASE, event: "COMMENT", body: " " }),
      Pulls.createReview("o", "r", 1, { commitId: BASE, event: "COMMENT", body: 1 as unknown as string }),
      Pulls.createReview("o", "r", 0, { commitId: BASE, event: "COMMENT", body: "b" }),
      Pulls.createReview("bad owner", "r", 1, { commitId: BASE, event: "COMMENT", body: "b" }),
      Pulls.findReviewByWrite("o", "r", 1, { writeId: 5 as unknown as string })
    ]
    for (const refusal of refusals) expect((await failure(refusal)).reason).toBe("invalid-config")
    expect(github!.fixture.requests).toHaveLength(0)
  })
})
