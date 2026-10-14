/*
 * The host line of the generated instructions (docs/web-mode/PLAN.md §1).
 *
 * On the web the model is told, once, which asks belong to the native app and
 * what to execute when it gets one; on the native host the line is absent. The
 * line names `app.download.prompt`, a flow the cloud host registers — so the
 * instruction is catalog-grounded, not prompt-fragile.
 */
import { describe, expect, test } from "bun:test"
import type { AppBootstrap } from "@smthrs/rpc/AppBootstrap"
import {
  CONVERSATION_IS_NOT_A_COMMAND_LINE,
  SMITHERS_SUBJECT_READS_DOCS_LINE,
  SMITHERS_SUBJECT_WITHOUT_DOCS_LINE
} from "@smthrs/rpc/AgentInstructions"
import { cloudCapabilities, localCapabilities } from "@smthrs/rpc/HostCapabilities"
import { executeAgentToolCall } from "../flows/agentTools"
import { scopedControllers } from "./ControllerTestScope"
import { createAppStore } from "./AppStore"
import { WEB_HOST_LINE, smithersInstructions } from "./Instructions"
import type { InstructionHonesty } from "./Instructions"
import { memoryStorage, settle, unavailableAgent } from "./TestFixtures"

const createAppController = scopedControllers()

const honesty = (): InstructionHonesty => ({
  github: { connected: false, login: null, repositories: null },
  localRepositories: [], localRepositoriesAvailable: false
})

/*
 * BOTH DOORS, ONE RULE.
 *
 * The app agent's standing rules are shared (@smthrs/rpc/AgentInstructions) so
 * the browser's own prompt and the model host's hosted turns cannot disagree
 * about what the agent is. They did disagree about prose: the hosted prompt
 * carried an act rule whose refusal clause named anything "not in your
 * commands", and two live Cloud turns refused a plain ten-section explanation
 * of message queues (2026-10-14 10:36Z and 10:37Z). The boundary — commands
 * and can't-yets are ACTS, never subjects — now travels with the shared rules,
 * so this door states it too, and neither door's can't-yet sentence reads as a
 * whitelist of subjects.
 */
test("the browser prompt says writing in the chat needs no command, and scopes its can't-yets to acts", () => {
  const prompt = smithersInstructions([], honesty())
  expect(prompt.split(CONVERSATION_IS_NOT_A_COMMAND_LINE)).toHaveLength(2)
  expect(prompt).not.toContain("Everything the catalog lacks is a can't-yet")
  expect(prompt).toContain("Everything the catalog lacks is an ACT you cannot take yet, never a subject you cannot discuss")
  // The external fences are untouched: each named effect still refuses.
  expect(prompt).toContain("You cannot send or draft email")
  expect(prompt).toContain("push to a branch or open a pull request — not directly, and not through a run")
  expect(prompt).toContain("Asked to write or explain something about one of them, write it: the subject is never the fence.")
})

/*
 * THE CLAUSE FOLLOWS THE CATALOG, as CODE_INTEL_LINE already does.
 *
 * The conversation rule's last clause defers Smithers' own subject to the
 * command that reads the documentation, so a "how does HTTPS work in front of
 * Smithers" answer is quoted from the page instead of recalled (#3881). A
 * session whose registry has no documentation door (`docsAvailable()` false —
 * flows/entries/docs.ts hides and un-disclosed `docs` then) was told to run it
 * anyway, and told "never from memory" with no other source: the same
 * overbroad-refusal shape the rest of #3881 removed, aimed at Smithers'
 * own subject. The clause is now stated only where the door exists.
 */
test("the Smithers-subject clause is stated only when a documentation command is in the catalog", () => {
  const docs = { name: "docs", summary: "Read the docs in the app", args: "[page]" }
  const without = smithersInstructions([], honesty())
  expect(without).toContain(CONVERSATION_IS_NOT_A_COMMAND_LINE)
  expect(without).not.toContain(SMITHERS_SUBJECT_READS_DOCS_LINE)
  expect(without).toContain(SMITHERS_SUBJECT_WITHOUT_DOCS_LINE)
  // No door to read, and still an answer: the fence against invention stands in its place.
  expect(without).toContain("never invent a command, a flag, a page or a step")
  const with_ = smithersInstructions([docs], honesty(), { disclosed: ["docs"] })
  expect(with_).toContain(SMITHERS_SUBJECT_READS_DOCS_LINE)
  expect(with_).not.toContain(SMITHERS_SUBJECT_WITHOUT_DOCS_LINE)
  // Either way the rule itself is stated once, and licenses the world.
  for (const prompt of [without, with_]) {
    expect(prompt.split(CONVERSATION_IS_NOT_A_COMMAND_LINE)).toHaveLength(2)
    expect(prompt).toContain("This licenses subjects in the WORLD, nothing about this app")
  }
})

