import { afterEach, describe, expect, test } from "vitest"
import { openMemoryStore } from "../../test/memoryStore"
import { ask, closeComposer, openComposer, setDraft, toggleComposer } from "./actions"
import { turnsBefore } from "./answerer"
import { awaiting$, composer$, conversation$ } from "./queries"
import { CHAT_FAILED, events, QUESTION_MAX_LENGTH } from "./schema"

type Store = Awaited<ReturnType<typeof openMemoryStore>>
const open: Array<Store> = []
const storeFor = async (sessionId?: string) => {
  const store = await openMemoryStore(sessionId)
  open.push(store)
  return store
}
afterEach(async () => {
  await Promise.all(open.splice(0).map((store) => store.shutdownPromise()))
})

const answerOf = (store: Store, question: string) => {
  const conversation = store.query(conversation$)
  return conversation[conversation.findIndex((message) => message.text === question) + 1]!
}

describe("asking", () => {
  test("adds the question and an empty answer this session awaits, and clears the draft", async () => {
    const store = await storeFor("tab-a")
    setDraft(store, "hello")
    ask(store, "hello")
    const [question, answer] = store.query(conversation$)
    expect(question).toMatchObject({ role: "user", text: "hello", status: "done" })
    expect(answer).toMatchObject({ role: "assistant", text: "", status: "streaming", askedBy: "tab-a" })
    expect(store.query(composer$).draft).toBe("")
    expect(store.query(awaiting$("tab-a")).map(({ id }) => id)).toEqual([answer!.id])
    expect(store.query(awaiting$("tab-b"))).toEqual([])
  })

  test("keeps every question before its own answer, in the order asked", async () => {
    const store = await storeFor()
    for (const text of ["one", "two", "three"]) ask(store, text)
    expect(store.query(conversation$).map(({ role, text }) => `${role}:${text}`)).toEqual([
      "user:one", "assistant:", "user:two", "assistant:", "user:three", "assistant:",
    ])
  })
})

describe("asking refuses", () => {
  test.each([["a blank question", "   \n "], ["a question over the limit", "x".repeat(QUESTION_MAX_LENGTH + 1)]])(
    "%s, commits nothing and keeps the draft",
    async (_, text) => {
      const store = await storeFor()
      setDraft(store, text)
      expect(ask(store, text)).toBe(false)
      expect(store.query(conversation$)).toEqual([])
      expect(store.query(composer$).draft).toBe(text)
    },
  )

  test("nothing at the limit, and trims what it asks", async () => {
    const store = await storeFor()
    expect(ask(store, ` ${"x".repeat(QUESTION_MAX_LENGTH)} `)).toBe(true)
    expect(store.query(conversation$)[0]?.text).toBe("x".repeat(QUESTION_MAX_LENGTH))
  })
})

describe("answers", () => {
  test("grow by deltas in order, then complete with the text kept", async () => {
    const store = await storeFor()
    ask(store, "q")
    const { id } = answerOf(store, "q")
    for (const text of ["Hel", "lo ", "wörld 👋"]) store.commit(events.answerDelta({ id, text }))
    expect(answerOf(store, "q")).toMatchObject({ text: "Hello wörld 👋", status: "streaming" })
    store.commit(events.answerCompleted({ id }))
    expect(answerOf(store, "q")).toMatchObject({ text: "Hello wörld 👋", status: "done" })
    expect(store.query(awaiting$("test-session"))).toEqual([])
  })

  test("a failed answer shows the failure copy and is no longer awaited", async () => {
    const store = await storeFor()
    ask(store, "q")
    const { id } = answerOf(store, "q")
    store.commit(events.answerDelta({ id, text: "partial" }))
    store.commit(events.answerFailed({ id }))
    expect(answerOf(store, "q")).toMatchObject({ text: CHAT_FAILED, status: "failed" })
    expect(store.query(awaiting$("test-session"))).toEqual([])
  })
})

