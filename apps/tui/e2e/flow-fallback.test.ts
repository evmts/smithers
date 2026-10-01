/** Real frontmatter discovery, HTTP refusal, fallback, and durable completion. */
import { expect, it } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { key, Tui } from "./tmux.ts"

it("runs the next declared model after context overflow", async () => {
  const root = mkdtempSync(join(tmpdir(), "tui-fallback-"))
  const project = join(root, "project")
  mkdirSync(join(project, "flows/fallback"), { recursive: true })
  writeFileSync(
    join(project, "flows/fallback/flow.mdx"),
    // Markdown is a custom agent; its declared model backups run through the production worker host.
    "---\ndescription: Test fallback\nmodel: [openai:first, openai:second]\nmetadata:\n  tui:\n    keys:\n      - key: alt+p\n        label: Fallback\n        action: { kind: flow, flow: fallback }\n---\nAnswer Pong.\n"
  )
  const log = join(root, "requests.log")
  let tui: Tui | undefined
  try {
    tui = await Tui.start({
      cwd: project,
      command: `bun ${resolve(import.meta.dir, "real-flows-fixture.tsx")}`,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        SMITHERS_TUI_SESSION_DIR: join(root, "sessions"),
        TUI_MODEL_LOG: log,
        TUI_REFUSED_MODEL: "first",
        TUI_REFUSAL: "overflow"
      }
    })
    await tui.until((screen) => /↑\S+ ↓\S+/.test(screen), 20_000, "first draw")
    await tui.type("/flow fallback")
    await tui.press(key.enter)
    await tui.until(
      (screen) => screen.includes("fallback: Test fallback") && /Done \d+s · second/.test(screen),
      30_000,
      "fallback completion"
    )
    await tui.press(key.ctrlS)
    await tui.until((screen) => screen.includes("Done 1"), 5_000, "completed worker")
    await tui.press(" ")
    await tui.until((screen) => screen.includes("Pong."), 5_000, "actual worker answer")
    const requests = readFileSync(log, "utf8").trim().split("\n")
    expect(requests.slice(0, 2)).toEqual(["first", "second"])
    expect(tui.screen()).not.toContain("Failed.")
  } catch (error) {
    // Preserve actual requests and the production-redacted log before scratch cleanup.
    const evidence = mkdtempSync(join(dirname(root), "..", "tui-fallback-evidence-"))
    for (const [name, path] of [["requests.log", log], ["tui.log", join(root, "sessions", "tui.log")]] as const) {
      if (existsSync(path)) writeFileSync(join(evidence, name), readFileSync(path))
    }
    if (tui !== undefined) writeFileSync(join(evidence, "screen.txt"), tui.screen())
    console.error(`Fallback failure evidence: ${evidence}`)
    throw error
  } finally {
    await tui?.stop()
    rmSync(root, { recursive: true, force: true })
  }
}, 60_000)
