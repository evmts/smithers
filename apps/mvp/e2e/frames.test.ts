import { describe, expect, it } from "vitest"
import {
  BLANK_DETAIL,
  CAPTION_ROWS,
  chapterAt,
  chaptersOf,
  combine,
  type Frame,
  GIF_PACE,
  holdChapters,
  isBlank,
  type Mark,
  MAX_GIF_BYTES,
  MAX_STILL_FRAMES,
  MEASURE_HEIGHT,
  MEASURE_WIDTH,
  measure,
  outputStarts,
  plan,
  problems,
  QUIET_CHANGE,
  RECORDING_LAG,
  retime,
  VIDEO_PACE,
  videoProblems,
} from "./frames.ts"

const PIXELS = MEASURE_WIDTH * MEASURE_HEIGHT

const blank: Frame = { detail: 0, changed: 0 }
const shown = (changed: number): Frame => ({ detail: 500, changed })
/** A new screen: everything moved. */
const cut = shown(PIXELS)
const still = shown(0)
const shownFrames = (repeat: ReadonlyArray<number>) => repeat.reduce((sum, count) => sum + count, 0)

describe("measure", () => {
  it("counts detail away from the frame's shade, above the caption rows, and pixels changed since the frame before", () => {
    const white = new Uint8Array(PIXELS).fill(255)
    expect(measure(white, undefined)).toEqual({ detail: 0, changed: PIXELS })
    expect(measure(white, white)).toEqual({ detail: 0, changed: 0 })

    const text = white.slice()
    for (let index = 0; index < 40; index++) text[MEASURE_WIDTH * 10 + index] = 0
    // Video noise under the change level moves nothing.
    const noisy = text.slice()
    noisy[0] = 250
    expect(measure(text, white)).toEqual({ detail: 40, changed: 40 })
    expect(measure(noisy, text)).toEqual({ detail: 40, changed: 0 })

    // A caption strip at the bottom is not detail: a blank page under a caption is still blank.
    const captioned = white.slice()
    captioned.fill(17, (MEASURE_HEIGHT - CAPTION_ROWS) * MEASURE_WIDTH)
    expect(measure(captioned, white).detail).toBe(0)
    expect(isBlank(measure(captioned, white))).toBe(true)
    expect(isBlank({ detail: BLANK_DETAIL, changed: 0 })).toBe(false)

    // A device's name badge in the top-right corner is not detail either: a white page under a badge is blank.
    const badged = white.slice()
    for (let row = 1; row < 5; row++) badged.fill(31, row * MEASURE_WIDTH + MEASURE_WIDTH - 20, row * MEASURE_WIDTH + MEASURE_WIDTH - 2)
    expect(measure(badged, white).detail).toBe(72)
    expect(measure(badged, white, { width: 24, height: 6 })).toEqual({ detail: 0, changed: 72 })
    expect(measure(badged, white, { width: 10, height: 6 }).detail).toBe(40)
  })
})

describe("combine", () => {
  it("is blank only when every pane is, and sums the panes' detail and change", () => {
    expect(combine([blank, { detail: 0, changed: 7 }])).toEqual({ detail: 0, changed: 7 })
    expect(combine([blank, shown(5)])).toEqual({ detail: 500, changed: 5 })
    expect(combine([shown(1), shown(2)])).toEqual({ detail: 1000, changed: 3 })
  })
})

