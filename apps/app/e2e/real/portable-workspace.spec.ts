import { scenario } from "./coverage/types"
import { authenticatedTest } from "./auth-permissions/profile"
import { awaitBoot, closeComposer, command, expect, productUrl, realApi } from "./support/test"
import { attachJson, runSlash } from "./issues/local"
import { finishFirstVisit } from "./support/first-visit"
import { runningWorkspace, withOwnedRepository } from "./portable/owned-repository"
import type { APIRequestContext, Page } from "@playwright/test"
import type { OwnedRepository } from "./portable/owned-repository"
import { enableVerboseEvidence, expectFlowOutcome } from "./repositories-github/local"
import { takeDatabaseControl } from "./navigation-frames/storage"
import { terminalExecutionProof, terminalExecutionProved } from "./support/terminal-proof"

authenticatedTest.setTimeout(240_000)

// Own every box created on this fresh repository, including an unparsed create response.
const withWorkspaceCleanup = async <T>(page: Page, request: APIRequestContext, repo: OwnedRepository, use: () => Promise<T>): Promise<T> => {
  let bodyFailed = false
  let bodyError: unknown
  try {
    return await use()
  } catch (error) {
    bodyFailed = true
    bodyError = error
    throw error
  } finally {
    try {
      const response = await realApi(page, request, "GET", `${repo.path}/workspaces`)
      expect(response.status()).toBe(200)
      const remaining = await response.json() as ReadonlyArray<{ readonly id: string }>
      expect(Array.isArray(remaining)).toBe(true)
      for (const workspace of remaining) {
        expect(workspace.id).toEqual(expect.any(String))
        expect(workspace.id).not.toBe("")
        const path = `${repo.path}/workspaces/${encodeURIComponent(workspace.id)}`
        expect((await realApi(page, request, "DELETE", path)).status()).toBe(204)
        expect((await realApi(page, request, "GET", path)).status()).toBe(404)
      }
    } catch (cleanupError) {
      if (bodyFailed) throw new AggregateError([bodyError, cleanupError], "Workspace lifecycle and cleanup failed")
      throw cleanupError
    }
  }
}

