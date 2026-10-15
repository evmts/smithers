import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, describe, expect, test } from "bun:test"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import type { Card } from "../state/AppState"
import { groupByKind, SearchResultsCardBody } from "./SearchResultsCard"

GlobalRegistrator.register()

afterAll(async () => {
  for (let tick = 0; tick < 3; tick += 1) await new Promise((resolve) => setTimeout(resolve, 0))
  await GlobalRegistrator.unregister()
})

type ResultsCard = Extract<Card, { kind: "search-results" }>

/** The §9 mock's rows as one search answer. */
const fixture: ResultsCard = {
  id: "search-search",
  kind: "search-results",
  title: "Search · redact",
  status: "active",
  createdAt: 0,
  ordinal: 0,
  payload: {
    query: "redact",
    flow: "search",
    args: "redact",
    items: [
      {
        kind: "history",
        ref: "abc1234",
        title: "Redact secrets before they reach the journal",
        subtitle: "#12 · landed",
        actions: [{ flow: "history.show", label: "Show the history", role: "open" }]
      },
      {
        kind: "file",
        ref: "packages/smithers/journal/src/Redaction.ts",
        title: "packages/smithers/journal/src/Redaction.ts",
        subtitle: "opened 2h ago",
        actions: [
          { flow: "file", args: "packages/smithers/journal/src/Redaction.ts r1", label: "Read a file from a repository", role: "open" },
          { flow: "code.diagnostics", args: "packages/smithers/journal/src/Redaction.ts", label: "Diagnostics", role: "other" }
        ]
      },
      {
        kind: "file",
        ref: "packages/smithers/journal/src/Redaction.test.ts",
        title: "packages/smithers/journal/src/Redaction.test.ts",
        actions: [{ flow: "file", args: "packages/smithers/journal/src/Redaction.test.ts r1", label: "Read a file from a repository", role: "open" }]
      }
    ]
  }
}

const render = (card: ResultsCard) => {
  const calls: Array<[string, string | undefined]> = []
  const host = document.createElement("div")
  document.body.append(host)
  flushSync(() => {
    createRoot(host).render(<SearchResultsCardBody card={card} onRunCommand={(name, args) => calls.push([name, args])} />)
  })
  return { host, calls }
}