test("the browser host line is present once and names no retired download door", () => {
  const prompt = smithersInstructions([], honesty())
  expect(prompt.split(WEB_HOST_LINE)).toHaveLength(2)
  expect(prompt).not.toContain("app.download")
})

const bootstrapFor = (host: AppBootstrap["host"]): AppBootstrap =>
  host === "cloud"
    ? {
      apiVersion: 1,
      host,
      version: "test",
      buildSha: "cloud",
      capabilities: cloudCapabilities({ identity: true, cloud: true, agent: true, checkout: false, terminal: false }),
      authFlow: "redirect",
      sandbox: null
    }
    : {
      apiVersion: 1,
      host,
      version: "test",
      buildSha: "local",
      // The desktop shell's row: the mode line reads it, never the host name.
      capabilities: localCapabilities({ agent: true, identity: true, cloud: true }),
      authFlow: "native-handoff",
      sandbox: { platform: "darwin", mode: "enforced" }
    }

// This is the retained instruction generator's catalog boundary. Shared model
// turns are server-owned; the retired browser startTurn port is not evidence.
const catalogInstructions = async (host: AppBootstrap["host"]): Promise<{ instructions: string; names: string[] }> => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = createAppController(store, unavailableAgent, { bootstrap: bootstrapFor(host) })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "codeplanesmithers", admin: false, scopesPlain: null }).isPersisted.promise
  await settle(2)
  const catalog = JSON.parse(await executeAgentToolCall(controller.commands, { name: "commands", arguments: JSON.stringify({ action: "list" }) }))
  const names = catalog.commands.map((command: { name: string }) => command.name)
  return { instructions: smithersInstructions(catalog.commands, honesty(), { disclosed: names }), names }
}

describe("the generated catalog instructions retain the product name", () => {
  for (const host of ["cloud", "local"] as const) {
    test(`${host}: the instructions pin the one-word name without the retired identity command`, async () => {
      const { instructions, names } = await catalogInstructions(host)
      expect(instructions).toContain('Your name is exactly "Smithers"')
      expect(instructions).not.toContain("execute smithers.who")
      expect(names).not.toContain("smithers.who")
      // The retained identity rule needs no dedicated command.
      expect(instructions).not.toMatch(/^- \/smithers\.who\b.* — /m)
      expect(instructions).toContain("Your name is exactly \"Smithers\"")
      expect(instructions).toContain("Do not suggest features absent from your catalog.")
      expect(names).toContain("wiki")
    })
  }
})

describe("the generated catalog instructions retain the browser host contract", () => {
  for (const host of ["cloud", "local"] as const) test(`${host} has the browser line and no download door`, async () => {
    const { instructions, names } = await catalogInstructions(host)
    expect(instructions).toContain(WEB_HOST_LINE)
    expect(names).not.toContain("app.download.prompt")
  })
})

describe("the command section lists pinned and disclosed commands in full, and only those", () => {
  const catalog = [
    { name: "theme", summary: "Switch to the dark theme" },
    { name: "auth.prompt", summary: "Render the sign-in button" },
    { name: "runs.list", summary: "List runs", args: "[--limit <n>]" },
    { name: "issues.list", summary: "List issues" }
  ]
  const header = 'Commands for this conversation (4 exist; the list action with a "query" finds the rest, with their arguments):'

  test("with nothing pinned or disclosed, the header counts the catalog and no command line follows", () => {
    const prompt = smithersInstructions(catalog, honesty())
    expect(prompt).toContain(`${header}\n\n`)
    for (const { name } of catalog) expect(prompt).not.toContain(`- /${name}`)
  })

  test("a disclosed command is listed with its arguments and summary; an undisclosed one stays out", () => {
    const prompt = smithersInstructions(catalog, honesty(), { pinned: ["auth.prompt"], disclosed: ["theme", "runs.list"] })
    const section = prompt.slice(prompt.indexOf(header) + header.length).split("\n\n")[0]!.trim().split("\n")
    // Catalog order, not request order; one line per command.
    expect(section).toEqual([
      "- /theme — Switch to the dark theme",
      "- /auth.prompt — Render the sign-in button",
      "- /runs.list [--limit <n>] — List runs"
    ])
    expect(prompt).not.toContain("- /issues.list")
  })

  test("a disclosed name the catalog no longer has is dropped, and a name both pinned and disclosed is listed once", () => {
    const prompt = smithersInstructions(catalog, honesty(), { pinned: ["runs.list"], disclosed: ["runs.list", "gone.command"] })
    expect(prompt.split("- /runs.list")).toHaveLength(2)
    expect(prompt).not.toContain("gone.command")
  })
})

describe("the prompt's surface examples", () => {
  test("name no default-off feature, in either flag state", () => {
    const prompt = smithersInstructions([], honesty())
    expect(prompt).toContain("When a surface is involved (wiki, browser)")
    expect(prompt).not.toContain("(world, connect, browser)")
  })
})
