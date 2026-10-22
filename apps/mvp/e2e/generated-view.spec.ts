import type { Page } from "@playwright/test"
import { step } from "./fixtures"
import { expect, test } from "./devices"
import { requires, scriptedAgent } from "./target"

// A generated view (docs/features/views.md#generated-views, decision 0004 §4 to §6), end to end: the real app, ChatApi,
// its presentation realm and Postgres, with the models the only scripted seam (`/app?agent=board`: the agent calls
// `ui/render`, and the renderer writes the tic-tac-toe module, src/test/scriptedAgent.ts). ChatApi checks and renders the
// module; the board shows in a sandboxed frame inline on every device; a click in it is a move ChatApi makes from the
// board it keeps; the same board opens full screen, where the person plays to a win; and it stays after a reload.

/** The latest generated view in the conversation on `page`. */
const latestView = (page: Page) => page.locator('.conversation-view[data-template="generated"]').last()

/** The frame a generated view shows in, inline or full screen. */
const frameOf = (page: Page, inline: boolean) =>
  (inline ? latestView(page) : page.getByRole("main", { name: "View" })).frameLocator("iframe")

/** A click on board cell `index` (0 to 8), as the person makes it. */
const play = (page: Page, inline: boolean, index: number) =>
  step(`move: cell ${index + 1}`, () => frameOf(page, inline).getByRole("button", { name: new RegExp(`^Cell ${index + 1}`) }).click())

test("show me a board: the agent shows a tic-tac-toe board, inline and full screen, and the person plays it to a win", {
  annotation: {
    type: "summary",
    description: "The agent shows a tic-tac-toe board in the chat; a move shows on both devices; full screen, the person plays to a win.",
  },
}, async ({ devices }) => {
  requires("scriptedAgent", "member", "ownConversation")
  test.setTimeout(240_000)
  const word = devices.word
  const [a, b] = await devices.open("A", "B")
  await a.page.goto(scriptedAgent("board"))
  await a.ready()

  const question = `Show me a tic-tac-toe board, ${word}`
  await a.askAndWaitTaken(question)
  await a.expectAnswered(question, "board", 90_000)
  // The board ChatApi rendered shows in its frame on both devices.
  for (const tab of [a, b]) {
    await expect(frameOf(tab.page, true).getByText("X to move"), `${tab.name}: the board shows`).toBeVisible({
      timeout: 30_000,
    })
  }
  // The frame is sandboxed: scripts only, an opaque origin, no forms, popups or navigation of the app.
  await expect(latestView(a.page).locator("iframe")).toHaveAttribute("sandbox", "allow-scripts")

  // A's move in the chat shows on B's board.
  await play(a.page, true, 4)
  for (const tab of [a, b]) {
    await expect(frameOf(tab.page, true).getByRole("button", { name: "Cell 5, X" }), `${tab.name}: X in the centre`)
      .toBeVisible({ timeout: 30_000 })
  }

  // Full screen: the same board, from the same row.
  await step("A: open the board full screen", () => latestView(a.page).getByRole("link", { name: "Full screen" }).click())
  await expect(a.page).toHaveURL(/\/app\/views\/[0-9a-f-]{36}/)
  await expect(frameOf(a.page, false).getByRole("button", { name: "Cell 5, X" })).toBeVisible({ timeout: 30_000 })
  // O, X, O, X: X takes the diagonal.
  for (const [index, mark] of [[0, "O"], [2, "X"], [1, "O"], [6, "X"]] as const) {
    await play(a.page, false, index)
    await expect(frameOf(a.page, false).getByRole("button", { name: `Cell ${index + 1}, ${mark}` })).toBeVisible({
      timeout: 30_000,
    })
  }
  await expect(frameOf(a.page, false).getByText("X wins"), "A: X wins full screen").toBeVisible()
  // A won board takes no more moves.
  await play(a.page, false, 3)
  await expect(frameOf(a.page, false).getByRole("button", { name: "Cell 4" })).toHaveAccessibleName("Cell 4")

  // B sees the win in the chat; A's reload keeps it.
  await expect(frameOf(b.page, true).getByText("X wins"), "B: the win syncs").toBeVisible({ timeout: 30_000 })
  await step("Reload A", () => a.page.reload())
  await expect(frameOf(a.page, false).getByText("X wins"), "A: the board survives a reload").toBeVisible({ timeout: 30_000 })
})
