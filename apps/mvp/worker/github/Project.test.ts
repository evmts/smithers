// Projecting a re-read (worker/github/Project.ts): a comment listing cut short by its page budget tombstones nothing,
// because a comment it didn't reach may still be on GitHub. The full path runs in worker/github/Flows.test.ts.
import { beforeEach, describe, expect, test } from "vitest"
import { testFile } from "../test/harness.ts"
import { Effect } from "effect"
import { project } from "./Project.ts"
import * as Store from "./Store.ts"
import { admit, comments, REPOSITORY, reset, writeRow } from "./test/fixtures.ts"

const runtime = testFile("github_project")

beforeEach(() => reset(runtime))

const at = new Date().toISOString()
const issue = {
  id: 1,
  node_id: "I_1",
  number: 1,
  title: "Long thread",
  body: "Body",
  state: "open" as const,
  state_reason: null,
  user: null,
  comments: 2,
  created_at: at,
  updated_at: at,
  closed_at: null,
  labels: [],
}
const comment = (id: number) => ({
  id,
  node_id: `IC_${id}`,
  body: `Comment ${id}`,
  user: null,
  created_at: at,
  updated_at: at,
  issue_url: "https://api.github.test/repos/acme/widgets/issues/1",
})

describe("project", () => {
  test("a listing cut short tombstones nothing; a complete one tombstones what it lacks", async () => {
    const fetched = (ids: ReadonlyArray<number>, complete: boolean, fetchedAt: number) =>
      ({ kind: "found", issue, comments: ids.map(comment), complete, fetchedAt }) as const
    await runtime.runPromise(project(REPOSITORY, 1, fetched([1, 2], true, Date.now())))
    expect(await runtime.runPromise(project(REPOSITORY, 1, fetched([1], false, Date.now() + 1_000)))).toEqual({
      outcome: "applied",
      changed: 0,
    })
    expect((await comments(runtime)).map((row) => row.deleted)).toEqual([false, false])
    expect(await runtime.runPromise(project(REPOSITORY, 1, fetched([1], true, Date.now() + 2_000)))).toEqual({
      outcome: "applied",
      changed: 1,
    })
    expect((await comments(runtime)).map((row) => row.deleted)).toEqual([false, true])
  })
})

describe("settleWrite", () => {
  test("a write settles once: a second settling, done or not, writes no row and projects nothing", async () => {
    const writeId = await admit(runtime, {
      actorId: "someone",
      sessionId: null,
      via: "agent",
      payload: { op: "issue/create", title: "Once", body: "" },
    })
    let projected = 0
    const projection = Effect.sync(() => void (projected += 1))
    const done = { status: "done", itemNumber: 4, githubId: 40 } as const
    expect(await runtime.runPromise(Store.settleWrite(writeId, done, projection))).toBe(true)
    expect(await runtime.runPromise(Store.settleWrite(writeId, done, projection))).toBe(false)
    expect(await runtime.runPromise(Store.settleWrite(writeId, { status: "failed", failure: "unavailable" }))).toBe(false)
    expect(projected).toBe(1)
    expect(await writeRow(runtime, writeId)).toMatchObject({ status: "done", itemNumber: 4 })
  })
})
