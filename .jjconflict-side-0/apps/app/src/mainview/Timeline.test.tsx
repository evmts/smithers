import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Window } from "happy-dom"
import { fixtures } from "@smthrs/rpc/fixtures/Timeline"
import type { TimelineLine } from "@smthrs/rpc/TimelineCard"
import { followBand, spanOf, Timeline } from "./Timeline"

/*
 * A zoomed line (T-UI-08 zoom, #3728) stands for a run of entries: it says how many and when, names itself for a
 * screen reader, marks its level, and keeps its act as a control of its own. Its markup is read from a server render
 * in a window of its own, so this file leaves no global DOM behind for the suites that run after it (a registered
 * window breaks their registration, and a torn-down one breaks React DOM for them). The click contract, a line jumps
 * to its first entry and its act calls the flow without jumping, is driven for the `zoomed` fixture by
 * cards/views/Views.test.tsx through Timeline.stories.tsx, as for every other line.
 */

const CLOCK = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" })
const DAY = new Intl.DateTimeFormat([], { month: "short", day: "numeric" })
const clock = (at: number): string => CLOCK.format(at)
const day = (at: number): string => DAY.format(at)

const render = (lines: ReadonlyArray<TimelineLine>, on_screen: readonly [string, string] = ["", ""]) => {
  const window = new Window()
  window.document.body.innerHTML = renderToStaticMarkup(<Timeline lines={[...lines]} on_screen={[on_screen[0], on_screen[1]]} onAction={() => {}} onView={() => {}} />)
  return window.document.body
}

const zoomed = fixtures.zoomed.model.lines
const byId = (id: string): TimelineLine => zoomed.find(line => line.entry_id === id)!

