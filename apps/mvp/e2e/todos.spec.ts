import { expect, type Tab, test } from "./devices"

// TODOs and the stack, end to end (decision 0016 slice 1, Track A; docs/features/todos.md): two people in real
// browsers against the real app, ChatApi, its one stack writer, Postgres and Electric. Ann asks Smithers for a TODO;
// her agent is the scripted one in her browser's engine worker (`/app?agent=todo-draft`, src/test/scriptedAgent.ts),
// so the draft it makes is the same every run; everything else is real. Ben is local development's second person, a
// Member (`smithers_dev_person=teammate`, worker/DevChatApi.ts). Every run commits its own TODO, found by a word
// unique to the run, and drops it, so the shared stack doesn't fill.

/** The repository whose stack the tests use: any repository's name has a stack; this one is public. */
const REPO = "octocat/Spoon-Knife"

/** The stack page's row of the TODO whose title has `word`. */
const row = (tab: Tab, word: string) => tab.page.getByRole("region", { name: `${REPO} stack` }).locator("[data-todo]", {
  hasText: word,
})

/** Opens the stack page on `tab`. */
const openStack = async (tab: Tab, path = `/${REPO}/stack`) => {
  await tab.page.goto(path)
  await expect(tab.page.getByRole("region", { name: `${REPO} stack` }), `${tab.name}: the stack opens`).toBeVisible({
    timeout: 60_000,
  })
}

test("todo-commit-drop: Ann asks Smithers for a TODO, edits the draft and commits; Ben sees it; Ann drops it", async ({ devices }) => {
  test.setTimeout(300_000)
  const word = devices.word
  const [ann] = await devices.open("Ann")
  const [ben] = await devices.openTeammate("Ben")
  await ann.page.goto("/app?agent=todo-draft")
  await ann.ready()

  // Ann asks; the agent drafts. The draft card shows under its answer, on her device only.
  const question = `todo-draft ${REPO} ${word}`
  await ann.askAndWaitTaken(question)
  const draft = ann.page.getByRole("form", { name: "TODO draft" })
  await expect(draft, "Ann: the draft card shows under the answer").toBeVisible({ timeout: 120_000 })
  await expect(draft.getByText("Only you")).toBeVisible()
  await expect(draft.getByLabel("Prompt")).toHaveValue(`Add a line to the README: ${word}`)

  // She edits its title and commits it: the stack opens, and the TODO shows T– Requested, then numbered and Queued.
  const title = `README line ${word}`
  await draft.getByLabel("Title").fill(title)
  await draft.getByRole("button", { name: "Commit" }).click()
  await expect(ann.page).toHaveURL(new RegExp(`/${REPO}/stack$`), { timeout: 30_000 })
  await expect(row(ann, word), "Ann: numbered and Queued").toHaveAttribute("data-state", "queued", { timeout: 60_000 })
  await expect(row(ann, word)).toContainText(/T\d+/, { timeout: 60_000 })
  await expect(row(ann, word)).not.toHaveAttribute("data-pending", /.+/, { timeout: 60_000 })
  const number = (await row(ann, word).textContent())!.match(/T(\d+)/)![1]!

  // Ben opens the stack: the same TODO, the same number, and its prompt at full size.
  await openStack(ben)
  await expect(row(ben, word), "Ben: sees Ann's TODO").toContainText(`T${number}`, { timeout: 60_000 })
  await row(ben, word).getByRole("link", { name: title }).click()
  await expect(ben.page).toHaveURL(new RegExp(`/${REPO}/stack/${number}$`))
  const card = ben.page.getByRole("article", { name: title })
  await expect(card).toContainText(`Add a line to the README: ${word}`, { timeout: 60_000 })
  await expect(card).toContainText("The README ends with the line")

  // Both reload: each device shows it from its own store and the stack.
  await ann.page.reload()
  await ben.page.reload()
  await expect(row(ann, word)).toContainText(`T${number}`, { timeout: 60_000 })
  await expect(row(ben, word)).toContainText(`T${number}`, { timeout: 60_000 })

  // Ann drops it, confirming once: Requested on her row, then Dropped on both devices.
  await row(ann, word).getByRole("button", { name: "Drop", exact: true }).click()
  await row(ann, word).getByRole("button", { name: `Drop T${number}` }).click()
  for (const tab of [ann, ben]) {
    await expect(row(tab, word), `${tab.name}: Dropped`).toHaveAttribute("data-state", "dropped", { timeout: 60_000 })
  }
  await expect(card).toHaveAttribute("data-state", "dropped")
  await expect(row(ben, word).getByRole("button", { name: "Drop", exact: true })).toHaveCount(0)
})

test("todo-new-keyboard: New TODO on the stack page, typed and committed with the keyboard, then dropped", async ({ devices }) => {
  test.setTimeout(240_000)
  const word = devices.word
  const [ann] = await devices.open("Ann")
  await openStack(ann)
  await ann.page.getByRole("button", { name: "New TODO" }).focus()
  await ann.page.keyboard.press("Enter")
  const draft = ann.page.getByRole("form", { name: "TODO draft" }).first()
  await draft.getByLabel("Title").focus()
  await ann.page.keyboard.type(`Keyboard ${word}`)
  await ann.page.keyboard.press("Tab")
  await ann.page.keyboard.type("Typed without a mouse.")
  await ann.page.keyboard.press("ControlOrMeta+Enter")
  await expect(row(ann, word)).toContainText(/T\d+/, { timeout: 60_000 })
  await expect(row(ann, word)).not.toHaveAttribute("data-pending", /.+/, { timeout: 60_000 })
  const number = (await row(ann, word).textContent())!.match(/T(\d+)/)![1]!

  // Drop with the keyboard: Enter on Drop moves the focus to Cancel, the safe choice; Shift+Tab reaches the
  // confirmation, and Enter drops it.
  await row(ann, word).getByRole("button", { name: "Drop", exact: true }).focus()
  await ann.page.keyboard.press("Enter")
  await expect(row(ann, word).getByRole("button", { name: "Cancel" })).toBeFocused()
  await ann.page.keyboard.press("Shift+Tab")
  await expect(row(ann, word).getByRole("button", { name: `Drop T${number}` })).toBeFocused()
  await ann.page.keyboard.press("Enter")
  await expect(row(ann, word)).toHaveAttribute("data-state", "dropped", { timeout: 60_000 })
})
