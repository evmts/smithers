import { describe, expect, test } from "vitest"
import {
  FORM_INSTRUCTION_FIELDS,
  isFormInstructionCommand,
  isUiInstructionCommand,
  UI_INSTRUCTION_FIELDS,
  UiInstructionFrameSchema
} from "../src/UiInstruction.ts"

describe("author monitor selection", () => {
  const base = { command: "runs.trace.view", runId: "run-9", view: "turns" }
  test("carries only its declared monitor state", () => {
    for (
      const state of [{}, null, { selected: "cell-1", at: 0, tab: "journal" }, { selected: null, at: null, tab: null }]
    ) {
      expect(UiInstructionFrameSchema.parse({ ...base, state })).toEqual({ ...base, state })
    }
    for (const state of ["cell", { at: -1 }, { at: 0.5 }, { tab: "owner" }, { selected: {} }, { shared: true }]) {
      expect(UiInstructionFrameSchema.safeParse({ ...base, state }).success).toBe(false)
    }
  })
  test("keeps other screen commands scalar and rejects undeclared authority", () => {
    for (
      const frame of [
        { command: "theme", mode: {} },
        { command: "theme", mode: null },
        { command: "theme", mode: "dark", state: {} },
        { ...base, owner: true }
      ]
    ) expect(UiInstructionFrameSchema.safeParse(frame).success).toBe(false)
    expect(UiInstructionFrameSchema.parse({ command: "theme", mode: "dark" })).toEqual({
      command: "theme",
      mode: "dark"
    })
  })
})

// #3823: a flow that is not UI-only reaches its author's screen only as a request for its form.
describe("a flow asked for with its form", () => {
  test("carries the form's draft as text, each field optional", () => {
    for (
      const frame of [
        { command: "flow.new" },
        { command: "flow.new", description: "label new issues by area" },
        { command: "flow.new", repo: "acme/app" },
        { command: "flow.new", description: "label new issues by area", repo: "acme/app" }
      ]
    ) expect(UiInstructionFrameSchema.parse(frame)).toEqual(frame)
  })
  test("refuses a field the form does not declare and a value that is not text", () => {
    for (
      const frame of [
        { command: "flow.new", name: "label-issues" },
        { command: "flow.new", description: "label new issues", confirmed: "true" },
        { command: "flow.new", description: 7 },
        { command: "flow.new", description: true },
        { command: "flow.new", description: null },
        { command: "flow.new", description: { text: "label new issues" } },
        { command: "flow.new", description: "label new issues", repo: 7 },
        { command: "flow.new", description: "label new issues", repo: null }
      ]
    ) expect(UiInstructionFrameSchema.safeParse(frame).success, JSON.stringify(frame)).toBe(false)
  })
  test("is never also a UI-only flow, and no other flow is asked for this way", () => {
    expect(Object.keys(FORM_INSTRUCTION_FIELDS)).toContain("flow.edit")
    for (const name of Object.keys(FORM_INSTRUCTION_FIELDS)) {
      expect([name, isFormInstructionCommand(name), isUiInstructionCommand(name)]).toEqual([name, true, false])
    }
    for (const name of Object.keys(UI_INSTRUCTION_FIELDS)) {
      expect([name, isFormInstructionCommand(name)]).toEqual([name, false])
    }
    for (const name of ["form.submit", "toString"]) {
      expect([name, isFormInstructionCommand(name), UiInstructionFrameSchema.safeParse({ command: name }).success])
        .toEqual([name, false, false])
    }
  })
})

// Every permitted form is draft-only; authority fields and non-text values fail closed.
test("all catalog forms carry only optional declared text", () => {
  for (const [command, fields] of Object.entries(FORM_INSTRUCTION_FIELDS)) {
    expect(UiInstructionFrameSchema.safeParse({ command }).success, command).toBe(true)
    for (const field of fields) {
      expect(UiInstructionFrameSchema.safeParse({ command, [field]: "draft" }).success, `${command}.${field}`).toBe(
        true
      )
      expect(UiInstructionFrameSchema.safeParse({ command, [field]: { confirmed: true } }).success).toBe(false)
    }
    expect(UiInstructionFrameSchema.safeParse({ command, confirmed: "true" }).success).toBe(false)
  }
})