describe("a zoomed timeline line", () => {
  test("carries its level, count and same-day span, and names itself by them", () => {
    const body = render(zoomed, fixtures.zoomed.model.on_screen)
    for (const line of zoomed) {
      const item = body.querySelector(`li[data-entry="${line.entry_id}"]`)!
      const button = item.querySelector(":scope > button")!
      expect(item.getAttribute("data-zoom")).toBe(line.zoom === undefined ? null : String(line.zoom.level))
      expect(item.getAttribute("data-kind")).toBe(line.kind)
      expect(item.getAttribute("data-tone")).toBe(line.tone)
      expect(button.getAttribute("type")).toBe("button")
      if (line.zoom === undefined) {
        expect(button.getAttribute("aria-label")).toBeNull()
        expect(item.querySelector(".tl-zoom")).toBeNull()
        continue
      }
      const { count, from, to } = line.zoom
      // The locale's own range: one meridiem when both ends share it (`9:10 – 10:32 AM`), two when they differ.
      const span = CLOCK.formatRange(from!, to!)
      expect(span).toContain(clock(to!))
      expect(item.querySelector(".tl-zoom")!.textContent).toBe(`${count} entries · ${span}`)
      expect(item.querySelector(".tl-zoom time")!.textContent).toBe(span)
      // Named by what it shows: the title, then "N entries · span" (no aria-label; C-UI-02 caps a name at 12 words).
      expect(button.getAttribute("aria-label")).toBeNull()
      expect(button.textContent).toContain(line.zoom ? line.title : line.summary ?? line.title)
      expect(button.textContent).toContain(`${count} entries · ${span}`)
      // The stacked node: one bar per level above the entry, capped at the coarsest look; no entry glyph beside it.
      expect(item.querySelectorAll(".tl-node, svg, .avatar")).toHaveLength(0)
      expect(item.querySelector(".tl-node .lucide-check, .tl-node .lucide-x, .tl-node .lucide-circle-alert, .tl-node .avatar")).toBeNull()
      // The run's summary stays with the model; the count and span are the words.
      expect(item.querySelectorAll(".tl-text > span:not(.tl-zoom)")).toHaveLength(0)
    }
    // The band and freshness read as before.
    expect([...body.querySelectorAll("li[data-in-view]")].map(item => item.getAttribute("data-entry"))).toEqual(["entry-756", "entry-757"])
    expect(body.querySelector("li[data-fresh]")!.getAttribute("data-entry")).toBe("entry-757")
    // Short chats are unchanged: no zoom attribute, no stacked node.
    const plain = render(fixtures.timeline.model.lines, fixtures.timeline.model.on_screen)
    expect(plain.querySelectorAll("li[data-zoom], .tl-stack, .tl-zoom")).toHaveLength(0)
    expect(plain.querySelectorAll("li[data-entry]")).toHaveLength(fixtures.timeline.model.lines.length)
  })

  test("a level past 3 keeps its number and wears the coarsest node", () => {
    const deep: TimelineLine = { ...byId("entry-1"), zoom: { ...byId("entry-1").zoom!, level: 5 } }
    const body = render([deep])
    const item = body.querySelector("li[data-entry]")!
    expect(item.getAttribute("data-zoom")).toBe("5")
    expect(item.querySelectorAll("svg, .tl-node")).toHaveLength(0)
    expect(body.querySelector('li[data-entry="entry-1"] button')!.textContent).toContain(`237 entries · ${CLOCK.formatRange(deep.zoom!.from!, deep.zoom!.to!)}`)
  })

  test("a span across days reads as dates, and a line without times has no span", () => {
    const from = new Date(2026, 9, 3, 23, 50).getTime(), to = new Date(2026, 9, 5, 0, 10).getTime()
    expect(spanOf({ from, to })).toEqual({ text: DAY.formatRange(from, to), from: day(from), to: day(to) })
    expect(DAY.formatRange(from, to)).toContain(day(from))
    const noon = [new Date(2026, 9, 5, 11, 48).getTime(), new Date(2026, 9, 5, 12, 5).getTime()] as const
    expect(spanOf({ from: noon[0], to: noon[1] })).toEqual({ text: CLOCK.formatRange(noon[0], noon[1]), from: clock(noon[0]), to: clock(noon[1]) })
    // Ends out of order still read forwards; one instant reads once.
    expect(spanOf({ from: noon[1], to: noon[0] })).toEqual(spanOf({ from: noon[0], to: noon[1] }))
    expect(spanOf({ from: noon[0], to: noon[0] })!.text).toBe(clock(noon[0]))
    expect(spanOf({ from })).toBeUndefined()
    expect(spanOf({})).toBeUndefined()
    const dated: TimelineLine = { ...byId("entry-1"), zoom: { level: 3, count: 237, last_entry_id: "entry-237", from, to } }
    const timeless: TimelineLine = { ...byId("entry-404"), zoom: { level: 3, count: 289, last_entry_id: "entry-692" } }
    const body = render([dated, timeless])
    expect(body.querySelector('li[data-entry="entry-1"] .tl-zoom')!.textContent).toBe(`237 entries · ${DAY.formatRange(from, to)}`)
    expect(body.querySelector('li[data-entry="entry-1"] button')!.textContent).toContain(dated.title)
    expect(body.querySelector('li[data-entry="entry-404"] .tl-zoom')!.textContent).toBe("289 entries")
    expect(body.querySelector('li[data-entry="entry-404"] button')!.textContent).toContain(timeless.title)
  })

  test("a title the fast model wrote wears the written mark before it; the run's own title wears none (#3732)", () => {
    const written: TimelineLine = { ...byId("entry-1"), title: "Hardened webhook retries", zoom: { ...byId("entry-1").zoom!, written: true } }
    const body = render([written, byId("entry-404"), ...fixtures.timeline.model.lines])
    const title = body.querySelector('li[data-entry="entry-1"] .tl-text b')!
    expect(title.textContent).toBe("Hardened webhook retries")
    expect(title.firstElementChild).toBeNull()
    expect(body.querySelector('li[data-entry="entry-1"] button')!.textContent).toContain("Hardened webhook retries")
    expect(body.querySelectorAll(".written")).toHaveLength(0)
    expect(body.querySelector('li[data-entry="entry-404"] .tl-text b')!.textContent).toBe(byId("entry-404").title)
  })

  test("a run's act is its own control beside the line, never inside it", () => {
    const body = render(zoomed, fixtures.zoomed.model.on_screen)
    const asking = body.querySelector('li[data-entry="entry-733"]')!
    const act = asking.querySelector('.tl-actions > button[data-flow="todo.answer"]')!
    expect(act.textContent).toBe("Answer")
    expect(act.getAttribute("disabled")).toBeNull()
    expect(asking.querySelector(":scope > button button")).toBeNull()
    expect(asking.querySelectorAll("button")).toHaveLength(2)
    // A run whose act no longer applies shows none, and a line is one control.
    expect(body.querySelector('li[data-entry="entry-717"] button[data-flow]')).toBeNull()
    expect(body.querySelectorAll('li[data-entry="entry-717"] button')).toHaveLength(1)
  })
})


test("one concise primary summary replaces the copied title without any author or state icon", () => {
 const body=render([{entry_id:"p",kind:"prompt",title:"Use the theme command to change my theme to dark",summary:"Switch to dark mode",tone:"quiet",glyph:{event:"ok"}}])
 expect(body.querySelector("button")!.textContent).toBe("Switch to dark mode")
 expect(body.querySelectorAll("svg,.avatar,.tl-node,[data-summary]")).toHaveLength(0)
 expect(body.textContent).not.toContain("Use the theme command")
})

test("the rail follows a band below or above its own viewport without scrolling the transcript", () => {
 const window=new Window(), rail=window.document.createElement("nav")
 rail.innerHTML='<ol><li data-in-view></li><li data-in-view></li></ol>'
 Object.defineProperty(rail,"clientHeight",{value:100})
 const rows=rail.querySelectorAll("li")
 Object.defineProperty(rows[0],"offsetTop",{value:250})
 Object.defineProperty(rows[1],"offsetTop",{value:280})
 Object.defineProperty(rows[1],"offsetHeight",{value:30})
 followBand(rail as unknown as HTMLElement)
 expect(rail.scrollTop).toBe(210)
 rail.scrollTop=400
 followBand(rail as unknown as HTMLElement)
 expect(rail.scrollTop).toBe(250)
 followBand(null)
})
