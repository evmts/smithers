import { type Renderable, ScrollBoxRenderable, TextareaRenderable } from "@opentui/core"
import { testRender } from "@opentui/react/test-utils"
import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setImmediate } from "node:timers/promises"
import { act } from "react"
import { App } from "../src/app.tsx"
import * as Files from "../src/files.ts"
import { fixture } from "./diff-focus-fixture.ts"

let root: string
let data: ReturnType<typeof fixture>
let setup: Awaited<ReturnType<typeof testRender>>
let previousSessions: string | undefined
let previousRepo: string | undefined
let files: ReturnType<typeof spyOn<typeof Files, "lister">>
const frame = () => setup.captureCharFrame()
const find = <T extends Renderable>(node: Renderable, kind: new(...args: Array<never>) => T): T | undefined => {
  if (node instanceof kind) return node
  for (const child of node.getChildren()) {
    const found = find(child, kind)
    if (found !== undefined) return found
  }
  return undefined
}
const composer = () => find(setup.renderer.root, TextareaRenderable)!
const waitFor = async (predicate: () => boolean) => {
  const deadline = Date.now() + 4000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(frame())
    await act(async () => {
      await setImmediate()
      await setup.renderOnce()
    })
  }
}
const key = async (name: string, modifiers: { ctrl?: boolean; meta?: boolean } = {}) => {
  await act(async () => {
    setup.mockInput.pressKey(name, modifiers)
    await setImmediate()
  })
  await setup.renderOnce()
}
const text = async (value: string) => {
  await act(async () => {
    await setup.mockInput.typeText(value)
  })
  await setup.renderOnce()
}
const evidence = (name: string) => {
  const directory = process.env.SMITHERS_DIFF_FOCUS_EVIDENCE
  if (directory !== undefined) writeFileSync(join(directory, `${name}.txt`), frame())
}
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "tui-diff-focus-"))
  previousSessions = process.env.SMITHERS_TUI_SESSION_DIR
  previousRepo = process.env.SMITHERS_REPO
  process.env.SMITHERS_TUI_SESSION_DIR = join(root, "sessions")
  process.env.SMITHERS_REPO = "fixture/diff-focus"
  files = spyOn(Files, "lister").mockImplementation(() => () => [])
  data = fixture(root)
  await act(async () => {
    setup = await testRender(
      <App host={data.host} resume={data.saved.file} seat="replay:fixture" models={[]} contextWindow={() => 10000} />,
      { width: 110, height: 32, exitOnCtrlC: false, kittyKeyboard: true }
    )
    await setImmediate()
  })
  await setup.renderOnce()
  await waitFor(() => frame().includes("Review beta") && frame().includes("d Diff"))
})
afterEach(async () => {
  for (const turn of data.turns) turn.resolve({ _tag: "cancelled" })
  await act(async () => {
    setup?.renderer.destroy()
    await setImmediate()
  })
  files.mockRestore()
  if (previousSessions === undefined) delete process.env.SMITHERS_TUI_SESSION_DIR
  else process.env.SMITHERS_TUI_SESSION_DIR = previousSessions
  if (previousRepo === undefined) delete process.env.SMITHERS_REPO
  else process.env.SMITHERS_REPO = previousRepo
  rmSync(root, { recursive: true, force: true })
})

test("card diff closes to the same card; undo asks without editing or typing u", async () => {
  await key("TAB")
  await key("d")
  await waitFor(() => frame().includes("Review beta  1 file"))
  expect(frame()).toContain("beta.ts  +60 −60")
  expect(frame()).not.toContain("alpha.ts  +60 −60")
  evidence("native-open")
  await key("\x1b[27u")
  await waitFor(() => !frame().includes("Review beta  1 file"))
  evidence("native-closed")
  await key("u")
  await waitFor(() => frame().includes("Undo Review beta"))
  evidence("native-undo")
  expect(composer().plainText).toBe("")
  expect(readFileSync(join(data.cwd, "beta.ts"), "utf8")).toBe("new\n".repeat(60))
  expect(readFileSync(join(data.cwd, "alpha.ts"), "utf8")).toBe("new\n".repeat(60))
  await key("\x1b[27u")
  await waitFor(() => !frame().includes("Undo Review beta"))
  await key("TAB")
  await key("ARROW_LEFT")
  await key("d")
  await waitFor(() => frame().includes("Review alpha  1 file"))
  await key("\x1b[27u")
  await key("\x1b[27u")
  await text("ordinary u text")
  expect(composer().plainText).toBe("ordinary u text")
  expect(data.prompts).toEqual([])
})

