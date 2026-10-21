import type { Locator, Page } from "@playwright/test"
import { expect, type Tab, test } from "./devices"
import { step } from "./fixtures"
import { me, requires, scriptedAgent } from "./target"

// Co-editing, end to end (docs/features/coedit.md, decision 0013 §4): real browsers on separate devices against the
// real app, ChatApi, the texts' rooms, the branch's machine, Postgres and Electric. Maya is local development's
// developer and owns the fixture branch; Ben is its second person, a Member (`smithers_dev_person=teammate`,
// worker/DevChatApi.ts). The fixture is the public `octocat/Hello-World`'s `octocat-patch-1` branch, which no other suite
// opens; nothing is written to GitHub. The answer box's test scripts the agent's model in the asking browser's engine
// worker (`/app?agent=needs-you`, src/test/scriptedAgent.ts), so it runs the same every time.

const REPO = { owner: "octocat", name: "Hello-World", ref: "octocat-patch-1" }
const BRANCH = `/${REPO.owner}/${REPO.name}/tree/${REPO.ref}`
const BEN = "local-teammate"
const MAYA = "local-developer"
const FILE = "README"

/** A container's first start may take a while on a cold machine. */
const MACHINE = 240_000

/** A change comes back through Electric, which a machine running many suites has been seen to hold back. */
const SYNC = 90_000

/** `name`'s caret on `scope`: the name flag every other person's caret carries. */
const caret = (scope: Page | Locator, name: string) =>
  scope.locator(`[data-slot="collaborator-caret"][data-name="${name}"] .sui-collaborator-name`)

/** Maya's branch, shared with Ben to edit and nobody else. */
const shareWithBen = async (maya: Tab) => {
  const tracked = await maya.page.request.post("/api/branches", { data: REPO })
  expect([200, 201], "Maya tracks the fixture branch").toContain(tracked.status())
  const branch = (await tracked.json()) as { readonly branchId: string; readonly access: string }
  expect(branch.access, "the fixture branch is Maya's: no other suite opens it").toBe("owner")
  for (const grantee of [BEN, "repository"]) {
    await maya.page.request.post(`/api/branches/${branch.branchId}/shares`, { data: { grantee, access: null } })
  }
  const shared = await maya.page.request.post(`/api/branches/${branch.branchId}/shares`, {
    data: { login: BEN, access: "edit" },
  })
  expect(shared.status(), "Maya shares the branch with Ben to edit").toBe(200)
}

/** Opens the branch on `tab`, `search` after it, and waits for its workspace. */
const visit = (tab: Tab, search = "") =>
  step(`${tab.name}: open the branch${search}`, async () => {
    await tab.page.goto(`${BRANCH}${search}`)
    await expect(tab.page.getByRole("navigation", { name: "Branch" })).toContainText(REPO.ref, { timeout: 30_000 })
  })

/** The live editor's text on `page`. */
const editor = (page: Page) => page.getByRole("region", { name: FILE }).locator(".cm-content")