authenticatedTest("a product workspace suspends, resumes, and deletes", scenario("workspaces.product-lifecycle", {
  capabilities: ["identity", "cloud"],
  coverage: ["action:box.open", "action:box.suspend", "action:box.resume", "action:box.delete", "host:local", "host:production", "path:success", "door:slash", "surface:workspace-api", "evidence:state-transitions-and-delete"]
}), async ({ page, request }, testInfo) => {
  testInfo.setTimeout(600_000)
  await withOwnedRepository(page, request, async (repo) => {
    const startedAt = performance.now()
    await page.goto(productUrl(page, `/${repo.fullName}`), { waitUntil: "domcontentloaded" })
    await awaitBoot(page, "navigate", startedAt)
    await finishFirstVisit(page)

    await enableVerboseEvidence(page)

    const collectionPath = `${repo.path}/workspaces`
    await withWorkspaceCleanup(page, request, repo, async () => {
      const openArgs = `main ${repo.fullName} --kind container`
      const openedInBrowser = page.waitForResponse((response) =>
        response.request().method() === "POST" && new URL(response.url()).pathname === collectionPath, { timeout: 120_000 })
      await runSlash(page, `/box.open ${openArgs}`)
      const opened = await openedInBrowser
      expect(opened.request().postDataJSON()).toMatchObject({ source_bookmark: "main", kind: "container" })
      expect([201, 202], `open ${repo.fullName}: ${await opened.text()}`).toContain(opened.status())
      const created = await opened.json() as { readonly id?: unknown; readonly name?: unknown; readonly slug?: unknown; readonly status?: unknown }
      expect(created.id, "the browser's box.open response must identify the created box").toEqual(expect.any(String))
      const id = created.id as string
      expect(id).not.toBe("")
      const path = `${collectionPath}/${encodeURIComponent(id)}`
      await expectFlowOutcome(page, "box.open", openArgs, "executed")
      const card = page.getByTestId(`card-workspace-${id}`)
      await expect(card).toBeVisible({ timeout: 60_000 })
      await expect(card).toContainText(repo.fullName)

      type WorkspaceWire = { readonly id?: unknown; readonly name?: unknown; readonly slug?: unknown; readonly status?: unknown }
      const readWorkspace = async (): Promise<WorkspaceWire> => {
        const response = await realApi(page, request, "GET", path)
        expect(response.status(), `read ${id}`).toBe(200)
        const row = await response.json() as WorkspaceWire
        expect(row.id).toBe(id)
        expect(row.name).toEqual(expect.any(String))
        return row
      }
      let running: WorkspaceWire | undefined
      await expect.poll(async () => {
        running = await readWorkspace()
        return running.status
      }, { timeout: 120_000, intervals: [500, 1_000, 2_000] }).toBe("running")
      const name = String(running!.name || running!.slug || id)
      expect(name).not.toBe("")
      await expect(card).toContainText(name)
      await expect(card).toContainText(/Running/i)

      const suspendInBrowser = page.waitForResponse((response) =>
        response.request().method() === "POST" && new URL(response.url()).pathname === `${path}/suspend`, { timeout: 120_000 })
      await runSlash(page, `/box.suspend ${id}`)
      const suspendedResponse = await suspendInBrowser
      expect(suspendedResponse.status()).toBe(200)
      await expectFlowOutcome(page, "box.suspend", id, "executed")
      let suspended: WorkspaceWire | undefined
      await expect.poll(async () => {
        suspended = await readWorkspace()
        return suspended.status
      }, { timeout: 180_000, intervals: [1_000, 2_000, 5_000] }).toBe("suspended")
      await expect(card).toContainText(/Suspended/i)

      const resumeInBrowser = page.waitForResponse((response) =>
        response.request().method() === "POST" && new URL(response.url()).pathname === `${path}/resume`, { timeout: 120_000 })
      await runSlash(page, `/box.resume ${id}`)
      const resumedResponse = await resumeInBrowser
      expect(resumedResponse.status()).toBe(200)
      await expectFlowOutcome(page, "box.resume", id, "executed")
      let resumed: WorkspaceWire | undefined
      await expect.poll(async () => {
        resumed = await readWorkspace()
        return resumed.status
      }, { timeout: 180_000, intervals: [1_000, 2_000, 5_000] }).toBe("running")
      await expect(card).toContainText(/Running/i)

      const deleteArgs = `${id} ${name}`
      const deleteInBrowser = page.waitForResponse((response) =>
        response.request().method() === "DELETE" && new URL(response.url()).pathname === path, { timeout: 120_000 })
      await runSlash(page, `/box.delete ${deleteArgs}`)
      const deletedResponse = await deleteInBrowser
      expect(deletedResponse.status()).toBe(204)
      await expectFlowOutcome(page, "box.delete", deleteArgs, "executed")
      let finalStatus = 0
      await expect.poll(async () => finalStatus = (await realApi(page, request, "GET", path)).status(),
        { timeout: 60_000, intervals: [500, 1_000, 2_000] }).toBe(404)
      await expect(card).toHaveCount(0)
      await attachJson(testInfo, "product-workspace-lifecycle", {
        repo: repo.fullName, id, name,
        open: { status: opened.status(), response: created, readback: running },
        suspend: { status: suspendedResponse.status(), response: await suspendedResponse.json().catch(() => null), readback: suspended },
        resume: { status: resumedResponse.status(), response: await resumedResponse.json().catch(() => null), readback: resumed },
        delete: { status: deletedResponse.status(), readbackStatus: finalStatus, cardCount: await card.count() }
      })
    })
  })
})