test("review scroll keys scroll the diff and leave its return card selected", async () => {
  await key("TAB")
  await key("d")
  await waitFor(() => frame().includes("Review beta  1 file"))
  const scroll = find(setup.renderer.root, ScrollBoxRenderable)!
  expect(scroll.scrollTop).toBe(0)
  await key("ARROW_DOWN")
  expect(scroll.scrollTop).toBe(1)
  await key("j")
  expect(scroll.scrollTop).toBe(2)
  await key("\x1b[6~")
  const paged = scroll.scrollTop
  expect(paged).toBeGreaterThan(2)
  await key("k")
  expect(scroll.scrollTop).toBe(paged - 1)
  await key("ARROW_UP")
  expect(scroll.scrollTop).toBe(paged - 2)
  await key("\x1b[5~")
  expect(scroll.scrollTop).toBe(0)
  await key("\x1b[27u")
  await key("u")
  await waitFor(() => frame().includes("Undo Review beta"))
  expect(composer().plainText).toBe("")
})

test("closing a worker-tab diff returns typing to that worker's composer", async () => {
  await key("TAB")
  await key("ARROW_LEFT")
  await key("RETURN")
  await waitFor(() => frame().includes("Continue Review alpha"))
  await key("v", { meta: true })
  await waitFor(() => frame().includes("Review alpha  1 file"))
  await key("\x1b[27u")
  await text("worker u text")
  expect(composer().plainText).toBe("worker u text")
  expect(composer().focused).toBe(true)
  expect(frame()).toContain("Back (ctrl+y)")
})

test("Summary diff returns to its selected worker row", async () => {
  await key("s", { ctrl: true })
  await key("ARROW_DOWN")
  await key("d")
  await waitFor(() => frame().includes("Review beta  1 file"))
  await key("\x1b[27u")
  await key("u")
  await waitFor(() => frame().includes("Undo Review beta"))
  expect(composer().plainText).toBe("")
})

test("palette diff preserves an ordinary composer draft without selecting a card", async () => {
  await text("draft ")
  await key("k", { ctrl: true })
  await text("Diff Review beta")
  await key("RETURN")
  await waitFor(() => frame().includes("Review beta  1 file"))
  await key("\x1b[27u")
  await text("u text")
  expect(composer().plainText).toBe("draft u text")
  expect(composer().focused).toBe(true)
})

test("switching surfaces while reviewing clears the borrowed card selection", async () => {
  await key("TAB")
  await key("d")
  await waitFor(() => frame().includes("Review beta  1 file"))
  await key("s", { ctrl: true })
  await waitFor(() => !frame().includes("Review beta  1 file"))
  await key("s", { ctrl: true })
  await text("u")
  expect(composer().plainText).toBe("u")
  expect(frame()).not.toContain("Undo Review beta")
  expect(frame()).not.toContain("Review beta  1 file")
})

test("removing the reviewed worker rows closes the diff and restores ordinary typing", async () => {
  await key("TAB")
  await key("d")
  await waitFor(() => frame().includes("Review beta  1 file"))
  await key("k", { ctrl: true })
  await text("/new")
  await key("RETURN")
  await waitFor(() => !frame().includes("Review beta"))
  await text("u")
  expect(composer().plainText).toBe("u")
  expect(frame()).not.toContain("Undo Review beta")
})

test("a later writer's file is refused without confirmation or mutation after closing the diff", async () => {
  writeFileSync(join(data.cwd, "beta.ts"), "later writer\n")
  await key("TAB")
  await key("d")
  await waitFor(() => frame().includes("Review beta  1 file"))
  await key("\x1b[27u")
  await key("u")
  await waitFor(() => frame().includes("changed since"))
  expect(frame()).not.toContain("Undo Review beta")
  expect(composer().plainText).toBe("")
  expect(readFileSync(join(data.cwd, "beta.ts"), "utf8")).toBe("later writer\n")
})

test("review undo stays guarded while another run is live", async () => {
  await text("Coordinate more work")
  await key("RETURN")
  await waitFor(() => data.turns.length === 1)
  const lines = frame().split("\n")
  const row = lines.findLastIndex((line) => line.includes("d Diff"))
  await act(async () => {
    await setup.mockMouse.click(lines[row]!.indexOf("d Diff") + 1, row)
  })
  await setup.renderOnce()
  await waitFor(() => frame().includes("Review beta  1 file"))
  await key("u")
  expect(frame()).not.toContain("Undo Review beta")
  expect(composer().plainText).toBe("")
  expect(readFileSync(join(data.cwd, "beta.ts"), "utf8")).toBe("new\n".repeat(60))
  await act(async () => {
    data.turns[0]!.resolve({ _tag: "done", answer: "Finished" })
    await setImmediate()
  })
  await waitFor(() => frame().includes("u Undo"))
  await key("u")
  await waitFor(() => frame().includes("Undo Review beta"))
  expect(composer().plainText).toBe("")
})
