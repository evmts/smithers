// What the stack's screens show (src/features/todos/view.ts) and the contract's helpers, as pure functions over rows;
// and how a send's refusal and a shape's answer read (writes.ts `reasonOf`, store.ts `accessOf`). The rows they read
// come from real devices in todos.test.ts.
import { describe, expect, test } from "vitest"
import {
  isAcceptance,
  isPrompt,
  isTitle,
  MAX_ACCEPTANCE,
  MAX_PROMPT_BYTES,
  MAX_TITLE_LENGTH,
  notSentOf,
  stackPath,
  stackRoute,
  titleOf,
  todoNumberOf,
  todoPath,
  todosChannel,
} from "./contract"
import type { Draft, Requested, Sending, Todo, TodoRequest } from "./schema"
import { accessOf } from "./store"
import {
  accessFor,
  deliveredOf,
  draftsOfAnswer,
  draftsOfRepo,
  mayChange,
  notSentRows,
  stackRows,
  todoCardOf,
} from "./view"
import { reasonOf } from "./writes"

const REPO = "github/octo/hello"

const todo = (fields: Partial<Todo> & Pick<Todo, "id" | "number">): Todo => ({
  repoId: REPO,
  title: `T${fields.number}`,
  state: "queued",
  step: null,
  position: fields.number,
  revision: 1,
  attempt: 0,
  branch: null,
  prNumber: null,
  failure: null,
  note: null,
  createdLogin: "maya",
  createdAt: "2026-10-20 10:00:00+00",
  updatedAt: "2026-10-20 10:00:00+00",
  settledAt: null,
  ...fields,
})

const sending = (fields: Partial<Sending> & Pick<Sending, "id" | "op">): Sending => ({
  repo: "octo/hello",
  title: "",
  prompt: "",
  acceptance: [],
  number: 0,
  repoId: REPO,
  queuedAt: 1,
  v: 1,
  ...fields,
})

const requested = (fields: Partial<Requested> & Pick<Requested, "id" | "op">): Requested => {
  const { v: _, ...row } = sending(fields)
  return { ...row, status: "requested", reason: null, taken: null, ...fields }
}

describe("stackRows", () => {
  test("open TODOs in order, then this device's unnumbered commits as made, then settled ones latest first", () => {
    const todos = [
      todo({ id: "c", number: 3, position: 1 }),
      todo({ id: "a", number: 1, state: "dropped", position: null }),
      todo({ id: "d", number: 4, position: 2 }),
      todo({ id: "b", number: 2, state: "merged", position: null }),
      todo({ id: "x", number: 9, repoId: "github/octo/other" }),
    ]
    const rows = stackRows(REPO, todos, [sending({ id: "late", op: "commit", title: "Late", queuedAt: 5 })], [
      requested({ id: "early", op: "commit", title: "Early", queuedAt: 2, status: "not_sent", reason: "stack_full" }),
      requested({ id: "elsewhere", op: "commit", title: "Elsewhere", repoId: "github/octo/other" }),
    ])
    expect(rows).toEqual([
      { id: "c", number: 3, title: "T3", state: "queued" },
      { id: "d", number: 4, title: "T4", state: "queued" },
      { id: "early", number: null, title: "Early", state: "queued", pending: "not_sent" },
      { id: "late", number: null, title: "Late", state: "queued", pending: "requested" },
      { id: "b", number: 2, title: "T2", state: "merged" },
      { id: "a", number: 1, title: "T1", state: "dropped" },
    ])
  })

  test("a commit the stack has shows once, as the stack's row; the outbox's copy of a kept change shows once", () => {
    const rows = stackRows(REPO, [todo({ id: "a", number: 1 })], [sending({ id: "a", op: "commit" })], [
      requested({ id: "a", op: "commit" }),
    ])
    expect(rows).toEqual([{ id: "a", number: 1, title: "T1", state: "queued" }])
  })

  test("a drop on its way shows on its TODO until the TODO is dropped", () => {
    const pending = [requested({ id: "drop-1", op: "drop", number: 1 })]
    expect(stackRows(REPO, [todo({ id: "a", number: 1 })], [], pending)).toEqual([
      { id: "a", number: 1, title: "T1", state: "queued", pending: "requested" },
    ])
    expect(stackRows(REPO, [todo({ id: "a", number: 1, state: "dropped", position: null })], [], pending)).toEqual([
      { id: "a", number: 1, title: "T1", state: "dropped" },
    ])
  })
})