describe("plan", () => {
  it("cuts page loads and holds each scene a page load cut short (the branch conversation recording)", () => {
    // 5 s of white, 0.3 s of the branch, 9 s of white, 0.3 s of the next branch, 7 s of white: what Will saw.
    const frames = [...Array(50).fill(blank), cut, still, still, ...Array(90).fill(blank), cut, shown(10), still, ...Array(70).fill(blank)]
    const repeat = plan(frames, GIF_PACE)
    expect(frames.filter((frame, index) => isBlank(frame) && repeat[index]! > 0)).toEqual([])
    // Each scene shows at least GIF_PACE.scene frames, on its last frame; the end holds GIF_PACE.hold more.
    expect(repeat.slice(50, 53)).toEqual([1, 1, 1 + GIF_PACE.scene - 3])
    expect(repeat.slice(143, 146)).toEqual([1, 1, 1 + GIF_PACE.scene - 3 + GIF_PACE.hold])
    expect(shownFrames(repeat)).toBe(2 * GIF_PACE.scene + GIF_PACE.hold)
  })

  it("plays a quiet stretch in at most pace.quiet frames, evenly, ending on its last frame", () => {
    const frames = [cut, ...Array(100).fill(shown(QUIET_CHANGE - 1)), cut]
    const repeat = plan(frames, VIDEO_PACE)
    const kept = repeat.flatMap((count, index) => (count > 0 && index > 0 && index < 101 ? [index] : []))
    expect(kept).toHaveLength(VIDEO_PACE.quiet)
    expect(kept.at(-1)).toBe(100)
    expect(kept[0]).toBe(3)
    // A short quiet stretch plays whole.
    expect(plan([cut, still, still, cut], GIF_PACE)).toEqual([1, 1, 1, 1 + GIF_PACE.scene - 4 + GIF_PACE.hold])
  })

  it("keeps every frame with change a viewer follows, and holds the last", () => {
    const frames = [cut, ...Array(40).fill(shown(QUIET_CHANGE))]
    expect(plan(frames, GIF_PACE)).toEqual([...Array(40).fill(1), 1 + GIF_PACE.hold])
  })

  it("shows nothing of a recording that is blank throughout", () => {
    expect(plan(Array(30).fill(blank), VIDEO_PACE)).toEqual(Array(30).fill(0))
    expect(plan([], VIDEO_PACE)).toEqual([])
  })
})

describe("holdChapters", () => {
  it("shows each chapter at least `least` frames, on its last shown frame or else its first non-blank one", () => {
    // a: frames 0-2 shown once; b: 3-5 blank (a page load); c: frame 6 shown 3 times, 7 dropped; d: 8-9 quiet, dropped.
    const repeat = [1, 1, 1, 0, 0, 0, 3, 0, 0, 0]
    const frames = [cut, still, still, blank, blank, blank, cut, still, still, still]
    const found = [
      { t: 0, label: "a" },
      { t: 0.3, label: "b" },
      { t: 0.6, label: "c" },
      { t: 0.8, label: "d" },
      { t: 0.8, label: "d on the same frame" },
      { t: 9, label: "after the end" },
    ]
    expect(holdChapters(repeat, frames, found, 5)).toEqual([1, 1, 3, 0, 0, 0, 5, 0, 5, 0])
    expect(holdChapters(repeat, frames, found.slice(0, 3), 2)).toEqual(repeat)
    expect(holdChapters(repeat, frames, [], 5)).toEqual(repeat)
  })
})

describe("outputStarts", () => {
  it("places each recorded frame at the output frame it starts on", () => {
    expect(outputStarts([0, 2, 0, 1, 3])).toEqual([0, 0, 2, 2, 3])
  })
})

describe("chaptersOf", () => {
  const at = (seconds: number) => 1_000_000 + seconds * 1000
  const action = (label: string, seconds: number): Mark => ({ start: at(seconds), label })
  const step = (label: string, from: number, to: number): Mark => ({ start: at(from), end: at(to), label })

  it("names each step and each action outside one, from the recording's start, once per repeat", () => {
    const marks = [
      action('A: Press Enter in "Message Smithers" field', 4.2),
      step('A: ask "hello"', 4, 4.5),
      action('A: Type in "Message Smithers" field', 4.1),
      step("A: open the composer", 4, 4.05),
      action("Open /octocat/Spoon-Knife", 1),
      action('Click "Open terminal" button', 3),
      action('Click "Open terminal" button', 3.5),
      action("Press Escape", 6),
    ]
    // Each at its seconds from the recording's start, less the picture's lead on the test's clock.
    expect(chaptersOf(marks, at(-RECORDING_LAG))).toEqual([
      { t: 1, label: "Open /octocat/Spoon-Knife" },
      { t: 3, label: 'Click "Open terminal" button' },
      { t: 4, label: 'A: ask "hello"' },
      { t: 6, label: "Press Escape" },
    ])
  })

  it("keeps one of two steps that span the same time, and puts a mark before the recording at its start", () => {
    expect(chaptersOf([step("inner", 1, 2), step("outer", 1, 2)], at(0))).toHaveLength(1)
    expect(chaptersOf([step("Open A", -2, -1)], at(0))).toEqual([{ t: 0, label: "Open A" }])
    expect(chaptersOf([], at(0))).toEqual([])
    // A step and an action that start in the same millisecond: the step holds the action.
    expect(chaptersOf([action("Click A", 2), step("Step", 2, 3)], at(-RECORDING_LAG))).toEqual([{ t: 2, label: "Step" }])
    expect(chaptersOf([step("Step", 2, 3), action("Click A", 2)], at(-RECORDING_LAG))).toEqual([{ t: 2, label: "Step" }])
    expect(chaptersOf([action("Click A", 2), action("Press B", 2)], at(0))).toHaveLength(2)
  })
})