authenticatedTest("a failed UI workspace creation check still cleans up its box", scenario("workspaces.product-lifecycle-cleanup", {
  capabilities: ["identity", "cloud"],
  coverage: ["action:box.open", "host:local", "host:production", "path:success", "door:slash", "evidence:owned-cleanup-after-create"]
}), async ({ page, request }) => {
  await withOwnedRepository(page, request, async (repo) => {
    const startedAt = performance.now()
    await page.goto(productUrl(page, `/${repo.fullName}`), { waitUntil: "domcontentloaded" })
    await awaitBoot(page, "navigate", startedAt)
    await finishFirstVisit(page)
    const path = `${repo.path}/workspaces`
    const failure = new Error("fail before parsing the created workspace id")
    await expect(withWorkspaceCleanup(page, request, repo, async () => {
      const created = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === path)
      await runSlash(page, `/box.open main ${repo.fullName} --kind container`)
      expect([201, 202]).toContain((await created).status())
      throw failure
    })).rejects.toBe(failure)
    const remaining = await realApi(page, request, "GET", path)
    expect(remaining.status()).toBe(200)
    expect(await remaining.json()).toEqual([])
  })
})

authenticatedTest("a product terminal accepts keyboard input on its workspace", scenario("workspaces.product-terminal-keyboard-output", {
  capabilities: ["identity", "cloud", "cloud.terminal"],
  coverage: ["action:box.view", "action:box.terminal", "host:local", "host:production", "path:success", "path:keyboard", "door:slash", "dimension:keyboard", "dimension:real-pty", "evidence:terminal-output-and-cleanup"]
}), async ({ page, request }) => {
  await withOwnedRepository(page, request, (repo) => runningWorkspace(page, request, repo, async (id) => {
    const startedAt = performance.now()
    await page.goto(productUrl(page, `/${repo.fullName}`), { waitUntil: "domcontentloaded" })
    await awaitBoot(page, "navigate", startedAt)
    await finishFirstVisit(page)
    await runSlash(page, `/box.view ${id}`)
    const card = page.getByTestId(`card-workspace-${id}`)
    await expect(card).toBeVisible()
    const sessionPath = `${repo.path}/workspace/sessions`
    const created = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === sessionPath)
    await runSlash(page, `/box.terminal ${id}`)
    expect((await created).status()).toBe(201)
    await closeComposer(page)
    const terminal = card.locator('[data-testid^="terminal-"]')
    await expect(terminal).toBeVisible()
    const sessionId = (await terminal.getAttribute("data-testid"))!.slice("terminal-".length)
    try {
      const proof = terminalExecutionProof(String(Date.now()))
      await terminal.locator(".xterm-helper-textarea").focus()
      await page.keyboard.type(proof.setValue)
      await page.keyboard.press("Enter")
      await page.keyboard.type(proof.readValue)
      await page.keyboard.press("Enter")
      await expect.poll(async () => terminalExecutionProved(await terminal.locator(".xterm-rows").innerText(), proof.marker),
        { timeout: 30_000 }).toBe(true)
    } finally {
      expect((await realApi(page, request, "POST", `${sessionPath}/${encodeURIComponent(sessionId)}/destroy`)).status()).toBe(204)
    }
  }))
})


authenticatedTest("workspace.rename persists the local session name across reload", scenario("workspaces.local-name-persistence", {
  capabilities: [],
  coverage: ["action:workspace.rename", "host:local", "host:production", "path:success", "path:persistence", "path:keyboard", "door:slash", "dimension:keyboard", "dimension:physical-sqlite", "evidence:local-session-name"]
}), async ({ page, context }, testInfo) => {
  await finishFirstVisit(page)
  await enableVerboseEvidence(page)
  const name = `Workspace ${Date.now()}`
  await command(page, `/workspace.rename ${JSON.stringify(name)}`)
  await closeComposer(page)
  await expectFlowOutcome(page, "workspace.rename", JSON.stringify(name), "executed")
  const first = await takeDatabaseControl(page, context)
  let after: Awaited<ReturnType<typeof takeDatabaseControl>> | undefined
  try {
    const query = "SELECT json_extract(value, '$.workspaceName') AS name FROM smithers_collection_rows WHERE collection_id = 'app-sessions' AND row_key = 's:main'"
    const before = await first.execute(query)
    expect(before).toEqual([{ name }])
    const startedAt = performance.now()
    await first.page.goto(first.appUrl, { waitUntil: "domcontentloaded" })
    await awaitBoot(first.page, "navigate", startedAt)
    const reloadedAt = performance.now()
    await first.page.reload({ waitUntil: "domcontentloaded" })
    await awaitBoot(first.page, "reload", reloadedAt)
    after = await takeDatabaseControl(first.page, context)
    const reloaded = await after.execute(query)
    expect(reloaded).toEqual(before)
    await attachJson(testInfo, "workspace-name-local-authority", { name, before, reloaded, authority: "local-session" })
  } finally {
    try { await after?.page.close() } finally { await first.page.close() }
  }
})

