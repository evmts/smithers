import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import type { APIRequestContext, Locator, Page, Request } from "@playwright/test"
import { scenario } from "./coverage/types"
import { authenticatedTest } from "./auth-permissions/profile"
import { awaitBoot, closeComposer, command, expect, openApp, openComposer, productUrl, realApi, reloadApp, test } from "./support/test"
import { finishFirstVisit } from "./support/first-visit"
import { runSlash, attachJson } from "./issues/local"
import { enableVerboseEvidence, expectFlowOutcome } from "./repositories-github/local"
import { pushMainFiles, runningWorkspace, withOwnedRepository } from "./portable/owned-repository"

// Controlled SUBJECT, genuine host/engine/journal/browser tier. No issue automation or model call.
const subject = readFileSync(new URL("./burndown/issue-sweep.flow.fixture.ts", import.meta.url), "utf8")
const diagnostic = "Synthetic diagnostic <em data-fixture-marker>private</em>\nsecond line"
const expectedItems = [
  { id: "101", number: 101, title: "Synthetic landed item" },
  { id: "102", number: 102, title: "Synthetic held item" },
  { id: "103", number: 103, title: "Synthetic failed item" },
  { id: "104", number: 104, title: "Synthetic skipped item" }
]
const expectedRows = [
  { id: "101", status: "landed", detail: "Synthetic success" },
  { id: "102", status: "held", detail: "Synthetic other owner" },
  { id: "103", status: "failed", detail: diagnostic },
  { id: "104", status: "skipped", detail: "Synthetic excluded item" }
]

const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Expected a JSON object")
  return value as Record<string, unknown>
}
const string = (value: unknown): string => {
  if (typeof value !== "string" || value === "") throw new Error("Expected a nonempty string receipt")
  return value
}
const workflowRequest = (sent: Request, repo: string, procedure: string): boolean => {
  if (sent.method() !== "POST" || new URL(sent.url()).pathname !== "/api/workflow/rpc") return false
  const body = record(sent.postDataJSON())
  return body.repo === repo && body.procedure === procedure
}
const snapshot = async (page: Page, request: APIRequestContext, repo: string, workspaceId: string, runId: string, tag: "run-summary" | "run-events") => {
  const response = await realApi(page, request, "POST", "/api/workflow/rpc", {
    repo, workspaceId, procedure: "Projection.Snapshot", payload: { selector: { _tag: tag, runId } }
  })
  expect(response.status()).toBe(200)
  const body = record(await response.json())
  expect(body.ok).toBe(true)
  const rows = record(body.payload).rows
  if (!Array.isArray(rows)) throw new Error("Projection omitted its rows")
  return rows.map(record)
}
// Completion and its output document are distinct observable boundaries.
const terminalDocument = async (page: Page, request: APIRequestContext, repo: string, workspaceId: string, runId: string) => {
  let document: unknown
  let summary: Record<string, unknown> | undefined
  await expect.poll(async () => {
    const matches = (await snapshot(page, request, repo, workspaceId, runId, "run-summary")).filter(row => row.runId === runId)
    expect(matches).toHaveLength(1)
    summary = matches[0]
    expect(summary?.runId).toBe(runId)
    expect(summary?.status).toBe("completed")
    document = summary?.finalOutput
    return typeof document === "string"
  }, { message: "the matching completed run records its terminal output document", timeout: 120_000, intervals: [500, 1_000, 2_000] }).toBe(true)
  if (typeof document !== "string") throw new Error("Terminal output document was not recorded")
  expect(JSON.parse(document)).toEqual({ rows: expectedRows, rounds: 1, stopped: "drained" })
  return { summary, document }
}
const settledActions = (events: ReadonlyArray<Record<string, unknown>>) => events.flatMap(event => {
  if (event.kind !== "control.engine.event") return []
  const envelope = record(event.payload)
  if (envelope.eventType !== "flows.engine.node-settled") return []
  const body = record(envelope.payload)
  expect(body.outcome).toBe("built")
  const result = record(body.result)
  // The small fixture must fit entirely: never salvage truncated JSON for this independent oracle.
  expect(result.truncated).not.toBe(true)
  return [{ action: string(body.action), outcome: body.outcome, value: JSON.parse(string(result.preview)) }]
})
const rowsShown = async (card: Locator) => card.locator("button.burndown-row").evaluateAll(rows => rows.map(row => Number(row.getAttribute("data-issue"))).sort((a, b) => a - b))
const assertCollapsed = async (card: Locator) => {
  await expect(card.getByTestId("burndown-detail")).toHaveCount(0)
  await expect(card.getByTestId("burndown-reason")).toHaveCount(0)
  expect(await card.textContent()).not.toContain(diagnostic)
  expect(await card.textContent()).not.toContain("private")
  for (const aria of await card.locator("button.burndown-row").evaluateAll(rows => rows.map(row => row.getAttribute("aria-label")))) {
    expect(aria).not.toContain(diagnostic)
    expect(aria).not.toContain("private")
  }
}

