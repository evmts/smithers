import { test, expect } from "@playwright/test"
import { spawn, execFileSync, type ChildProcess } from "node:child_process"
import { readFile, writeFile, rm, stat, symlink } from "node:fs/promises"
import { once } from "node:events"
import { resolve, join } from "node:path"
import { createServer } from "node:net"
import { createServer as createHttpServer } from "node:http"
import { tmpdir } from "node:os"

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
  const root = execFileSync("mktemp", ["-d", join(tmpdir(), "smithers-gateway.XXXXXX")], { encoding: "utf8" }).trim()
  const children: ChildProcess[] = []
  const output: string[] = []
  const upstreamRequests: string[] = []
  const tripwire = createHttpServer((request, response) => {
    upstreamRequests.push(`${request.method} ${request.url}`)
    request.resume()
    response.writeHead(502).end()
  })
  // HTTPS proxies use CONNECT; record it without opening a tunnel.
  tripwire.on("connect", (request, socket) => {
    upstreamRequests.push(`CONNECT ${request.url}`)
    socket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n")
  })
  const launch = (command: string, args: string[]) => {
    const child = spawn(command, args, { cwd: repository, env: childEnv, stdio: ["ignore", "pipe", "pipe"] })
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
  const childEnv = { ...process.env, SMITHERS_TOKEN: "" }
  const responseChecks: Promise<void>[] = []
  const responseLeaks: string[] = []
  const responseErrors: string[] = []
  try {
    tripwire.listen(0, "127.0.0.1")
    await once(tripwire, "listening")
    const upstream = `http://127.0.0.1:${(tripwire.address() as { port: number }).port}`
    Object.assign(childEnv, {
      SMITHERS_BACKEND_API: upstream, SMITHERS_CLOUD_API: upstream,
      SMITHERS_API_ORIGIN: upstream, SMITHERS_URL: upstream,
      SMITHERS_CLOUD_WS_ORIGIN: upstream,
      // Identity's upstream is a constant in server.ts; the proxy catches it.
      HTTP_PROXY: upstream, HTTPS_PROXY: upstream, NO_PROXY: "localhost,127.0.0.1,::1",
      http_proxy: upstream, https_proxy: upstream, no_proxy: "localhost,127.0.0.1,::1",
      NODE_USE_ENV_PROXY: "1"
    })
    await symlink(join(repository, "node_modules"), join(root, "node_modules"), "dir")
    await run(["init", "local-gateway-question"])
    await writeFile(join(root, ".smithers/flows/local-gateway-question/flow.ts"), await readFile(join(__dirname, "HumanTask.fixture.ts"), "utf8"))
    const flow = launch(process.execPath, [cli, "flow", "start", "local-gateway-question", "--data", "{}", "--format", "json", "--root", root])
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
      expect((request.postData() ?? "").includes(token), "Operator token in request body").toBe(false)
      expect(JSON.stringify(request.headers()).includes(token), "Operator token in request headers").toBe(false)
    })
    page.on("websocket", socket => { if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(socket.url()).hostname)) external.push(socket.url()) })
    // A shell that never boots must say why: browser errors, failed responses and server output.
    page.on("console", message => { if (message.type() === "error") output.push(`[console] ${message.text()}\n`) })
    page.on("pageerror", error => output.push(`[pageerror] ${error.message}\n`))
    page.on("response", response => { if (response.status() >= 400) output.push(`[http ${response.status()}] ${response.request().method()} ${response.url()}\n`) })
    page.on("response", response => {
      responseChecks.push(response.headersArray().then(headers => {
        if (JSON.stringify(headers).includes(token)) responseLeaks.push(`headers ${response.url()}`)
      }).catch(() => { responseErrors.push(`Could not inspect headers ${response.url()}`) }))
    })
    // Buffer real same-origin responses before delivery, including responses the
    // app later cancels. No fixture or synthetic response replaces the host.
    await page.route(`${origin}/**`, async route => {
      const check = (async () => {
        const response = await route.fetch({ maxRedirects: 0 })
        if (JSON.stringify(response.headersArray()).includes(token)) responseLeaks.push(`headers ${route.request().url()}`)
        const body = await response.body()
        if (body.includes(Buffer.from(token))) responseLeaks.push(`body ${route.request().url()}`)
        await route.fulfill({ response, body })
      })().catch(() => { responseErrors.push(`Could not inspect ${route.request().url()}`) })
      responseChecks.push(check)
      await check
    })
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
    // The attached executor stays alive while its HumanTask awaits this answer.
    expect(flow.exitCode).toBeNull()
    expect(flow.signalCode).toBeNull()
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
    await expect.poll(() => flow.exitCode, { timeout: 30_000 }).toBe(0)
    expect(flow.signalCode).toBeNull()
    // Responses arriving while earlier bodies finish must also be checked.
    let inspected = 0
    while (inspected < responseChecks.length) {
      const batch = responseChecks.slice(inspected)
      inspected += batch.length
      await Promise.all(batch)
    }
    expect(responseErrors, "Every browser response was inspected").toEqual([])
    expect(responseLeaks, "Operator token in browser responses").toEqual([])
    expect(upstreamRequests, "Host/CLI/flow upstream requests").toEqual([])
    expect(external).toEqual([])
    expect(output.join("")).not.toContain(token)
    expect(await page.content()).not.toContain(token)
  } catch (error) {
    // A failing journey says why: page text, browser errors, failed responses, child exits and server output.
    const report = `--- page text ---\n${await page.locator("body").innerText().catch(() => "")}\n--- output ---\n${output.join("")}`
    const failure = `${(error as Error).message}\n${report}`
    throw new Error(token ? failure.replaceAll(token, "[operator token]") : failure)
  } finally {
    for (const child of children.reverse()) await stop(child)
    tripwire.closeAllConnections()
    await new Promise<void>((yes, no) => tripwire.close(error => error ? no(error) : yes()))
    await rm(root, { recursive: true, force: true })
  }
})
