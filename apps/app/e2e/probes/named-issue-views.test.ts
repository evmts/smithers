import { chromium, expect as browserExpect } from "@playwright/test"
import * as Factory from "@smthrs/targets/Factory"
import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { startNativeRendererServer } from "../../src/bun/NativeRendererServer"
import { startFullBackend } from "../fixtures/full-backend"

// Same boot boundary as e2e/real/support; keep this Bun probe independent of its Playwright fixture extension.
const BOOTED_SELECTOR =
  ":is([data-testid=\"transcript\"][aria-busy=\"false\"], [data-testid^=\"tab-body-\"]:not([hidden]))"

// Actual self-hosted first owner, Git repository, Go/PostgreSQL and renderer.
// No response interception, external account or configured model is involved.
test("keyboard selection reads every filtered named-view page and survives reload", async () => {
  const dist = resolve(import.meta.dir, "../../dist")
  if (!await Bun.file(join(dist, "index.html")).exists()) {
    throw new Error("Build the current app SPA before running browser probes")
  }
  const backend = await startFullBackend({ labels: true })
  let root: string | undefined
  let renderer: ReturnType<typeof startNativeRendererServer> | undefined
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  const repository = "named-view-keyset"
  const repo = `${backend.username}/${repository}`
  const api = async (path: string, method = "GET", body?: unknown) => {
    const response = await backend.http(path, {
      method,
      ...(body === undefined ? {} : {
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      })
    })
    if (!response.ok) throw new Error(`${method} ${path} refused (${response.status})`)
    return response.json()
  }
  try {
    expect((await api("/api/user")).is_admin).toBe(true)
    await api("/api/user/repos", "POST", { name: repository, private: true, auto_init: true })
    root = await mkdtemp(join(tmpdir(), "smithers-named-view-"))
    const checkout = join(root, "repository")
    const git = async (...args: string[]) => {
      const child = Bun.spawn(["git", ...args], {
        cwd: root,
        env: {
          PATH: process.env.PATH,
          HOME: root,
          TMPDIR: tmpdir(),
          GIT_TERMINAL_PROMPT: "0",
          GIT_CONFIG_COUNT: "1",
          GIT_CONFIG_KEY_0: "http.extraHeader",
          GIT_CONFIG_VALUE_0: `Authorization: Bearer ${backend.token}`
        },
        stdout: "pipe",
        stderr: "pipe"
      })
      const [status] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text()
      ])
      if (status !== 0) throw new Error("Owned factory Git operation refused")
    }
    await git("clone", "--quiet", `${backend.origin}/${repo}.git`, checkout)
    await mkdir(join(checkout, ".smithers"), { recursive: true })
    const options = {
      summary: "Named-view browser fixture.",
      issueViews: [{ id: "bugs", title: "Open bugs", state: "open" as const, labels: ["Bug"] }]
    }
    await writeFile(
      join(checkout, ".smithers", "FACTORY.ts"),
      `import { Smithers as S } from "@smthrs/targets"\nexport const factory = S.Factory(${JSON.stringify(options)})\n`
    )
    await writeFile(join(checkout, ".smithers", "factory.json"), Factory.renderProjection(Factory.Factory(options), []))
    await git("-C", checkout, "add", ".smithers")
    await git(
      "-C",
      checkout,
      "-c",
      "user.name=Browser fixture",
      "-c",
      "user.email=fixture@example.test",
      "commit",
      "--quiet",
      "-m",
      "Declare named issue view"
    )
    await git("-C", checkout, "push", "--quiet", "origin", "HEAD:refs/heads/main")
    expect(await api(`/api/repos/${repo}/issue-views`)).toEqual([{
      id: "bugs",
      title: "Open bugs",
      state: "open",
      labels: ["Bug"]
    }])
    await api(`/api/repos/${repo}/labels`, "POST", { name: "Bug", color: "ff0000", description: "" })
    const matching: number[] = []
    for (let number = 1; number <= 105; number++) {
      const issue = await api(`/api/repos/${repo}/issues`, "POST", {
        title: `Matching bug ${number}`,
        body: "",
        labels: ["Bug"]
      })
      matching.push(issue.number)
    }
    const unrelated = await api(`/api/repos/${repo}/issues`, "POST", { title: "Unlabelled control", body: "" })
    const closed = await api(`/api/repos/${repo}/issues`, "POST", {
      title: "Closed bug control",
      body: "",
      labels: ["Bug"]
    })
    await api(`/api/repos/${repo}/issues/${closed.number}`, "PATCH", { state: "closed" })
    renderer = startNativeRendererServer(dist, backend.origin)
    await backend.signIn(renderer.origin)
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const pages: Array<
      { method: string; path: string; view: string | null; cursor: string | null; status: number; link: string | null }
    > = []
    const responseReads: Promise<void>[] = []
    let phase = "navigation"
    const observed: Array<Record<string, unknown>> = []
    page.on("request", (request) => {
      const url = new URL(request.url())
      if (url.pathname === "/api/user" || url.pathname === `/api/repos/${repo}/issues`) {
        observed.push({ event: "request", phase, time: Date.now(), path: url.pathname, query: url.search })
      }
    })
    page.on("response", (response) => {
      const url = new URL(response.url())
      if (url.pathname === "/api/user" || url.pathname === `/api/repos/${repo}/issues`) {
        observed.push({
          event: "response",
          phase,
          time: Date.now(),
          path: url.pathname,
          query: url.search,
          status: response.status()
        })
      }
      if (url.pathname === `/api/repos/${repo}/issues` && url.searchParams.get("view") === "bugs") {
        responseReads.push(
          response.allHeaders().then((headers) => {
            pages.push({
              method: response.request().method(),
              path: url.pathname,
              view: url.searchParams.get("view"),
              cursor: url.searchParams.get("cursor"),
              status: response.status(),
              link: headers.link ?? null
            })
          })
        )
      }
    })
    await page.goto(`${renderer.origin}/${repo}`)
    await browserExpect(page.locator(BOOTED_SELECTOR).first()).toBeAttached()
    const input = page.getByTestId("composer-input")
    if (!await input.isVisible()) await page.keyboard.press("ControlOrMeta+k")
    await browserExpect(input).toBeVisible()
    await input.fill(`/issues.list all ${repo}`)
    await input.press("Enter")
    const card = page.getByTestId("issue-list").last()
    const bugs = card.getByRole("button", { name: "Open bugs", exact: true })
    await browserExpect(bugs).toBeVisible()
    await input.press("Escape")
    phase = "keyboard focus"
    for (let step = 0; step < 80; step++) {
      if (await bugs.evaluate((button) => button === document.activeElement)) break
      await page.keyboard.press("Tab")
    }
    await browserExpect(bugs).toBeFocused()
    phase = "keyboard activation"
    observed.push({ event: "enter", time: Date.now() })
    await page.keyboard.press("Enter")
    await browserExpect(bugs).toHaveAttribute("aria-pressed", "true")
    await browserExpect(card.locator("li[data-issue]")).toHaveCount(105)
    await browserExpect(card).toContainText("105 Open")
    expect(
      await card.locator("li[data-issue]").evaluateAll((rows) =>
        rows.map((row) => Number(row.getAttribute("data-issue")))
      )
    ).toEqual([...matching].reverse())
    await browserExpect(card.locator(`[data-issue="${unrelated.number}"]`)).toHaveCount(0)
    await browserExpect(card.locator(`[data-issue="${closed.number}"]`)).toHaveCount(0)
    await Promise.all(responseReads)
    console.info("Named-view HTTP ordering", JSON.stringify(observed))
    expect(pages).toHaveLength(2)
    expect(pages.map((receipt) => [receipt.method, receipt.path, receipt.view, receipt.status])).toEqual([
      ["GET", `/api/repos/${repo}/issues`, "bugs", 200],
      ["GET", `/api/repos/${repo}/issues`, "bugs", 200]
    ])
    expect(pages[0]!.cursor).toBeNull()
    expect(pages[0]!.link).toContain("rel=\"next\"")
    expect(pages[1]!.cursor).toBeTruthy()
    expect(pages[1]!.link).toBe(`</api/repos/${repo}/issues?limit=100&view=bugs>; rel="first"`)
    await page.reload()
    await browserExpect(page.locator(BOOTED_SELECTOR).first()).toBeAttached()
    const restored = page.getByTestId("issue-list").last()
    await browserExpect(restored.getByRole("button", { name: "Open bugs", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await browserExpect(restored.locator("li[data-issue]")).toHaveCount(105)
    expect(
      await restored.locator("li[data-issue]").evaluateAll((rows) =>
        rows.map((row) => Number(row.getAttribute("data-issue")))
      )
    ).toEqual([...matching].reverse())
    expect(page.url()).toContain(`/${repo}`)
  } finally {
    try {
      await browser?.close()
    } finally {
      try {
        await renderer?.stop()
      } finally {
        try {
          await backend.stop()
        } finally {
          if (root) await rm(root, { recursive: true, force: true })
        }
      }
    }
  }
}, 120000)