describe("notSentRows and deliveredOf", () => {
  test("names each refused change, a commit by its title and a drop as Drop Tn, in the order made", () => {
    expect(
      notSentRows(REPO, [
        requested({ id: "b", op: "drop", number: 4, queuedAt: 3, status: "not_sent", reason: "merged" }),
        requested({ id: "a", op: "commit", title: "Retry", queuedAt: 1, status: "not_sent", reason: "forbidden" }),
        requested({ id: "c", op: "commit", status: "requested" }),
        requested({ id: "d", op: "commit", status: "not_sent", reason: "invalid", repoId: "github/octo/other" }),
      ]),
    ).toEqual([
      { id: "a", op: "commit", label: "Retry", reason: "Not allowed" },
      { id: "b", op: "drop", label: "Drop T4", reason: "Merged" },
    ])
  })

  test("delivered: a commit whose TODO is there, a drop whose TODO is dropped, this repository's only", () => {
    const todos = [todo({ id: "a", number: 1 }), todo({ id: "b", number: 2, state: "dropped", position: null })]
    expect(
      deliveredOf(REPO, todos, [
        requested({ id: "a", op: "commit" }),
        requested({ id: "z", op: "commit" }),
        requested({ id: "d1", op: "drop", number: 1 }),
        requested({ id: "d2", op: "drop", number: 2 }),
        requested({ id: "o", op: "commit", repoId: "github/octo/other" }),
      ]),
    ).toEqual(["a", "d2"])
  })
})

describe("todoCardOf", () => {
  const request = (fields: Partial<TodoRequest> = {}): TodoRequest => ({
    todoId: "a",
    revision: 1,
    repoId: REPO,
    prompt: "Do it",
    acceptance: ["done"],
    byLogin: "maya",
    createdAt: "2026-10-20 10:00:00+00",
    ...fields,
  })

  test("the TODO the route names with its latest prompt, once the device has both", () => {
    const todos = [todo({ id: "a", number: 1, revision: 2 })]
    const rows = [{ id: "a", number: 1, title: "T1", state: "queued" as const, pending: "requested" as const }]
    expect(todoCardOf(1, rows, todos, [request(), request({ revision: 2, prompt: "Do it better" })])).toEqual({
      id: "a",
      number: 1,
      title: "T1",
      state: "queued",
      prompt: "Do it better",
      acceptance: ["done"],
      pending: "requested",
    })
    expect(todoCardOf(1, [], todos, [request({ revision: 2 })])).not.toHaveProperty("pending")
    expect(todoCardOf(1, rows, todos, [request()])).toBeUndefined()
    expect(todoCardOf(2, rows, todos, [request()])).toBeUndefined()
    expect(todoCardOf(null, rows, todos, [request()])).toBeUndefined()
  })
})