authenticatedTest("box.list reports the exact owned box without changing repository selection", scenario("workspaces.public-list", {
  capabilities: ["identity", "cloud"],
  coverage: ["action:box.list", "host:local", "host:production", "path:success", "door:slash", "evidence:exact-list-and-selection"]
}), async ({ page, request, context }, testInfo) => {
  await withOwnedRepository(page, request, repo => runningWorkspace(page, request, repo, async id => {
    // Keep a same-origin authenticated document for public API cleanup while
    // the separate app document yields the physical SQLite owner below.
    await page.goto(productUrl(page, "/api/health"), { waitUntil: "domcontentloaded" })
    const appPage = await context.newPage()
    let control: Awaited<ReturnType<typeof takeDatabaseControl>> | undefined
    try {
      const startedAt = performance.now()
      await appPage.goto(productUrl(page, `/${repo.fullName}`), { waitUntil: "domcontentloaded" })
      await awaitBoot(appPage, "navigate", startedAt)
      await finishFirstVisit(appPage)
      await enableVerboseEvidence(appPage)
      const read = await realApi(appPage, request, "GET", `${repo.path}/workspaces`)
      expect(read.status()).toBe(200)
      const rows = await read.json() as ReadonlyArray<{ id: string; name: string; status: string; repo_full_name: string; target_bookmark: string | null }>
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ id, status: "running", repo_full_name: repo.fullName })
      const row = rows[0]!
      expect(row.name).not.toBe("")
      const listing = `${row.name} (${id}) · ${row.status} · ${repo.fullName}${row.target_bookmark === null ? "" : `@${row.target_bookmark}`}`
      const originalUrl = appPage.url()
      await command(appPage, `/box.list ${repo.fullName}`)
      await closeComposer(appPage)
      await expectFlowOutcome(appPage, "box.list", repo.fullName, "executed")
      await expect(appPage.getByTestId("transcript").getByText(listing, { exact: true })).toBeVisible()
      expect(appPage.url()).toBe(originalUrl)
      const independent = await realApi(appPage, request, "GET", `${repo.path}/workspaces/${encodeURIComponent(id)}`)
      expect(independent.status()).toBe(200)
      expect(await independent.json()).toMatchObject(row)
      await attachJson(testInfo, "owned-box-public-list", { repo: repo.fullName, rows, listing, originalUrl })
      control = await takeDatabaseControl(appPage, context)
      const sessions = await control.execute("SELECT json_extract(value, '$.activeRepoKey') AS selectedRepo FROM smithers_collection_rows WHERE collection_id = 'app-sessions' AND row_key = 's:main'")
      expect(sessions).toEqual([{ selectedRepo: repo.fullName }])
      const messages = await control.execute("SELECT json_extract(value, '$.text') AS text FROM smithers_collection_rows WHERE collection_id = 'app-messages' AND json_extract(value, '$.text') = ?", [listing])
      expect(messages).toEqual([{ text: listing }])
      // Both physical assertions precede any workspace/repository deletion.
      expect((await realApi(page, request, "GET", `${repo.path}/workspaces/${encodeURIComponent(id)}`)).status()).toBe(200)
      await attachJson(testInfo, "box-list-physical-readback", { sessions, messages })
    } finally {
      try { await control?.page.close() } finally { await appPage.close() }
    }
  }))
})

