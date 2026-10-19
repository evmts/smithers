import { test, expect } from "@playwright/test"
import { spawn, execFileSync, type ChildProcess } from "node:child_process"
import { readFile, writeFile, rm, stat, symlink } from "node:fs/promises"
import { once } from "node:events"
import { resolve, join } from "node:path"
import { createServer } from "node:net"

const repository = resolve(__dirname, "../../../..")
const cli = join(repository, "packages/smithers/bin/smithers.mjs")
const freePort = async () => {
  const socket = createServer()
  socket.listen(0, "127.0.0.1")
  await once(socket, "listening")
  const port = (socket.address() as { port: number }).port
  await new Promise<void>((yes, no) => socket.close(error => error ? no(error) : yes()))
  return port
}
const stop = async (child: ChildProcess | undefined) => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const checkParent = () => {
    const parent = Number(execFileSync("ps", ["-o", "ppid=", "-p", String(child.pid)], { encoding: "utf8" }).trim())
    if (parent !== process.pid) throw new Error("Refusing to stop a process outside this test's children")
  }
  checkParent()
  const exited = once(child, "exit")
  child.kill("SIGTERM")
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const stopped = await Promise.race([exited.then(() => true), new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 5000) })])
    if (!stopped && child.exitCode === null && child.signalCode === null) {
      checkParent()
      child.kill("SIGKILL")
    }
    await exited
  } finally { clearTimeout(timer) }
}

test("RunsInbox answers a real parked HumanTask through the local gateway without external requests", async ({ page }) => {
  const root = execFileSync("mktemp", ["-d", join(repository, ".gateway-fixture.XXXXXX")], { encoding: "utf8" }).trim()
  const children: ChildProcess[] = []
  const output: string[] = []
  const launch = (command: string, args: string[]) => {
    const child = spawn(command, args, { cwd: repository, env: { ...process.env, SMITHERS_TOKEN: "" }, stdio: ["ignore", "pipe", "pipe"] })
    child.stdout!.on("data", bytes => output.push(String(bytes)))
    child.stderr!.on("data", bytes => output.push(String(bytes)))
    child.on("exit", (code, signal) => output.push(`[exit] ${args.slice(0, 3).join(" ")}: ${code ?? signal}\n`))
    children.push(child)
    return child
  }
  const run = async (args: string[]) => {
    const child = launch(process.execPath, [cli, ...args, "--root", root])
    const [code] = await once(child, "exit")
    expect(code, output.join("")).toBe(0)
  }
  let token = ""
  try {
    await symlink(join(repository, "node_modules"), join(root, "node_modules"), "dir")
    await run(["init", "local-gateway-question"])
    await writeFile(join(root, ".smithers/flows/local-gateway-question/flow.ts"), await readFile(join(__dirname, "HumanTask.fixture.ts"), "utf8"))
    launch(process.execPath, [cli, "flow", "start", "local-gateway-question", "--data", "{}", "--format", "json", "--root", root])
    const port = await freePort()
    const tokenFile = join(root, "operator-token")
    launch(process.execPath, [cli, "serve", "--root", root, "--port", String(port), "--operator-token-file", tokenFile])
    await expect.poll(async () => fetch(`http://127.0.0.1:${port}/health`).then(r => r.status).catch(() => 0)).toBe(200)
    token = (await readFile(tokenFile, "utf8")).trim()
    expect((await stat(tokenFile)).mode & 0o777).toBe(0o600)
    expect(output.join("")).not.toContain(token)
    launch("bun", ["apps/app/src/bun/serve.ts", "--root", root, "--repo", "local/project", "--gateway", `http://127.0.0.1:${port}`, "--gateway-token-file", tokenFile, "--dist", resolve(repository, "apps/app/dist"), "--origin", "http://localhost:0"])
    await expect.poll(() => output.join("").match(/SMITHERS_LOCAL_ORIGIN=(http:\/\/localhost:\d+)/)?.[1]).toBeTruthy()
    const origin = output.join("").match(/SMITHERS_LOCAL_ORIGIN=(http:\/\/localhost:\d+)/)![1]!
    const external: string[] = []
    page.on("request", request => {
      const url = new URL(request.url())
      if (["http:", "https:"].includes(url.protocol) && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) external.push(request.url())
      expect(request.postData() ?? "").not.toContain(token)
      expect(JSON.stringify(request.headers())).not.toContain(token)
    })
    page.on("websocket", socket => { if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(socket.url()).hostname)) external.push(socket.url()) })
    // A shell that never boots must say why: browser errors, failed responses and server output.
    page.on("console", message => { if (message.type() === "error") output.push(`[console] ${message.text()}\n`) })
    page.on("pageerror", error => output.push(`[pageerror] ${error.message}\n`))
    page.on("response", response => { if (response.status() >= 400) output.push(`[http ${response.status()}] ${response.request().method()} ${response.url()}\n`) })
    await page.addInitScript("globalThis.__name = value => value")
    await page.goto(origin)
    await expect(page.locator(".app-shell")).toBeVisible({ timeout: 60_000 })
    const send = async (text: string) => {
      const input = page.getByTestId("composer-input")
      if (!await input.isVisible()) await page.keyboard.press("Control+k")
      await input.fill(text)
      await input.press("Enter")
    }
    await send('/runs.list {"repo":"local/project"}')
    await expect(page.getByTestId("runs-inbox-needs-you")).toContainText("local-gateway-question", { timeout: 30_000 })
    const runId = (await page.getByTestId("runs-inbox-needs-you").locator("[data-testid^=runs-answer-]").first().getAttribute("data-testid"))!.replace("runs-answer-", "")
    await send('/runs {"operation":"approval-list","repo":"local/project"}')
    await expect(page.getByTestId("approval-answer-text")).toBeVisible()
    await page.getByTestId("approval-answer-text").fill('{"choice":"loopback"}')
    await page.getByTestId("approval-answer-send").click()
    await expect(page.getByTestId("approvals-inbox-count")).toHaveText("0 approvals pending", { timeout: 30_000 })
    await expect.poll(async () => {
      await page.locator('[data-kind="run-list"]').first().getByRole("button", { name: "Refresh", exact: true }).click()
      return page.getByTestId("runs-inbox-done").getByTestId(`runs-open-${runId}`).count()
    }, { timeout: 30_000 }).toBe(1)
    expect(external).toEqual([])
    expect(output.join("")).not.toContain(token)
    expect(await page.content()).not.toContain(token)
  } catch (error) {
    // A failing journey says why: page text, browser errors, failed responses, child exits and server output.
    const report = `--- page text ---\n${await page.locator("body").innerText().catch(() => "")}\n--- output ---\n${output.join("")}`
    throw new Error(`${(error as Error).message}\n${token ? report.replaceAll(token, "[operator token]") : report}`)
  } finally {
    for (const child of children.reverse()) await stop(child)
    await rm(root, { recursive: true, force: true })
  }
})