test("co-editing: Maya and Ben type in one prompt and one file at once, see each other's carets, and save the file", {
  annotation: {
    type: "summary",
    description: "Two people type the same prompt and the same file at once, each sees the other's caret, Ben sends the prompt and Maya saves the file.",
  },
}, async ({ devices }) => {
  requires("devPeople")
  test.setTimeout(10 * 60_000)
  const word = devices.word
  const [maya] = await devices.open("Maya")
  const [ben] = await devices.openTeammate("Ben")
  await shareWithBen(maya!)
  await visit(maya!)
  await visit(ben!)
  await maya!.openComposer()
  await ben!.openComposer()

  await step("Both type in the branch's prompt at once", async () => {
    await maya!.composer.click()
    await maya!.page.keyboard.type(`now ${word}`)
    await expect(ben!.composer, "Ben sees Maya's typing").toHaveValue(`now ${word}`, { timeout: SYNC })
    await expect(caret(ben!.composerForm, MAYA), "Ben sees Maya's caret").toBeVisible({ timeout: SYNC })
    // Each types without waiting for the other: Maya at the start, Ben at the end.
    await ben!.composer.click()
    await ben!.composer.press("End")
    await maya!.composer.press("Home")
    await Promise.all([maya!.page.keyboard.type("Ship "), ben!.page.keyboard.type(" please")])
    const merged = `Ship now ${word} please`
    await expect(maya!.composer, "Maya has every letter").toHaveValue(merged, { timeout: SYNC })
    await expect(ben!.composer, "Ben has every letter").toHaveValue(merged, { timeout: SYNC })
    await expect(caret(maya!.composerForm, BEN), "Maya sees Ben's caret").toBeVisible({ timeout: SYNC })
  })

  await step("Ben sends it as himself, and it clears for both", async () => {
    await ben!.composer.press("Enter")
    const question = `Ship now ${word} please`
    await expect(maya!.page.getByRole("region", { name: "Conversation", exact: true }).getByText(question).first())
      .toBeVisible({ timeout: SYNC })
    await expect(maya!.composer).toHaveValue("", { timeout: SYNC })
    await expect(ben!.composer).toHaveValue("")
  })

  await step(`Maya opens ${FILE} in the live editor; Ben opens it too`, async () => {
    // The live editor reads the branch's working copy on its machine; the Code view's file list needs a clone of the
    // repository, which a machine without Code Storage's key doesn't have, so both open the editor by its address.
    await visit(maya!, `?edit=${FILE}`)
    await expect(editor(maya!.page), "the working copy's file opens").toBeVisible({ timeout: MACHINE })
    await visit(ben!, `?edit=${FILE}`)
    await expect(editor(ben!.page)).toBeVisible({ timeout: SYNC })
    await expect(editor(ben!.page)).toHaveText(await editor(maya!.page).innerText(), { timeout: SYNC })
  })

  await step("Both type in the file at once, each seeing the other's caret", async () => {
    await editor(maya!.page).click()
    await maya!.page.keyboard.press("ControlOrMeta+End")
    await editor(ben!.page).click()
    await ben!.page.keyboard.press("ControlOrMeta+Home")
    await Promise.all([
      maya!.page.keyboard.type(` maya-${word}`),
      ben!.page.keyboard.type(`ben-${word} `),
    ])
    for (const tab of [maya!, ben!]) {
      await expect(editor(tab.page), `${tab.name} has both edits`).toContainText(`maya-${word}`, { timeout: SYNC })
      await expect(editor(tab.page)).toContainText(`ben-${word}`, { timeout: SYNC })
    }
    await expect(caret(maya!.page.getByRole("region", { name: FILE }), BEN), "Maya sees Ben's caret").toBeVisible()
    await expect(caret(ben!.page.getByRole("region", { name: FILE }), MAYA), "Ben sees Maya's caret").toBeVisible()
  })

  await step("Maya saves it to the branch's working copy", async () => {
    await maya!.page.getByRole("button", { name: "Save", exact: true }).click()
    await expect(maya!.page.getByRole("button", { name: "Saved", exact: true })).toBeVisible({ timeout: MACHINE })
    await visit(maya!, "?terminal=me")
    const frame = maya!.page.frameLocator('iframe[title="Terminal"]').locator("body")
    const open = maya!.page.getByRole("button", { name: "Open terminal" })
    await expect(async () => {
      if ((await open.isVisible()) && (await open.isEnabled())) await open.click()
      await expect(frame).toContainText("/workspace", { timeout: 15_000 })
    }).toPass({ timeout: MACHINE })
    await maya!.page.locator('iframe[title="Terminal"]').click()
    await maya!.page.keyboard.type(`cat ${FILE}`)
    await maya!.page.keyboard.press("Enter")
    await expect(frame, "the working copy has both edits").toContainText(`maya-${word}`, { timeout: 30_000 })
    await expect(frame).toContainText(`ben-${word}`)
  })
})

test("co-editing: two devices type one answer box of a run that needs the person, with each other's carets", {
  annotation: {
    type: "summary",
    description: "The agent asks; two of the person's devices type the answer together, see each other's caret, and either sends it.",
  },
}, async ({ devices }) => {
  requires("scriptedAgent")
  test.setTimeout(300_000)
  const word = devices.word
  const [a, b] = await devices.open("A", "B")
  await a!.page.goto(scriptedAgent("needs-you"))
  await a!.ready()
  const question = `Deploy the docs preview, ${word}`
  await a!.askAndWaitTaken(question)
  const answerId = a!.asked.find((asked) => asked.text === question)!.answerId
  const card = (tab: Tab) => tab.page.locator(`[data-slot="needs-you"][data-run="${answerId}"]`)
  const field = (tab: Tab) => card(tab).getByRole("textbox", { name: "Your answer" })

  await step("Both devices type the answer at once", async () => {
    for (const tab of [a!, b!]) await expect(field(tab), `${tab.name}: the question shows`).toBeVisible({ timeout: 60_000 })
    await field(a!).click()
    await a!.page.keyboard.type("docs")
    await expect(field(b!), "B sees what A typed").toHaveValue("docs", { timeout: SYNC })
    await expect(caret(card(b!), me().login), "B sees A's caret").toBeVisible({ timeout: SYNC })
    await field(b!).click()
    await field(b!).press("End")
    await b!.page.keyboard.type("-v2")
    await expect(field(a!), "A sees what B typed").toHaveValue("docs-v2", { timeout: SYNC })
    await expect(caret(card(a!), me().login), "A sees B's caret").toBeVisible({ timeout: SYNC })
  })

  await step("B answers; the run in A's browser goes on", async () => {
    await field(b!).press("Enter")
    for (const tab of [a!, b!]) await tab.expectAnswered(question, "Deploying docs-v2.", 120_000)
  })
})
