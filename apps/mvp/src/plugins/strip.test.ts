// The host's action strip, as a pure function over the real queue manifest loaded through the real loader and the app's
// registry: which buttons an item gets, their keys, and the note box (decision 0017, "The host owns person-only
// actions").
import { Load } from "@smthrs/plugin"
import { Effect } from "effect"
import { describe, expect, test } from "vitest"
import queue from "../../plugins/queue/plugin.json" with { type: "json" }
import { hostFacts } from "./facts"
import { keyLabel, personOnly, stripOf, textFields } from "./strip"

const facts = hostFacts()
const loaded = Effect.runSync(Load.load(facts, [{ tier: "built-in", manifest: queue }]))
const view = loaded.contributions.views[0]!
const keys = loaded.contributions.keybindings

const question = {
  runId: "r1", version: 1, execution: "e1", kind: "question", prompt: "Which branch?",
  options: ["main", "docs-v2"], question: true, approval: false, createdAt: "2026-10-21T00:00:00.000Z",
}
const approval = { ...question, runId: "r2", kind: "approval", prompt: "Delete it?", options: [], question: false, approval: true }

describe("the strip", () => {
  test("the queue's manifest loads with nothing refused", () => {
    expect(loaded.refused).toEqual([])
    expect(view.id).toBe("queue/queue")
  })

  test("a question gets a button per option, keyed 1 to 9, Reply on ⌘↵, and the note", () => {
    expect(stripOf(view, keys, question)).toEqual({
      buttons: [
        { event: "option", fields: { index: 0 }, label: "main", key: "1" },
        { event: "option", fields: { index: 1 }, label: "docs-v2", key: "2" },
        { event: "reply", fields: {}, label: "Reply", key: "⌘↵" },
      ],
      note: true,
    })
  })

  test("an approval gets Approve on a and Changes on r, and the note", () => {
    expect(stripOf(view, keys, approval)).toEqual({
      buttons: [
        { event: "approve", fields: {}, label: "Approve", key: "a" },
        { event: "changes", fields: {}, label: "Changes", key: "r" },
      ],
      note: true,
    })
  })

  test("no item, no strip", () => {
    expect(stripOf(view, keys, undefined)).toEqual({ buttons: [], note: false })
  })

  test("at most nine choices, and none when the item's list isn't one", () => {
    const many = { ...question, options: Array.from({ length: 12 }, (_, index) => `o${index}`) }
    expect(stripOf(view, keys, many).buttons.filter((button) => button.event === "option")).toHaveLength(9)
    expect(stripOf(view, keys, { ...question, options: "main" }).buttons.map((button) => button.event)).toEqual(["reply"])
  })

  test("an event with no key always shows, and without a key label; a choice with no digit key has no key", () => {
    const unkeyed = keys.filter((binding) => !("event" in binding) || !["approve", "option"].includes(binding.event))
    expect(stripOf(view, unkeyed, approval).buttons.map(({ event, key }) => ({ event, key }))).toEqual([
      { event: "approve", key: undefined },
      { event: "changes", key: "r" },
    ])
    expect(stripOf(view, unkeyed, question).buttons.filter((button) => button.event === "option")).toEqual([
      { event: "option", fields: { index: 0 }, label: "main" },
      { event: "option", fields: { index: 1 }, label: "docs-v2" },
    ])
  })

  test("the strip's events are the ones the loader marked person-only", () => {
    const local = view.events.find((event) => event.name === "next")!
    expect(personOnly(local)).toBe(false)
    expect(personOnly(view.events.find((event) => event.name === "option")!)).toBe(true)
    expect(personOnly({ name: "go", flow: "app/navigate", args: {}, personOnly: false })).toBe(false)
  })

  test("text fields are the payload's strings", () => {
    const option = view.events.find((event) => event.name === "option")! as never
    const reply = view.events.find((event) => event.name === "reply")! as never
    expect(textFields(option)).toEqual([])
    expect(textFields(reply)).toEqual(["note"])
    expect(textFields({ name: "x", flow: "run/answer", args: {} } as never)).toEqual([])
  })

  test("another view's binding of an event with the same name never changes this view's strip", () => {
    const foreign = keys.map((binding) => ({ ...binding, view: "other/view" }))
    expect(stripOf(view, [...keys, ...foreign], approval)).toEqual(stripOf(view, keys, approval))
  })

  test("keys read as the person reads them", () => {
    expect(keyLabel("mod+enter")).toBe("⌘↵")
    expect(keyLabel("g q")).toBe("g q")
    expect(keyLabel("ctrl+alt+shift+escape")).toBe("⌃⌥⇧Esc")
  })
})