describe("the search-results card", () => {
  test("groups the rows by kind in the ranking's order, files before history", () => {
    expect(groupByKind(fixture.payload.items).map((group) => [group.kind, group.items.length])).toEqual([["file", 2], ["history", 1]])
    const { host } = render(fixture)
    const labels = Array.from(host.querySelectorAll(".search-results-group-label")).map((node) => node.textContent)
    expect(labels).toEqual(["Files", "History"])
    expect(host.querySelector("[data-testid='search-results-query']")?.textContent).toBe("/search redact · 3 results")
  })

  test("every action is a button carrying its flow and args, dispatched through onRunCommand", () => {
    const { host, calls } = render(fixture)
    const open = host.querySelector<HTMLButtonElement>("[data-testid='search-item-file-packages/smithers/journal/src/Redaction.ts'] [data-role='open']")
    expect(open?.dataset["flow"]).toBe("file")
    flushSync(() => open?.click())
    expect(calls).toEqual([["file", "packages/smithers/journal/src/Redaction.ts r1"]])
    const history = host.querySelector<HTMLButtonElement>("[data-testid='search-item-history-abc1234'] [data-flow='history.show']")
    flushSync(() => history?.click())
    expect(calls[1]).toEqual(["history.show", undefined])
  })

  test("note rows expose the kind and ref in their test ID", () => {
    const note = { kind: "note" as const, ref: "note-123", title: "Meeting notes", actions: [] }
    const { host } = render({ ...fixture, payload: { ...fixture.payload, items: [note] } })
    expect(host.querySelector("[data-testid='search-item-note-note-123']")?.textContent).toContain("Meeting notes")
  })

  test("the card re-runs its own flow with its own query", () => {
    const { host, calls } = render(fixture)
    const again = host.querySelector<HTMLButtonElement>("[data-testid='search-results-rerun']")
    expect(again?.dataset["flow"]).toBe("search")
    flushSync(() => again?.click())
    expect(calls).toEqual([["search", "redact"]])
  })

  test("an answer with no rows says so and offers only the re-run", () => {
    const { host } = render({ ...fixture, payload: { ...fixture.payload, items: [] } })
    expect(host.querySelector("[data-testid='search-results-empty']")?.textContent).toBe("No results for redact.")
    expect(host.querySelectorAll("[data-role]").length).toBe(0)
  })

  /*
   * A run that refused is the one case where the card has words it did not
   * write. #3891's bug was a stale "0 results" standing as the refusal's own
   * count; the fix must not trade it for the opposite failure, a card that
   * paints whatever text arrived on it. So two things are checked together:
   * the useful cause IS on the screen in place of the count, and it is the
   * seam's presented sentence and nothing else — no detail control, no code,
   * and the fault the seam named rather than one the card guessed.
   */
  const refused = (refusal: ResultsCard["payload"]["refusal"]): ResultsCard =>
    ({ ...fixture, payload: { ...fixture.payload, items: [], ...(refusal === undefined ? {} : { refusal }) } })

  test("a refusal replaces the count with its own truthful cause, carrying the seam's fault", () => {
    const sentence = "The tracker would not list this repository's issues. Something Smithers reads from refused."
    const { host } = render(refused({ sentence, fault: "dependency" }))
    const notice = host.querySelector("[data-testid='search-results-refusal']")
    expect(notice?.textContent).toBe(sentence)
    expect(notice?.getAttribute("data-fault")).toBe("dependency")
    /* The count is a claim about a read that happened; a refusal performed none. */
    expect(host.querySelector("[data-testid='search-results-query']")?.textContent).toBe("/search redact")
    /* "No results" is the other false answer, and it must not appear beside the sentence. */
    expect(host.querySelector("[data-testid='search-results-empty']")).toBeNull()
    /* Retry stays available: the header runs the same flow with the same query. */
    expect(host.querySelector<HTMLButtonElement>("[data-testid='search-results-rerun']")?.dataset["flow"]).toBe("search")
  })

  test("a refusal paints the sentence alone: no raw detail control, and a user fault says the request must change", () => {
    const sentence = "Changes on this wire carry no state to filter with; search without state:."
    const { host } = render(refused({ sentence, fault: "user" }))
    const notice = host.querySelector("[data-testid='search-results-refusal']")
    expect(notice?.getAttribute("data-fault")).toBe("user")
    /*
     * FailureNotice collapses raw text behind a Details when it has any. This
     * card has none to collapse — a server's message, a stack and a request's
     * payload stop at the seam that classified them — so no Details is drawn.
     * A Details here would mean raw text reached the card.
     */
    expect(notice?.querySelector("details")).toBeNull()
    expect(notice?.textContent).toBe(sentence)
  })

  /*
   * The no-Details property above held only while every sentence reaching this
   * card happened to be trimmed upstream. It is the card's own signal for "raw
   * text got through", so it must not depend on that: a verdict whose sentence
   * carries a stray newline — a server's `message` is sliced to 240 characters
   * before it is worded — would otherwise open a Details and print the same
   * words twice, which reads as a raw detail the card never had.
   */
  test("a sentence that arrived with stray whitespace still paints once, with no detail control", () => {
    const sentence = "The tracker would not list this repository's issues. Something Smithers reads from refused."
    const { host } = render(refused({ sentence: `\n  ${sentence}\n`, fault: "dependency" }))
    const notice = host.querySelector("[data-testid='search-results-refusal']")
    expect(notice?.querySelector("details")).toBeNull()
    expect(notice?.textContent).toBe(sentence)
  })
})

const savedFile = (ref: string, args: string, flow = "file"): ResultsCard => ({
  ...fixture, payload: { ...fixture.payload, items: [{ kind: "file", ref, title: ref,
    actions: [{ flow, args, label: "Open", role: "open" }] }] }
})

test("an ambiguous saved file row can be searched again but cannot follow the current repository", () => {
  const { host, calls } = render(savedFile("README.md", "README.md"))
  expect(host.querySelectorAll("[data-role]").length).toBe(0)
  flushSync(() => host.querySelector<HTMLButtonElement>("[data-testid='search-results-rerun']")?.click())
  expect(calls).toEqual([["search", "redact"]])
})

test("a saved global file address becomes an explicit repository argument", () => {
  const { host, calls } = render(savedFile("/alpha/one/docs/README.md", "/alpha/one/docs/README.md"))
  flushSync(() => host.querySelector<HTMLButtonElement>("[data-role='open']")?.click())
  expect(calls).toEqual([["file", "docs/README.md alpha/one"]])
})

test("a saved workspace file keeps its explicit workspace and quoted path", () => {
  const { host, calls } = render(savedFile("notes/read me.md", '\"notes/read me.md\" ws-1', "box.file"))
  flushSync(() => host.querySelector<HTMLButtonElement>("[data-role='open']")?.click())
  expect(calls).toEqual([["file", JSON.stringify({ path: "notes/read me.md", workspaceId: "ws-1", operation: "workspace" })]])
})
