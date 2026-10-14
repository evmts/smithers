import type { Locator, Page } from "@playwright/test"
import { authenticatedTest } from "./auth-permissions/profile"
import { bootWorkspace, captureTurnTraffic, nextTurnResponse, parseTurnFrames } from "./chat-tools/ui"
import { scenario } from "./coverage/types"
import { appEntryPath, command, expect, test } from "./support/test"

/*
 * Smithers is an assistant: it does what it is asked, it does not hand the
 * person steps. Will asked "can we create a workflow" on smithers.sh (#3823)
 * and got the Flows page recited back as steps and a source template for him
 * to write. The agent's act for a new flow is the "Create a new flow" form on
 * the person's own screen, the open repository filled in and whatever they
 * said as its description. Each row reads what the app rendered. The model,
 * the host and the app are the deployed ones; nothing here is scripted, and
 * the form is never submitted, so no flow is created.
 */
const agentTest = process.env.SMITHERS_REAL_E2E_MODE !== undefined || process.env.SMITHERS_REAL_E2E_HOST === "production"
  ? authenticatedTest
  : test

test.setTimeout(240_000)
test.use({ actionTimeout: 20_000 })

/** What handing the work back reads like: steps for the person, source to write, a command to type. */
const HOW_TO = /\byou can\b|Flow\.make|\/flow\.edit|flows\/\S*flow\.ts|@smthrs\//i

const flowForm = (page: Page): Locator => page.locator('.flow-form[data-flow-name="flow.new"]')

/** The persistent profile keeps its cards: a form left by an earlier run is never this run's evidence. */
const dismissFlowForms = async (page: Page): Promise<void> => {
  for (let remaining = await flowForm(page).count(); remaining > 0; remaining -= 1) {
    await flowForm(page).first().getByTestId("flow-form-cancel").click()
    await expect(flowForm(page)).toHaveCount(remaining - 1)
  }
}

/** Sends one ask, waits for the real turn to complete, and returns the reply the transcript rendered for it. */
const askAgent = async (page: Page, ask: string): Promise<{ readonly reply: string; readonly answer: Locator; readonly launches: ReadonlyArray<string> }> => {
  const launches: string[] = []
  page.on("request", (request) => {
    if (new URL(request.url()).pathname !== "/api/workflow/rpc") return
    const procedure = (request.postDataJSON() as { readonly procedure?: unknown } | null)?.procedure
    if (procedure === "Plan" || procedure === "Run") launches.push(procedure)
  })
  const admission = nextTurnResponse(page)
  await command(page, ask)
  const admitted = await admission
  expect(admitted.status()).toBe(202)
  const { turnId } = await admitted.json() as { readonly turnId: string }
  await expect(page.locator(`[data-shared-turn="${turnId}"]`)).toHaveAttribute("data-state", "completed", { timeout: 150_000 })
  const answer = page.locator(`[data-message-id="${turnId}:answer"]`)
  const reply = (await answer.locator(".sui-md:not(.turn-activity .sui-md)").allInnerTexts()).join("\n")
  return { reply, answer, launches }
}

agentTest("asked \"can we create a workflow\", the agent opens the new-flow form instead of explaining how", scenario("agent.acts.flow-new.can-we", {
  capabilities: ["agent", "identity", "cloud"],
  coverage: [
    "action:chat.send", "action:flow.new", "host:production", "path:success", "door:agent",
    "dimension:assistant-acts", "dimension:form", "dimension:no-remote-side-effect", "evidence:rendered-form-card-and-reply"
  ],
  description: "Ask the deployed agent for a workflow as a question and require the rendered Create a new flow form with the open repository filled in, a reply with no how-to, and no launched run."
}), async ({ page }, testInfo) => {
  const repo = appEntryPath().slice(1)
  await bootWorkspace(page)
  await dismissFlowForms(page)
  try {
    const { reply, answer, launches } = await askAgent(page, "can we create a workflow")
    await testInfo.attach("agent-acts-reply", { body: Buffer.from(JSON.stringify({ reply, launches }, null, 2)), contentType: "application/json" })

    const form = flowForm(page)
    await expect(form, `the agent replied ${JSON.stringify(reply)}`).toBeVisible({ timeout: 30_000 })
    await expect(form.getByTestId("flow-form-repo")).toHaveValue(repo)
    await expect(form.getByRole("button", { name: "Submit", exact: true })).toBeVisible()
    expect(reply).not.toMatch(HOW_TO)
    await expect(answer.locator(".sui-md:not(.turn-activity .sui-md) pre")).toHaveCount(0)
    expect(launches).toEqual([])
  } finally {
    await dismissFlowForms(page)
  }
})