describe("a settled answer", () => {
  const settled = async (end: "completed" | "failed") => {
    const store = await storeFor()
    ask(store, "q")
    const { id } = answerOf(store, "q")
    store.commit(events.answerDelta({ id, text: "kept" }))
    store.commit(end === "completed" ? events.answerCompleted({ id }) : events.answerFailed({ id }))
    return { store, id }
  }

  test("ignores later deltas, failure and completion once done", async () => {
    const { store, id } = await settled("completed")
    store.commit(events.answerDelta({ id, text: " late" }), events.answerFailed({ id }), events.answerCompleted({ id }))
    expect(answerOf(store, "q")).toMatchObject({ text: "kept", status: "done" })
  })

  test("ignores later deltas and completion once failed", async () => {
    const { store, id } = await settled("failed")
    store.commit(events.answerDelta({ id, text: " late" }), events.answerCompleted({ id }))
    expect(answerOf(store, "q")).toMatchObject({ text: CHAT_FAILED, status: "failed" })
  })
})

describe("the composer", () => {
  test("opens, hides, toggles and keeps a draft", async () => {
    const store = await storeFor()
    expect(store.query(composer$)).toEqual({ open: false, draft: "" })
    openComposer(store)
    setDraft(store, "half a thought")
    expect(store.query(composer$)).toEqual({ open: true, draft: "half a thought" })
    closeComposer(store)
    expect(store.query(composer$).open).toBe(false)
    toggleComposer(store, false)
    expect(store.query(composer$).open).toBe(true)
    toggleComposer(store, true)
    expect(store.query(composer$)).toEqual({ open: false, draft: "half a thought" })
  })
})

describe("what the model sees (turnsBefore)", () => {
  const message = (id: string, role: "user" | "assistant", text: string, status = "done") => ({ id, role, text, status })

  test("finished exchanges, then the question being answered", () => {
    const conversation = [
      message("q1", "user", "first"), message("a1", "assistant", "one"),
      message("q2", "user", "second"), message("a2", "assistant", "", "streaming"),
    ]
    expect(turnsBefore(conversation, "a2")).toEqual([
      { role: "user", content: "first" }, { role: "assistant", content: "one" }, { role: "user", content: "second" },
    ])
  })

  test("leaves out a question whose answer failed or is still streaming elsewhere", () => {
    const conversation = [
      message("q1", "user", "count to 3000"), message("a1", "assistant", "Smithers couldn't answer.", "failed"),
      message("q2", "user", "on another device"), message("a2", "assistant", "partial", "streaming"),
      message("q3", "user", "say hi"), message("a3", "assistant", "", "streaming"),
    ]
    expect(turnsBefore(conversation, "a3")).toEqual([{ role: "user", content: "say hi" }])
  })

  test("ignores everything after the answer", () => {
    const conversation = [
      message("q1", "user", "first"), message("a1", "assistant", "", "streaming"),
      message("q2", "user", "later"), message("a2", "assistant", "later answer"),
    ]
    expect(turnsBefore(conversation, "a1")).toEqual([{ role: "user", content: "first" }])
  })

  const exchange = (n: number, question: string, answer: string) => [
    message(`q${n}`, "user", question),
    message(`a${n}`, "assistant", answer),
  ]
  const lastQuestion = [message("qz", "user", "now"), message("az", "assistant", "", "streaming")]

  test("keeps at most 19 exchanges, the most recent ones", () => {
    const conversation = [...Array.from({ length: 25 }, (_, n) => exchange(n, `q${n}`, `a${n}`)).flat(), ...lastQuestion]
    const turns = turnsBefore(conversation, "az")
    expect(turns).toHaveLength(39)
    expect(turns[0]).toEqual({ role: "user", content: "q6" })
    expect(turns.at(-1)).toEqual({ role: "user", content: "now" })
  })

  test("leaves out a whole exchange whose answer is too long to send", () => {
    const conversation = [...exchange(1, "short", "ok"), ...exchange(2, "long", "x".repeat(32_001)), ...lastQuestion]
    expect(turnsBefore(conversation, "az").map(({ content }) => content)).toEqual(["short", "ok", "now"])
  })

  test("stops at the oldest exchange that would pass the total length", () => {
    const big = "x".repeat(30_000)
    const conversation = [...exchange(1, "oldest", "ok"), ...[2, 3, 4, 5].flatMap((n) => exchange(n, `q${n}`, big)), ...lastQuestion]
    const contents = turnsBefore(conversation, "az").map(({ content }) => content)
    expect(contents).not.toContain("oldest")
    expect(contents).not.toContain("q2")
    expect(contents.filter((content) => content === big)).toHaveLength(3)
    expect(contents.at(-1)).toBe("now")
  })
})
