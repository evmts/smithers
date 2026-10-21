/**
 * Loop uses the plan's repetition vocabulary, so adding a ceiling outcome
 * cannot silently fork the two authoring APIs.
 */
import * as Repetition from "@smthrs/plan/Repetition"
import { describe, expect, it } from "vitest"
import * as Loop from "../src/Loop.ts"

describe("single definitions", () => {
  it("names the loop ceiling outcomes from the plan repetition vocabulary", () => {
    // `OnMaxReached` is a type, so the pin is that every member the plan
    // vocabulary declares is a `MakeOptions.onMaxReached` this package accepts.
    const accepted: ReadonlyArray<Loop.OnMaxReached> = Repetition.AtCeiling.literals
    expect([...accepted]).toEqual(["fail", "return-last"])
  })
})
