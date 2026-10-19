import { describe, expect, it } from "vitest"
import { retrySchedule, stallVerdict } from "../examples/retry-and-stall.ts"

describe("examples", () => {
  it("retry-and-stall prints a doubling, capped schedule that gives up at the attempt budget", () => {
    expect(retrySchedule()).toEqual([
      "attempt 1: retry after 100 ms",
      "attempt 2: retry after 200 ms",
      "attempt 3: retry after 400 ms",
      "attempt 4: retry after 800 ms",
      "attempt 5: give up (exhausted)"
    ])
  })

  it("retry-and-stall stops a loop whose failing checks repeat in any order and never reaches later rounds", () => {
    expect(stallVerdict()).toEqual([
      "round 1: progress",
      "round 2: progress",
      "round 3: progress",
      "round 4: stalled on checks for 3 rounds, stop"
    ])
  })
})