authenticatedTest("box.session.destroy closes the real terminal through its public button", scenario("workspaces.public-session-destroy", {
  capabilities: ["identity", "cloud", "cloud.terminal"],
  coverage: ["action:box.session.destroy", "host:local", "host:production", "path:success", "path:keyboard", "door:button", "dimension:keyboard", "dimension:real-pty", "evidence:socket-close-and-durable-stop"]
}), async ({ page, request }, testInfo) => {
  await withOwnedRepository(page, request, repo => runningWorkspace(page, request, repo, async id => {
    const startedAt = performance.now()
    await page.goto(productUrl(page, `/${repo.fullName}`), { waitUntil: "domcontentloaded" })
    await awaitBoot(page, "navigate", startedAt)
    await finishFirstVisit(page)
    await runSlash(page, `/box.view ${id}`)
    const card = page.getByTestId(`card-workspace-${id}`)
    await expect(card).toBeVisible()
    const sessionPath = `${repo.path}/workspace/sessions`
    const created = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === sessionPath)
    const socketOpened = page.waitForEvent("websocket", socket => new URL(socket.url()).pathname.startsWith(`${sessionPath}/`) && new URL(socket.url()).pathname.endsWith("/terminal"))
    await runSlash(page, `/box.terminal ${id}`)
    const response = await created
    expect(response.status()).toBe(201)
    await closeComposer(page)
    const terminal = card.locator('[data-testid^="terminal-"]')
    await expect(terminal).toBeVisible()
    const sessionId = (await terminal.getAttribute("data-testid"))!.slice("terminal-".length)
    const socket = await socketOpened
    expect(new URL(socket.url()).pathname).toBe(`${sessionPath}/${sessionId}/terminal`)
    try {
      const proof = terminalExecutionProof(String(Date.now()))
      await terminal.locator(".xterm-helper-textarea").focus()
      await page.keyboard.type(proof.setValue)
      await page.keyboard.press("Enter")
      await page.keyboard.type(proof.readValue)
      await page.keyboard.press("Enter")
      await expect.poll(async () => terminalExecutionProved(await terminal.locator(".xterm-rows").innerText(), proof.marker), { timeout: 30_000 }).toBe(true)
      expect(socket.isClosed()).toBe(false)
      const closed = socket.waitForEvent("close")
      const destroyed = page.waitForResponse(answer => answer.request().method() === "POST" && new URL(answer.url()).pathname === `${sessionPath}/${sessionId}/destroy`)
      const button = card.getByRole("button", { name: `Destroy session ${sessionId}`, exact: true })
      await expect(button).toBeEnabled()
      await button.focus()
      await expect(button).toBeFocused()
      await page.keyboard.press("Enter")
      expect((await destroyed).status()).toBe(204)
      await closed
      await expect(terminal).toHaveCount(0)
      await expect(card.locator("li").filter({ hasText: sessionId })).toContainText(/Stopped/i)
      const remaining = await realApi(page, request, "GET", sessionPath)
      expect(remaining.status()).toBe(200)
      const stopped = await remaining.json() as ReadonlyArray<{ id: string; status: string }>
      expect(stopped).toHaveLength(1)
      expect(stopped[0]).toMatchObject({ id: sessionId, status: "stopped" })
      await attachJson(testInfo, "public-terminal-destroy", { repo: repo.fullName, workspaceId: id, sessionId, socketClosed: socket.isClosed(), stopped })
    } finally {
      const remaining = await realApi(page, request, "GET", sessionPath)
      expect(remaining.status()).toBe(200)
      const rows = await remaining.json() as ReadonlyArray<{ id: string }>
      for (const row of rows) expect((await realApi(page, request, "POST", `${sessionPath}/${encodeURIComponent(row.id)}/destroy`)).status()).toBe(204)
      const stopped = await (await realApi(page, request, "GET", sessionPath)).json() as ReadonlyArray<{ id: string; status: string }>
      expect(stopped.every(row => row.status === "stopped")).toBe(true)
    }
  }))
})
