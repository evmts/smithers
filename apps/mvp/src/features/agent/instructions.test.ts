// What the agent is told before every answer (./instructions.ts). The agent evals caught it saying "There's no /theme
// command" (docs/features/agent-evals.md, 2026-10-20): it now reads the composer's slash commands from the registry the
// slash menu reads, so the two can't disagree.
import { describe, expect, test } from "vitest"
import { COMMANDS } from "../commands/catalog"
import { entryOf, names } from "../../flows/registry"
import { CHAT_SYSTEM, PERSONS_OWN, SLASH_COMMANDS } from "./instructions"

describe("CHAT_SYSTEM", () => {
  test("names every slash command the slash menu offers, with the flow it runs", () => {
    const named = [...SLASH_COMMANDS.matchAll(/\/([^\s,]+) ([^\s,]+)/g)].map((match) => [match[1], match[2]])
    expect(named).toEqual(COMMANDS.map((command) => [command.name, command.flow]))
    expect(SLASH_COMMANDS).toContain("/theme app/theme/set")
  })

  test("names every act that is the person's alone, and none a device or a flow starts", () => {
    const named = [...PERSONS_OWN.matchAll(/\(([^()\s]+)\)(?:;|$)/g)].map((match) => match[1])
    expect(named).toEqual(names.filter((name) => entryOf(name).userOnlyReason !== undefined && entryOf(name).acts === undefined))
    expect(PERSONS_OWN).toContain("Accept an issue, or mark it not accepted (issue/triage)")
    expect(PERSONS_OWN).not.toContain("run/deliver")
    expect(CHAT_SYSTEM.join("\n")).toContain(PERSONS_OWN)
  })

  test("marks a command whose flow only the person runs", () => {
    expect(SLASH_COMMANDS).toContain("/edit chat/edit (the person's only)")
    expect(SLASH_COMMANDS).not.toContain("/theme app/theme/set (the person's only)")
  })

  test("carries the slash commands, and teaches acting on a how-do-I and calling only what the request needs", () => {
    const system = CHAT_SYSTEM.join("\n")
    expect(system).toContain(SLASH_COMMANDS)
    expect(system).toContain("Asked how to do something a flow does, with the result named")
    expect(system).toContain("Call only the flows the request needs.")
    expect(system).toContain("When a flow fails or is refused, say so and stop there")
    expect(system).toContain("never ask for that approval yourself")
    expect(system).toContain("put it in your answer, code in a fenced block")
    expect(system).toContain("Never promise to do something later")
    expect(system).toContain("never make up their files, branches, runs or results")
    expect(system).toContain("People merge, approve and move main; you never do, and never look for a way round it.")
  })
})