agentTest("asked for a flow that labels new issues, the agent opens the form with that as its description", scenario("agent.acts.flow-new.described", {
  capabilities: ["agent", "identity", "cloud"],
  coverage: [
    "action:chat.send", "action:flow.new", "host:production", "path:success", "door:agent",
    "dimension:assistant-acts", "dimension:form", "dimension:prefilled-input", "dimension:no-remote-side-effect",
    "evidence:rendered-form-card-and-reply"
  ],
  description: "Ask the deployed agent for a described flow and require the rendered form to hold the description and the open repository, a reply with no how-to, and no launched run."
}), async ({ page }, testInfo) => {
  const repo = appEntryPath().slice(1)
  await bootWorkspace(page)
  await dismissFlowForms(page)
  try {
    const { reply, answer, launches } = await askAgent(page, "make me a flow that labels new issues by area")
    await testInfo.attach("agent-acts-reply", { body: Buffer.from(JSON.stringify({ reply, launches }, null, 2)), contentType: "application/json" })

    const form = flowForm(page)
    await expect(form, `the agent replied ${JSON.stringify(reply)}`).toBeVisible({ timeout: 30_000 })
    const description = form.getByTestId("flow-form-description")
    await expect(description).toHaveValue(/label/i)
    await expect(description).toHaveValue(/issue/i)
    await expect(form.getByTestId("flow-form-repo")).toHaveValue(repo)
    expect(reply).not.toMatch(HOW_TO)
    await expect(answer.locator(".sui-md:not(.turn-activity .sui-md) pre")).toHaveCount(0)
    expect(launches).toEqual([])
  } finally {
    await dismissFlowForms(page)
  }
})

/*
 * The screen-only acts (mvp.md Appendix B.1): on Cloud the agent's grant
 * carries no install API, and the host withheld every one of them behind that
 * credential, so the agent could take no act a person takes on their own
 * screen. Asked read-only to list a repository's issues it answered "I can't
 * list issues right now, but I can show you the documentation using the /docs
 * command" (2026-10-14, account 8 on smithers.sh) while the person's own
 * /issues.list worked. This row proves the screen door itself with the
 * smallest read-only act on it, /help: the turn's own durable frames carry
 * the request the host ran and the instruction it wrote for the author's
 * screen, and the app renders the Commands card that instruction opens. The
 * card is upserted under one id, so its presence is never counted — the
 * frames are what belong to this turn. It does not prove an issue read —
 * a Cloud account conversation has no repository-bound issue door
 * (smithersai/smithers#3876, #3871), and search.issues indexes only the issue
 * cards the conversation has already opened.
 */
agentTest("asked what it can do here, the agent runs the app's own command list on the person's screen", scenario("agent.acts.help", {
  capabilities: ["agent", "identity", "cloud"],
  coverage: [
    "action:chat.send", "action:help", "host:production", "path:success", "door:agent",
    "dimension:assistant-acts", "dimension:screen-only", "dimension:tool-loop", "dimension:no-remote-side-effect",
    "evidence:rendered-commands-card-and-reply"
  ],
  description: "Ask the deployed Cloud agent for the app's own command list and require its durable /help request and result frames, the rendered Commands card, no /docs deflection, and no launched run."
}), async ({ page }, testInfo) => {
  await bootWorkspace(page)
  const traffic = await captureTurnTraffic(page)
  const { reply, launches } = await askAgent(
    page,
    "Run the app's own command list in this chat and tell me what it rendered. Do not create, edit or delete anything."
  )
  const frames = parseTurnFrames(await traffic.read())
  await testInfo.attach("agent-acts-reply", { body: Buffer.from(JSON.stringify({ reply, launches, frames }, null, 2)), contentType: "application/json" })
  // The tool request and its result, on the turn's own committed journal: only
  // a host that offered /help and ran it writes this pair, and the settled
  // frame carries the instruction the author's own browser acts on.
  const calls = frames.filter((frame) => frame.name === "help").map((frame) => frame.type)
  expect(calls.slice(0, 2), `the agent replied ${JSON.stringify(reply)}`).toEqual(["call.started", "call.settled"])
  const settled: unknown = JSON.parse(JSON.stringify(frames.find((frame) => frame.type === "call.settled" && frame.name === "help")))
  expect(settled).toMatchObject({ name: "help", verdict: "run", ui: { command: "help" } })
  // What that instruction opens on the person's own screen.
  await expect(page.getByTestId("card-commands")).toBeVisible({ timeout: 30_000 })
  // Not HOW_TO: a command list legitimately says what the person can run. The
  // deflection this row exists to catch is the /docs page offered instead.
  expect(reply).not.toMatch(/\/docs\b/)
  expect(launches).toEqual([])
})