describe("videoProblems", () => {
  it("fails a video over 5 s with fewer than 2 chapters", () => {
    expect(videoProblems(19, 0)).toEqual(["too few chapters: 0 for 19.0 s"])
    expect(videoProblems(5.5, 1)).toEqual(["too few chapters: 1 for 5.5 s"])
    expect(videoProblems(5.5, 2)).toEqual([])
    expect(videoProblems(5, 0)).toEqual([])
  })
})

describe("retime", () => {
  it("moves each chapter to its frame's place in the output, the last of several on one frame winning", () => {
    // Frames 0-9 dropped (a page load), 10-19 kept once, 20-29 dropped, 30 held 5.
    const repeat = [...Array(10).fill(0), ...Array(10).fill(1), ...Array(10).fill(0), 5]
    expect(
      retime(
        [
          { t: 0, label: "Navigate" },
          { t: 0.5, label: "Click Chat" },
          { t: 1.5, label: "Fill" },
          { t: 2.5, label: "Reload" },
          { t: 9, label: "Past the end" },
        ],
        repeat,
      ),
    ).toEqual([
      { t: 0, label: "Click Chat" },
      { t: 0.5, label: "Fill" },
      { t: 1, label: "Past the end" },
    ])
    expect(retime([{ t: 0, label: "A" }, { t: 0.1, label: "A" }], [1, 1])).toEqual([{ t: 0, label: "A" }])
    expect(retime([{ t: 0, label: "A" }], [0])).toEqual([{ t: 0, label: "A" }])
  })
})

describe("chapterAt", () => {
  it("is the last chapter started by a frame, or -1 before the first", () => {
    const found = [
      { t: 1, label: "a" },
      { t: 2.5, label: "b" },
    ]
    expect([0, 9, 10, 24, 25, 99].map((frame) => chapterAt(found, frame))).toEqual([-1, -1, 0, 0, 1, 1])
  })
})

describe("problems", () => {
  const playing = (count: number) => [cut, ...Array.from({ length: count - 1 }, (_, index) => shown(index % 2 === 0 ? 500 : 30))]

  it("passes a GIF that plays", () => {
    expect(problems(playing(60), 1024)).toEqual([])
  })

  it("names blank, frozen, flashing, short and heavy GIFs", () => {
    expect(problems(Array(20).fill(blank), 10)).toEqual(["blank: every frame"])
    expect(problems([...playing(20), blank, ...playing(20)], 10)).toEqual(["blank frames: 1 of 41"])
    expect(problems([cut, ...Array(MAX_STILL_FRAMES).fill(still)], 10)).toEqual([`frozen: one frame for ${((MAX_STILL_FRAMES + 1) / 10).toFixed(1)} s`])
    expect(problems([cut, ...Array(MAX_STILL_FRAMES - 1).fill(still)], 10)).toEqual([])
    const flash = [...playing(10), { ...shown(PIXELS), skip: 0 }, { ...shown(PIXELS), skip: PIXELS }, ...playing(10)]
    expect(problems(flash, 10)).toEqual(["glitched: 1 frames flash for 0.1 s"])
    // Two new screens in a row are no flash when nothing says the screen came back.
    expect(problems([...playing(10), shown(PIXELS), shown(PIXELS), ...playing(10)], 10)).toEqual([])
    expect(problems([cut, shown(500)], 10)).toEqual(["too short: 2 frames"])
    expect(problems(playing(20), MAX_GIF_BYTES + 1)).toEqual(["too big: 5.0 MB"])
  })
})