describe("drafts, access and who may change a stack", () => {
  const draft = (fields: Partial<Draft> & Pick<Draft, "id">): Draft => ({
    repo: "octo/hello",
    repoId: REPO,
    title: "",
    prompt: "",
    acceptance: [],
    answerId: null,
    createdAt: 1,
    ...fields,
  })

  test("a repository's drafts newest first; an answer's in the order made", () => {
    const drafts = [
      draft({ id: "a", createdAt: 1, answerId: "answer" }),
      draft({ id: "b", createdAt: 3 }),
      draft({ id: "c", createdAt: 2, answerId: "answer" }),
      draft({ id: "d", createdAt: 4, repoId: "github/octo/other" }),
    ]
    expect(draftsOfRepo(REPO, drafts).map(({ id }) => id)).toEqual(["b", "c", "a"])
    expect(draftsOfAnswer("answer", drafts).map(({ id }) => id)).toEqual(["a", "c"])
  })

  test("access is unknown until the shape says", () => {
    expect(accessFor(REPO, [])).toBe("unknown")
    expect(accessFor(REPO, [{ id: REPO, status: "forbidden" }, { id: "x", status: "allowed" }])).toBe("forbidden")
  })

  test("a shape's answer: allowed once it succeeds, sign in on 401, forbidden on 403, else nothing new", () => {
    const stopped = (status?: number) => ({ _tag: "Stopped", error: { status } }) as never
    expect(accessOf({ _tag: "Succeeded" })).toBe("allowed")
    expect(accessOf(stopped(401))).toBe("sign_in")
    expect(accessOf(stopped(403))).toBe("forbidden")
    expect(accessOf(stopped())).toBeUndefined()
    expect(accessOf({ _tag: "Failed" } as never)).toBeUndefined()
  })

  test("a Member and above may change a stack, as sign-in says or, while it can't, as last confirmed", () => {
    const session = (status: "loading" | "signed_in" | "signed_out" | "unreachable", role: "member" | "guest" | null) => ({
      status,
      role,
    })
    expect(mayChange(session("signed_in", "member"), undefined)).toBe(true)
    expect(mayChange(session("signed_in", "guest"), undefined)).toBe(false)
    expect(mayChange(session("signed_in", null), undefined)).toBe(false)
    expect(mayChange(session("signed_out", null), { role: "member" })).toBe(false)
    expect(mayChange(session("unreachable", null), { role: "maintainer" })).toBe(true)
    expect(mayChange(session("loading", null), undefined)).toBe(false)
  })
})

describe("a send's refusal", () => {
  test("reads the code its body names, else its status; the rest is sent again", () => {
    expect(reasonOf(409, "stack_full")).toBe("stack_full")
    expect(reasonOf(409, "merged")).toBe("merged")
    expect(reasonOf(503, "unavailable")).toBeUndefined()
    expect([400, 401, 403, 404, 409, 413].map((status) => reasonOf(status, undefined))).toEqual([
      "invalid",
      "authentication",
      "forbidden",
      "not_found",
      "conflict",
      "too_large",
    ])
    expect([undefined, 429, 500, 502].map((status) => reasonOf(status, undefined))).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ])
    expect(notSentOf("nope")).toBeUndefined()
  })
})

describe("the contract", () => {
  test("paths and routes", () => {
    expect(stackRoute("o w", "n")).toBe("/api/repos/o%20w/n/stack")
    expect(stackPath("octo", "hello")).toBe("/octo/hello/stack")
    expect(todoPath("octo", "hello", 4)).toBe("/octo/hello/stack/4")
    expect(todosChannel("engine")).toBe("engine/todos")
  })

  test("a route's number is 1 to the integer limit, written plainly", () => {
    expect(["1", "42", "2147483647"].map(todoNumberOf)).toEqual([1, 42, 2_147_483_647])
    expect(["0", "01", "-1", "1.5", "x", "2147483648", "12345678901"].map(todoNumberOf)).toEqual(
      Array.from({ length: 7 }, () => undefined),
    )
  })

  test("a draft's title is its prompt's first line without heading marks, cut to the limit", () => {
    expect(titleOf("  ## Retry webhooks\n\nThree times.")).toBe("Retry webhooks")
    expect(titleOf("x".repeat(MAX_TITLE_LENGTH + 5))).toBe(`${"x".repeat(MAX_TITLE_LENGTH - 1)}…`)
    expect(titleOf("x".repeat(MAX_TITLE_LENGTH))).toHaveLength(MAX_TITLE_LENGTH)
  })

  test("bounds on titles, prompts and criteria", () => {
    expect([isTitle("ok"), isTitle("  "), isTitle("x".repeat(MAX_TITLE_LENGTH + 1))]).toEqual([true, false, false])
    expect([isPrompt("ok"), isPrompt(" \n"), isPrompt("é".repeat(MAX_PROMPT_BYTES / 2 + 1))]).toEqual([true, false, false])
    expect([
      isAcceptance([]),
      isAcceptance(["a"]),
      isAcceptance([" "]),
      isAcceptance(["x".repeat(301)]),
      isAcceptance(Array.from({ length: MAX_ACCEPTANCE + 1 }, () => "a")),
    ]).toEqual([true, true, false, false, false])
  })
})