test("signed-out issue-sweep defers across reload without workflow admission", scenario("burndown.signed-out-deferred-reload", {
  capabilities: ["identity", "cloud"],
  coverage: ["action:issue-sweep", "action:auth.prompt", "host:local", "path:permission", "path:persistence", "path:keyboard", "door:slash", "dimension:keyboard", "evidence:anonymous-refusal-no-workflow-admission"]
}), async ({ page, request }) => {
  const admitted: string[] = []
  const observe = (sent: Request) => {
    if (sent.method() === "POST" && new URL(sent.url()).pathname === "/api/workflow/rpc") admitted.push(string(record(sent.postDataJSON()).procedure))
  }
  page.on("request", observe)
  try {
    await openApp(page)
    expect((await realApi(page, request, "GET", "/api/user")).status()).toBe(401)
    await command(page, "/issue-sweep 1 local fixture-owner/fixture-repo")
    await closeComposer(page)
    const refusal = page.locator(".smithers-chat-message").filter({ has: page.getByText("Sign in with GitHub to continue.", { exact: true }) }).last()
    await expect(refusal).toBeVisible()
    await expect(refusal.locator('button[data-flow="auth.sign-in"]')).toBeVisible()
    await expect(page.locator('.smithers-card[data-kind="run-trace"]')).toHaveCount(0)
    expect(admitted).toEqual([])
    await reloadApp(page)
    await expect(refusal).toBeVisible()
    expect((await realApi(page, request, "GET", "/api/user")).status()).toBe(401)
    await openComposer(page)
    await page.getByTestId("composer-input").fill("Unsent anonymous draft")
    await expect(page.getByTestId("composer-input")).toHaveValue("Unsent anonymous draft")
    expect(admitted).toEqual([])
  } finally { page.off("request", observe) }
})

