import { expect, test } from "vitest"
import { railEntries } from "./view"
import { revisionOf } from "./identity"

test("only chat entries join the rail; recorded states and content identities control summaries", () => {
  const base = { id: "a", role: "user", text: "Find release history", status: "done" }
  const summary = { id: "a", revision: revisionOf(base), summary: "Find the release history" }
  expect(railEntries([base], [summary], [])[0]).toMatchObject({ kind: "ask", state: "done", summary: summary.summary })
  expect(railEntries([{ ...base, text: "Changed" }], [summary], [])[0]?.summary).toBeUndefined()
  expect(railEntries([{ ...base, role: "view" }], [], [])).toEqual([])
  for (const [status, state] of [["streaming", "working"], ["failed", "failed"], ["unsent", "failed"], ["queued", "queued"], ["done", "done"]]) {
    expect(railEntries([{ ...base, status: status!, role: "assistant" }], [summary], [])[0]).toMatchObject({ state, kind: "answer", summary: undefined })
  }
  expect(railEntries([base, { ...base, status: "unsent" }], [], []).map(entry => entry.id)).toEqual(["a", "unsent:a"])
  expect(railEntries([base], [], [{ id: "a", state: "needs_you" }])[0]?.state).toBe("waiting")
  expect(railEntries([base], [], [{ id: "a", state: "waiting" }])[0]?.state).toBe("queued")
  expect(railEntries([base], [], [{ id: "other", state: "needs_you" }])[0]?.state).toBe("done")
})

test("timeline carries recorded evidence without inventing missing usage", () => {
  const message = { id: "evidence", role: "assistant", text: "Done", status: "done", createdAt: "2026-10-20 19:58", inputTokens: 200, outputTokens: 40 }
  expect(railEntries([message], [], [])[0]).toMatchObject({ actor: "Smithers", time: message.createdAt, tokens: 240 })
  expect(railEntries([{ ...message, inputTokens: null }], [], [])[0]?.tokens).toBeUndefined()
  expect(railEntries([{ ...message, inputTokens: 0, outputTokens: 0 }], [], [])[0]?.tokens).toBeUndefined()
})
