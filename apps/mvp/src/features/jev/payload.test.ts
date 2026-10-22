import { Exit, Schema } from "effect"
import { describe, expect, test } from "vitest"
import { Classify, ClassifyItems, Evaluate, EvaluateText } from "./flows"

describe("Jev input validation", () => {
  const classifySchemas = [Classify.payloadSchema, ClassifyItems.payloadSchema]
  const evaluateSchemas = [Evaluate.payloadSchema, EvaluateText.payloadSchema]

  test("reserves unsure for uncertainty in both classification boundaries", () => {
    for (const schema of classifySchemas) {
      expect(Exit.isSuccess(Schema.decodeUnknownExit(schema)({
        question: "Kind?", items: ["Crash"], labels: ["bug", "unsure"],
      }))).toBe(false)
      expect(Exit.isSuccess(Schema.decodeUnknownExit(schema)({
        question: "Kind?", items: ["Crash"], labels: ["bug", "unsure-about-category"],
      }))).toBe(true)
    }
  })

  test.each([" ", "\t\n\r", "\u00a0\u2003"])("rejects whitespace-only inputs %j", (blank) => {
    for (const schema of classifySchemas) {
      for (const payload of [
        { question: blank, items: ["Crash"] },
        { question: "Bug?", items: [blank] },
        { question: "Kind?", items: ["Crash"], labels: ["bug", blank] },
      ]) expect(Exit.isSuccess(Schema.decodeUnknownExit(schema)(payload))).toBe(false)
    }
    for (const schema of evaluateSchemas) {
      for (const payload of [
        { text: blank, criteria: ["Clear?"] },
        { text: "A change", criteria: [blank] },
      ]) expect(Exit.isSuccess(Schema.decodeUnknownExit(schema)(payload))).toBe(false)
    }
  })

  test("preserves meaningful text including surrounding whitespace", () => {
    const classified = { question: " Bug? ", items: ["\tCrash\n"], labels: [" bug ", "idea"] }
    for (const schema of classifySchemas) {
      expect(Schema.decodeUnknownExit(schema)(classified)).toEqual(Exit.succeed(classified))
    }
    const evaluated = { text: " A change ", criteria: ["\tClear?\n"] }
    for (const schema of evaluateSchemas) {
      expect(Schema.decodeUnknownExit(schema)(evaluated)).toEqual(Exit.succeed(evaluated))
    }
  })
})