authenticatedTest("a synthetic repository Flow journals a board whose selection and filter survive reload", scenario("burndown.synthetic-journal-filter-select-reload", {
  capabilities: ["identity", "cloud"],
  coverage: ["action:issue-sweep", "action:runs.burndown.filter", "action:runs.burndown.select", "host:local", "path:success", "path:persistence", "path:keyboard", "door:slash", "door:button", "dimension:keyboard", "surface:flow-api", "evidence:synthetic-engine-journal-projection-and-persisted-card-selection"]
}), async ({ page, request }, testInfo) => {
  await withOwnedRepository(page, request, async repo => {
    const sourceCommit = await pushMainFiles(page, request, repo, { "flows/issue-sweep/flow.ts": subject })
    await runningWorkspace(page, request, repo, async workspaceId => {
      const procedures: string[] = []
      const observe = (sent: Request) => {
        if (sent.method() !== "POST" || new URL(sent.url()).pathname !== "/api/workflow/rpc") return
        const body = record(sent.postDataJSON())
        if (body.repo === repo.fullName) procedures.push(string(body.procedure))
      }
      page.on("request", observe)
      try {
        const startedAt = performance.now()
        await page.goto(productUrl(page, `/${repo.fullName}`), { waitUntil: "domcontentloaded" })
        await awaitBoot(page, "navigate", startedAt)
        await finishFirstVisit(page)
        await enableVerboseEvidence(page)
        await runSlash(page, `/box.view ${workspaceId}`)
        await expect(page.getByTestId(`card-workspace-${workspaceId}`)).toBeVisible({ timeout: 60_000 })
        const listed = page.waitForResponse(response => workflowRequest(response.request(), repo.fullName, "List"), { timeout: 120_000 })
        await runSlash(page, `/flow.list ${repo.fullName}`)
        const list = await listed
        expect(list.status()).toBe(200)
        expect(record(list.request().postDataJSON()).workspaceId).toBe(workspaceId)
        const catalog = record(await list.json())
        expect(catalog.ok).toBe(true)
        const items = record(catalog.payload).items
        if (!Array.isArray(items)) throw new Error("Catalog omitted items")
        expect(items.map(item => record(item).flowId)).toContain("issue-sweep")
        expect(procedures.filter(value => value === "Plan" || value === "Run")).toEqual([])
        const planned = page.waitForResponse(response => workflowRequest(response.request(), repo.fullName, "Plan"), { timeout: 120_000 })
        const accepted = page.waitForResponse(response => workflowRequest(response.request(), repo.fullName, "Run"), { timeout: 240_000 })
        await runSlash(page, `/issue-sweep 2 local ${repo.fullName}`)
        const plan = await planned
        expect(plan.status()).toBe(200)
        expect(record(plan.request().postDataJSON()).workspaceId).toBe(workspaceId)
        expect(record(record(plan.request().postDataJSON()).payload).flowId).toBe("issue-sweep")
        const planBody = record(await plan.json())
        expect(planBody.ok).toBe(true)
        const planId = string(record(planBody.payload).planId)
        const runResponse = await accepted
        expect(runResponse.status()).toBe(200)
        expect(record(runResponse.request().postDataJSON()).workspaceId).toBe(workspaceId)
        expect(record(record(runResponse.request().postDataJSON()).payload).planId).toBe(planId)
        const run = record(await runResponse.json())
        expect(run.ok).toBe(true)
        const runId = string(record(run.payload).runId)
        await expect.poll(async () => (await snapshot(page, request, repo.fullName, workspaceId, runId, "run-summary")).find(row => row.runId === runId)?.status,
          { timeout: 300_000, intervals: [1_000, 2_000, 5_000] }).toBe("completed")
        const initialTerminal = await terminalDocument(page, request, repo.fullName, workspaceId, runId)
        const journal = await snapshot(page, request, repo.fullName, workspaceId, runId, "run-events")
        const actions = settledActions(journal)
        expect(actions.map(action => action.action).sort()).toEqual(["issue-sweep/accounts", "issue-sweep/dispatch", "issue-sweep/list-issues"])
        expect(actions.every(action => action.outcome === "built")).toBe(true)
        expect(actions.find(action => action.action === "issue-sweep/accounts")?.value).toEqual({ _tag: "Available", slots: 2 })
        expect(actions.find(action => action.action === "issue-sweep/list-issues")?.value).toEqual(expectedItems)
        expect(actions.find(action => action.action === "issue-sweep/dispatch")?.value).toEqual({ rows: expectedRows, launched: 0, deferred: 0 })
        // Frame composition may retain a hidden transcript projection of this same durable card.
        const card = page.locator(`.smithers-card[data-kind="run-trace"][data-run-id="${runId}"]`).filter({ visible: true })
        await expect(card).toHaveCount(1)
        await expect(card).toHaveAttribute("data-run-id", runId)
        await expect(card).toHaveAttribute("data-status", "acted", { timeout: 60_000 })
        await expect.poll(() => rowsShown(card)).toEqual([101, 102, 103, 104])
        await assertCollapsed(card)
        for (const state of ["landed", "held", "failed", "skip"]) await expect(card.locator(`.burndown-count[data-state="${state}"] .burndown-count-n`)).toHaveText("1")
        await card.locator('.burndown-count[data-state="failed"]').press("Enter")
        await expect.poll(() => rowsShown(card)).toEqual([103])
        const heldArgs = `${runId} held`
        await runSlash(page, `/runs.burndown.filter ${heldArgs}`)
        await expectFlowOutcome(page, "runs.burndown.filter", heldArgs, "executed")
        await expect.poll(() => rowsShown(card)).toEqual([102])
        await runSlash(page, `/runs.burndown.filter ${heldArgs}`)
        await expect.poll(() => rowsShown(card)).toEqual([101, 102, 103, 104])
        const selectArgs = `${runId} 103`
        await runSlash(page, `/runs.burndown.select ${selectArgs}`)
        await expectFlowOutcome(page, "runs.burndown.select", selectArgs, "executed")
        const reason = card.getByTestId("burndown-reason")
        await expect(reason).toHaveText(diagnostic)
        await expect(card.locator("em[data-fixture-marker]")).toHaveCount(0)
        await reason.focus()
        await reason.press("Escape")
        await assertCollapsed(card)
        await expect(card.locator('.burndown-row[data-issue="103"]')).toBeFocused()
        await runSlash(page, `/runs.burndown.filter ${runId} failed`)
        await expectFlowOutcome(page, "runs.burndown.filter", `${runId} failed`, "executed")
        await runSlash(page, `/runs.burndown.select ${selectArgs}`)
        await expectFlowOutcome(page, "runs.burndown.select", selectArgs, "executed")
        await reloadApp(page)
        await expect(card).toHaveAttribute("data-run-id", runId)
        await expect(card.locator('.burndown-count[data-state="failed"]')).toHaveAttribute("aria-pressed", "true")
        await expect.poll(() => rowsShown(card)).toEqual([103])
        await expect(reason).toHaveText(diagnostic)
        await reason.focus()
        await reason.press("Escape")
        await assertCollapsed(card)
        await expect(card.locator('.burndown-row[data-issue="103"]')).toBeFocused()
        await reloadApp(page)
        await assertCollapsed(card)
        expect(settledActions(await snapshot(page, request, repo.fullName, workspaceId, runId, "run-events"))).toEqual(actions)
        const finalTerminal = await terminalDocument(page, request, repo.fullName, workspaceId, runId)
        expect(finalTerminal.document).toBe(initialTerminal.document)
        await openComposer(page)
        await page.getByTestId("composer-input").fill("Unsent synthetic board draft")
        await expect(page.getByTestId("composer-input")).toHaveValue("Unsent synthetic board draft")
        expect(procedures.filter(value => value === "Plan")).toEqual(["Plan"])
        expect(procedures.filter(value => value === "Run")).toEqual(["Run"])
        await attachJson(testInfo, "synthetic-burndown-terminal", { repo: repo.fullName, workspaceId, planId, runId,
          sourceCommit, sourceSHA256: createHash("sha256").update(subject).digest("hex"), initialTerminal, finalTerminal, journal,
          tier: "synthetic finite Flow subject; real engine journal and browser; no automation/model" })
      } finally { page.off("request", observe) }
    })
  })
})

// Match the maintained portable workflow case budget; no deadline extension.
test.setTimeout(420_000)
authenticatedTest.setTimeout(420_000)
