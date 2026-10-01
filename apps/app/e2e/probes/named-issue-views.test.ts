import { chromium, expect as browserExpect } from "@playwright/test"
import * as Factory from "@smthrs/targets/Factory"
import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { startNativeRendererServer } from "../../src/bun/NativeRendererServer"
import { startFullBackend } from "../fixtures/full-backend"
import { key, Tui } from "../../../tui/e2e/tmux"

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
    page.on("response", (response) => {
      const url = new URL(response.url())
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
    for (let step = 0; step < 80; step++) {
      if (await bugs.evaluate((button) => button === document.activeElement)) break
      await page.keyboard.press("Tab")
    }
    await browserExpect(bugs).toBeFocused()
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

// The supported selfhost first owner drives the real terminal against Go/PostgreSQL. The public
// --model flag is a startup prerequisite only: no model request or replay occurs.
test("terminal keyboard reads every owned named-view page and refreshes after restart", async () => {
  const backend = await startFullBackend({ labels: true })
  let root: string | undefined
  let tui: Tui | undefined
  let token: string | undefined
  let tokenID: number | undefined
  const username = backend.username
  const repository = "terminal-named-view"
  const repo = `${username}/${repository}`
  const repoPath = `/api/repos/${repo}`
  const setup = async <T>(path: string, body: unknown): Promise<T> => {
    const response = await backend.http(path, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
    })
    expect(response.status).toBe(201)
    return response.json() as Promise<T>
  }
  const api = async <T>(path: string, method = "GET", body?: unknown): Promise<T> => {
    const response = await fetch(backend.origin + path, {
      method,
      headers: { authorization: `token ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
    expect(response.status).toBe(method === "POST" ? 201 : 200)
    return response.json() as Promise<T>
  }
  try {
    const owner = await backend.http("/api/user")
    expect(owner.status).toBe(200)
    expect(await owner.json()).toMatchObject({ username, is_admin: true })
    const credential = await setup<{ token: string; id: number }>("/api/user/tokens", {
      name: "terminal-owned-view", scopes: ["all"]
    })
    expect(typeof credential.token).toBe("string")
    expect(Number.isSafeInteger(credential.id)).toBe(true)
    token = credential.token
    tokenID = credential.id
    expect(await api("/api/user")).toMatchObject({ username, is_admin: true })
    expect(await api("/api/user/repos", "POST", { name: repository, private: true, auto_init: true }))
      .toMatchObject({ full_name: repo })
    const other = await api<{ full_name: string }>("/api/user/repos", "POST", {
      name: "terminal-other", private: true, auto_init: false
    })
    await api(`/api/repos/${other.full_name}/issues`, "POST", { title: "Other repository control", body: "" })
    root = await mkdtemp(join(tmpdir(), "smithers-terminal-view-"))
    const checkout = join(root, "repository")
    const git = async (...args: string[]) => {
      const child = Bun.spawn(["git", ...args], {
        cwd: root,
        env: {
          PATH: process.env.PATH, HOME: root, TMPDIR: tmpdir(), GIT_TERMINAL_PROMPT: "0",
          GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Bearer ${token}`
        },
        stdout: "pipe", stderr: "pipe"
      })
      const [code] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
      if (code !== 0) throw new Error("Owned terminal factory Git operation refused")
    }
    await git("clone", "--quiet", `${backend.origin}/${repo}.git`, checkout)
    await mkdir(join(checkout, ".smithers"), { recursive: true })
    const options = {
      summary: "Terminal fixture.",
      issueViews: [{ id: "bugs", title: "Open bugs", state: "open" as const, labels: ["Bug"] }]
    }
    await writeFile(join(checkout, ".smithers", "FACTORY.ts"),
      `import { Smithers as S } from "@smthrs/targets"\nexport const factory = S.Factory(${JSON.stringify(options)})\n`)
    await writeFile(join(checkout, ".smithers", "factory.json"), Factory.renderProjection(Factory.Factory(options), []))
    await git("-C", checkout, "add", ".smithers")
    await git("-C", checkout, "-c", "user.name=Terminal fixture", "-c", "user.email=fixture@example.test",
      "commit", "--quiet", "-m", "Declare terminal issue view")
    await git("-C", checkout, "push", "--quiet", "origin", "HEAD:refs/heads/main")
    expect(await api<Array<{ id: string; title: string; state: string; labels: string[] }>>(`${repoPath}/issue-views`)).toEqual([{
      id: "bugs", title: "Open bugs", state: "open", labels: ["Bug"]
    }])
    await api(`${repoPath}/labels`, "POST", { name: "Bug", color: "ff0000", description: "" })
    const matching: number[] = []
    for (let index = 1; index <= 105; index++) {
      const issue = await api<{ number: number }>(`${repoPath}/issues`, "POST", {
        title: `Matched item ${index}`, body: "", labels: ["Bug"]
      })
      matching.push(issue.number)
    }
    const unrelated = await api<{ number: number }>(`${repoPath}/issues`, "POST", { title: "Unlabelled control", body: "" })
    const closed = await api<{ number: number }>(`${repoPath}/issues`, "POST", {
      title: "Closed control", body: "", labels: ["Bug"]
    })
    await api(`${repoPath}/issues/${closed.number}`, "PATCH", { state: "closed" })
    const readView = async (expectedLastPage: number) => {
      const numbers: number[] = []
      let url = new URL(`${repoPath}/issues?view=bugs&limit=100`, backend.origin)
      let pages = 0
      while (true) {
        const response = await fetch(url, { headers: { authorization: `token ${token}` } })
        expect(response.status).toBe(200)
        const page = await response.json() as Array<{ number: number }>
        expect(page).toHaveLength(pages === 0 ? 100 : expectedLastPage)
        numbers.push(...page.map(issue => issue.number))
        pages++
        const link = response.headers.get("link")
        expect(link).not.toBeNull()
        const next = /<([^>]+)>;\s*rel="next"/.exec(link!)
        if (!next) {
          expect(link).toBe(`</api/repos/${repo}/issues?limit=100&view=bugs>; rel="first"`)
          break
        }
        url = new URL(next![1]!, url)
        expect(url.origin).toBe(backend.origin)
        expect(url.pathname).toBe(`${repoPath}/issues`)
        expect(url.searchParams.get("view")).toBe("bugs")
        expect(pages).toBeLessThan(3)
      }
      expect(pages).toBe(2)
      expect(new Set(numbers).size).toBe(numbers.length)
      return numbers
    }
    expect(await readView(5)).toEqual([...matching].reverse())
    const start = async () => {
      tui = await Tui.start({
        cwd: checkout, cols: 110, rows: 40,
        command: `bun ${resolve(import.meta.dir, "../../../tui/src/main.tsx")} --model cerebras:qwen-3.8-27b`,
        env: {
          PATH: process.env.PATH ?? "", HOME: root!, XDG_CONFIG_HOME: root!,
          SMITHERS_TUI_SESSION_DIR: join(root!, "sessions"), SMITHERS_API_ORIGIN: backend.origin,
          SMITHERS_TOKEN: token!, SMITHERS_REPO: repo
        }
      })
      await tui.until(screen => /↑\S+ ↓\S+/.test(screen), 20000, "actual terminal startup without model execution")
    }
    const selectRow = async (label: string) => {
      const deadline = Date.now() + 5000
      while (!tui!.screen().split("\n").some(line => line.includes("›") && line.includes(label))) {
        if (Date.now() >= deadline) throw new Error(`${label} keyboard selection timed out`)
        const before = tui!.screen()
        await tui!.press(key.up)
        await tui!.until(screen => screen !== before, Math.max(1, deadline - Date.now()), "keyboard row selection")
      }
    }
    const open = async (count: number) => {
      await tui!.type("/smithers")
      await tui!.press(key.enter)
      await tui!.until(screen => screen.includes("Issue views"), 5000, "existing Smithers door")
      await selectRow("Issue views")
      await tui!.press(key.enter)
      await tui!.until(screen => screen.includes("Open bugs"), 5000, "Git-declared view")
      await selectRow("Open bugs")
      await tui!.press(key.enter)
      await tui!.until(screen => screen.includes(`Open bugs · ${count}`), 5000, "complete actual backend view")
    }
    const readTerminal = async (expected: number[]) => {
      const seen = new Set<number>()
      const collect = () => {
        const screen = tui!.screen()
        expect(screen.includes(token!)).toBe(false)
        expect(screen).not.toContain("Unlabelled control")
        expect(screen).not.toContain("Closed control")
        expect(screen).not.toContain("Other repository control")
        for (const match of screen.matchAll(/#(\d+) Matched item /g)) seen.add(Number(match[1]))
        return screen
      }
      collect()
      for (let index = 0; index < expected.length; index++) {
        const before = collect()
        await tui!.press(key.down)
        await tui!.until(screen => screen !== before, 5000, "next actual issue row")
        collect()
      }
      expect([...seen].sort((a, b) => b - a)).toEqual(expected)
      expect(seen.has(expected[0]!)).toBe(true)
      expect(seen.has(expected.at(-1)!)).toBe(true)
    }
    await start()
    await open(105)
    await readTerminal([...matching].reverse())
    await tui!.press(key.escape)
    await tui!.type("unsent Chat draft stays usable")
    await tui!.until(screen => screen.includes("unsent Chat draft stays usable"), 5000, "Chat draft keyboard usability")
    await tui!.press(key.ctrlA)
    await tui!.press(key.backspace)
    await api(`${repoPath}/issues/${matching[0]!}`, "PATCH", { state: "closed" })
    expect(await readView(4)).toEqual(matching.slice(1).reverse())
    await open(104)
    await readTerminal(matching.slice(1).reverse())
    await tui!.press(key.escape)
    await tui!.type("/quit")
    await tui!.press(key.enter)
    await tui!.until(() => tui!.exited !== undefined, 5000, "public terminal quit")
    expect(tui!.exited).toEqual({ code: 0 })
    tui!.dispose()
    tui = undefined
    await start()
    await open(104) // Normal reselect; automatic selection restoration is not claimed.
    await readTerminal(matching.slice(1).reverse())
    expect(await readView(4)).toEqual(matching.slice(1).reverse())
    expect(await api(`${repoPath}/issues/${unrelated.number}`)).toMatchObject({ state: "open" })
    expect(await api(`${repoPath}/issues/${closed.number}`)).toMatchObject({ state: "closed" })
    expect(await api(`/api/repos/${other.full_name}/issues`)).toMatchObject([{ title: "Other repository control", state: "open" }])
    const journals = (await readdir(join(root, "sessions"), { recursive: true })).filter(path => path.endsWith(".jsonl"))
    expect(journals.length).toBeGreaterThan(0)
    const records: unknown[] = (await Promise.all(journals.map(async path =>
      (await readFile(join(root!, "sessions", path), "utf8")).split("\n").filter(Boolean).map(line => JSON.parse(line))
    ))).flat()
    const modelRequests = records.filter(record =>
      typeof record === "object" && record !== null && "type" in record && record.type === "event" &&
      "event" in record && typeof record.event === "object" && record.event !== null &&
      "_tag" in record.event && record.event._tag === "model-requested"
    )
    expect(modelRequests).toEqual([])
    const evidence = process.env.SMITHERS_TUI_REAL_EVIDENCE_PATH
    if (evidence) await writeFile(evidence, JSON.stringify({
      repo, actor: { username, is_admin: true }, before: matching.slice().reverse(), after: matching.slice(1).reverse(),
      namedView: "bugs", pages: 2, exclusions: [unrelated.number, closed.number], otherRepository: other.full_name,
      restart: "same profile; normal keyboard reselect", automaticSelectionRestorationClaimed: false,
      modelRequestCount: modelRequests.length
    }, null, 2) + "\n")
  } catch (error) {
    const evidence = process.env.SMITHERS_TUI_REAL_EVIDENCE_PATH
    if (evidence) await writeFile(`${evidence}.failure`, JSON.stringify({
      repo, screen: tui?.screen().replaceAll(token ?? "never-issued", "[redacted]"),
      diagnostic: error instanceof Error ? error.message.replaceAll(token ?? "never-issued", "[redacted]") : "Unknown test failure"
    }, null, 2) + "\n")
    throw error
  } finally {
    try { tui?.dispose() }
    finally {
      try {
        if (tokenID !== undefined) {
          expect((await backend.http(`/api/user/tokens/${tokenID}`, { method: "DELETE" })).status).toBe(204)
          expect((await fetch(`${backend.origin}/api/user`, { headers: { authorization: `token ${token}` } })).status).toBe(401)
        }
      } finally {
        try { await backend.stop() }
        finally { if (root) await rm(root, { recursive: true, force: true }) }
      }
    }
  }
}, 120000)
