import { expect, test } from "./browserTest"
import { installCloudFixture, runningBox } from "./cloudFixture"
import { SCOPED_TEST_USER } from "./identity"

const repo = "smithersai/smithers"
const said = "label new issues by area"

/*
 * #3823 (Will, 2026-10-13): asked for a flow on Smithers Cloud, the agent asks
 * with the form. Its request reaches the person's own screen through the
 * account conversation's view state; the form holds what they said and the
 * open repository, and nothing runs until they press Submit and confirm.
 */
test("asked for a flow, the agent's request opens the form filled in; Submit then Confirm start the authoring run", async ({ page }) => {
  const calls: Array<{ procedure: string; payload: unknown }> = []
  await installCloudFixture(page, { capabilities: ["agent", "identity", "cloud", "cloud.pat"], workspaces: [runningBox(repo)] })
  await page.route("**/api/workflow/provision", route => route.fulfill({ json: { status: "ready" } }))
  await page.route("**/api/workflow/rpc", async route => {
    const call = route.request().postDataJSON() as { procedure: string; payload: { flowId?: string; input?: unknown; selector?: { _tag: string } } }
    calls.push(call)
    let payload: unknown = {}
    if (call.procedure === "Plan") payload = { planId: "plan-authoring", digest: "digest", envelope: { capabilities: [], flows: [], budget: {} } }
    if (call.procedure === "Run") payload = { runId: "authoring-run" }
    if (call.procedure === "Projection.Snapshot") payload = { rows: call.payload.selector?._tag === "run-summary" ? [{
      runId: "authoring-run", flowId: "create-flow", status: "running", createdAt: 1, updatedAt: 2,
      turns: 1, calls: 1, callsFailed: 0, editsAttempted: 0, editsSucceeded: 0, inputTokens: 1, outputTokens: 1, verdict: "Running", diagnosis: "Recorded status"
    }] : [] }
    await route.fulfill({ json: { ok: true, payload } })
  })
  // The account conversation as the host serves it: the turn's reply, and its committed request in the author's view state.
  const entries: Array<Record<string, unknown>> = []
  const instructions: Array<Record<string, unknown>> = []
  await page.route("**/api/conversations/main", route => route.fulfill({ json: { id: "main", entries } }))
  await page.route("**/api/conversations/main/view-state", route => route.fulfill({ json: { instructions } }))
  await page.route("**/api/conversations/main/prompt", route => {
    if (entries.length === 0) {
      entries.push({ id: "turn-1", author: 1, authorLogin: SCOPED_TEST_USER.login, runId: "run-1", prompt: route.request().postDataJSON().prompt, state: "completed", frames: [
        { runId: "run-1", type: "delta", kind: "text", text: "The form is on your screen." }, { runId: "run-1", type: "done", reason: "stop" }
      ] })
      instructions.push({ id: "turn-1:2:0", command: "flow.new", payload: { description: said } })
    }
    return route.fulfill({ status: 202, json: { turnId: "turn-1", terminal: true } })
  })
  const launches = () => calls.filter(call => call.procedure === "Plan" || call.procedure === "Run")
  const confirm = page.getByRole("button", { name: "Confirm: Create a new flow", exact: true })

  // The design fixture answers prompts itself; off, the page is the hosted conversation production renders.
  await page.goto("/?design=off")
  const composer = page.getByTestId("composer-input")
  await expect(composer).toBeAttached()
  if (!await composer.isVisible()) await page.getByRole("button", { name: "Chat", exact: true }).click()
  await composer.fill("make me a flow that labels new issues by area")
  await composer.press("Enter")

  // The prompt is admitted, the turn is read, then its view state: more than one assertion's default wait under load.
  const form = page.locator(".flow-form[data-flow-name='flow.new']")
  await expect(form).toBeVisible({ timeout: 30_000 })
  await expect(form.getByTestId("flow-form-description")).toHaveValue(said)
  await expect(form.getByTestId("flow-form-repo")).toHaveValue(repo)
  await expect(page.getByText("The form is on your screen.")).toBeVisible()
  // The request named everything the flow needs, and still only asked.
  await expect(confirm).toHaveCount(0)
  expect(launches()).toEqual([])

  const submit = form.getByRole("button", { name: "Submit", exact: true })
  await expect(submit).toBeEnabled()
  await submit.press("Enter")
  await expect(confirm).toBeVisible()
  expect(launches()).toEqual([])
  await confirm.press("Enter")

  const card = page.locator('[data-kind="run-trace"]')
  await expect(card).toHaveAttribute("data-run-id", "authoring-run", { timeout: 30_000 })
  const planned = calls.filter(call => call.procedure === "Plan").map(call => JSON.stringify(call.payload))
  expect(planned).toHaveLength(1)
  expect(planned[0]).toContain("create-flow")
  expect(planned[0]).toContain(said)
  expect(calls.filter(call => call.procedure === "Run")).toHaveLength(1)
  // One request, one form: later reads of the same view state ask nothing again.
  await expect(page.locator(".flow-form[data-flow-name='flow.new']")).toHaveCount(1)
})
