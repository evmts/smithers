import { expect, test } from "./browserTest"
import { installCloudFixture, runningBox } from "./cloudFixture"

const repo = "smithersai/smithers"

/*
 * #3828 and #3823 (Will, 2026-10-13): a bare `/flow.new` asks with the form,
 * the open repository already filled in, and Submit starts the authoring run.
 * The door used to answer a usage sentence, which THE FORM LAW forbids.
 */
test("a bare /flow.new asks with the form and the keyboard alone starts the authoring run", async ({ page }) => {
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
  await page.goto("/")
  const composer = page.getByTestId("composer-input")
  await expect(composer).toBeAttached()
  if (!await composer.isVisible()) await page.getByRole("button", { name: "Chat", exact: true }).click()
  await composer.fill("/flow.new")
  await composer.press("Enter")

  const form = page.locator(".flow-form[data-flow-name='flow.new']")
  await expect(form).toBeVisible()
  await expect(page.getByText("flow.new needs a description")).toHaveCount(0)
  const description = form.getByTestId("flow-form-description")
  await expect(description).toBeFocused()
  await expect(description).toHaveValue("")
  await expect(form.getByTestId("flow-form-repo")).toHaveValue(repo)

  await page.keyboard.type("Label new issues by area")
  const submit = form.getByRole("button", { name: "Submit", exact: true })
  await expect(submit).toBeEnabled()
  await submit.press("Enter")

  const card = page.locator('[data-kind="run-trace"]')
  await expect(card).toHaveAttribute("data-run-id", "authoring-run")
  const planned = calls.filter(call => call.procedure === "Plan").map(call => JSON.stringify(call.payload))
  expect(planned).toHaveLength(1)
  expect(planned[0]).toContain("create-flow")
  expect(planned[0]).toContain("Label new issues by area")
  expect(calls.filter(call => call.procedure === "Run")).toHaveLength(1)
})
