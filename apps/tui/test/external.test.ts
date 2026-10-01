import { describe, expect, it } from "bun:test"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as External from "../src/external.ts"

describe("external editor", () => {
  it("passes the file safely under a path with spaces, keeps editor arguments, and removes the file", async () => {
    const parent = join(mkdtempSync(join(tmpdir(), "tui-editor-")), "with space")
    mkdirSync(parent)
    expect(await External.edit("draft", "printf 'edited\\n' >", parent)).toBe("edited")
    expect(readdirSync(parent)).toEqual([])
  })

  it("keeps the draft when the editor fails, and still removes the file", async () => {
    const parent = mkdtempSync(join(tmpdir(), "tui-editor-"))
    expect(await External.edit("draft", "false", parent)).toBeUndefined()
    expect(readdirSync(parent)).toEqual([])
    expect(existsSync(parent)).toBe(true)
  })
})

describe("bounded quit", () => {
  it("returns when the work settles", async () => {
    const started = Date.now()
    await External.bounded(Promise.resolve(), 5_000)
    expect(Date.now() - started).toBeLessThan(1_000)
  })

  it("returns after the bound when the work hangs", async () => {
    const started = Date.now()
    await External.bounded(new Promise(() => {}), 100)
    expect(Date.now() - started).toBeGreaterThanOrEqual(90)
  })

  it("returns when the work rejects", async () => {
    await External.bounded(Promise.reject(new Error("dispose failed")), 5_000)
  })
})

it("keeps the event loop responsive while the external editor is open", async () => {
  let progressed = false
  const timer = setTimeout(() => {
    progressed = true
  }, 10)
  try {
    await External.edit("draft", "sleep 0.2; printf edited >")
    expect(progressed).toBe(true)
  } finally {
    clearTimeout(timer)
  }
})

it("releases a cancelled editor before queued work starts with exact arguments and cwd", async () => {
  const root = mkdtempSync(join(tmpdir(), "tui-terminal with space-"))
  const ready = join(root, "ready.json")
  const result = join(root, "result.json")
  const editor = join(root, "editor.cjs")
  const worker = join(root, "worker.cjs")
  const controller = new AbortController()
  const quote = (value: string) => "'" + value.replaceAll("'", "'\"'\"'") + "'"
  writeFileSync(
    editor,
    `const fs=require('node:fs'); fs.writeFileSync(${
      JSON.stringify(ready)
    },JSON.stringify({pid:process.pid,file:process.argv[2]})); setInterval(()=>{},1000)`
  )
  writeFileSync(
    worker,
    `require('node:fs').writeFileSync(${
      JSON.stringify(result)
    },JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2),editorDead:(()=>{try{process.kill(JSON.parse(require('node:fs').readFileSync(${
      JSON.stringify(ready)
    },'utf8')).pid,0);return false}catch(error){if(error.code!=='ESRCH')throw error;return true}})(),draftGone:!require('node:fs').existsSync(JSON.parse(require('node:fs').readFileSync(${
      JSON.stringify(ready)
    },'utf8')).file)})); process.exit(23)`
  )
  const first = External.exclusive(() =>
    External.edit("unsent draft", `${quote(process.execPath)} ${quote(editor)}`, root, controller.signal)
  )
  let second: Promise<number | null> | undefined
  try {
    const deadline = Date.now() + 2000
    while (!existsSync(ready) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10))
    expect(existsSync(ready)).toBe(true)
    const held: { pid: number; file: string } = JSON.parse(readFileSync(ready, "utf8"))
    expect(readFileSync(held.file, "utf8")).toBe("unsent draft")
    const args = ["with space", "literal'quote", "$(not-executed); still literal"]
    let settled = false
    second = External.exclusive(() => External.run(process.execPath, [worker, ...args], root))
    void second.then(() => {
      settled = true
    }, () => {
      settled = true
    })
    await new Promise((resolve) => setImmediate(resolve))
    expect(settled).toBe(false)
    expect(existsSync(result)).toBe(false)
    controller.abort()
    expect(await first).toBeUndefined()
    expect(existsSync(held.file)).toBe(false)
    expect(() => process.kill(held.pid, 0)).toThrow()
    expect(await second).toBe(23)
    expect(JSON.parse(readFileSync(result, "utf8"))).toEqual({
      cwd: realpathSync(root),
      args,
      editorDead: true,
      draftGone: true
    })
    expect(readdirSync(root).sort()).toEqual(["editor.cjs", "ready.json", "result.json", "worker.cjs"])
  } finally {
    controller.abort()
    await Promise.allSettled([first, ...(second === undefined ? [] : [second])])
    rmSync(root, { recursive: true, force: true })
  }
})

it("recovers exclusive ownership after an unavailable editor and removes both draft files", async () => {
  const root = mkdtempSync(join(tmpdir(), "tui-editor-recovery-"))
  const failed = External.exclusive(() => External.edit("private draft", "exit 127;", root))
  const recovered = External.exclusive(() => External.edit("next draft", "printf 'recovered\\n' >", root))
  try {
    await expect(failed).rejects.toThrow("Editor unavailable (exit 127)")
    expect(await recovered).toBe("recovered")
    expect(readdirSync(root)).toEqual([])
  } finally {
    await Promise.allSettled([failed, recovered])
    rmSync(root, { recursive: true, force: true })
  }
})

it("does not create a draft or execute an already cancelled editor", async () => {
  const root = mkdtempSync(join(tmpdir(), "tui-editor-cancelled-"))
  const controller = new AbortController()
  controller.abort()
  try {
    expect(await External.edit("private draft", "printf unexpected >", root, controller.signal)).toBeUndefined()
    expect(readdirSync(root)).toEqual([])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
