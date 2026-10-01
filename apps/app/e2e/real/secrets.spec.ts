import { randomUUID } from "node:crypto"
import { authenticatedTest } from "./auth-permissions/profile"
import { scenario } from "./coverage/types"
import { awaitBoot, closeComposer, command, expect, realApi, reloadApp } from "./support/test"
import { finishFirstVisit } from "./support/first-visit"
import { scenarioOutcome, TEARDOWN_ANNOTATION, TeardownProblem } from "./support/teardown"
import { fixtureInputText, fixtureProtocolId } from "./support/values"
import type { APIRequestContext, Page } from "@playwright/test"
import { withOwnedRepository, type OwnedRepository } from "./portable/owned-repository"
import { attachJson } from "./issues/local"

// The fixture value is generated for this owned repository. No real provider
// credential, import, workflow, or outbound provider request is involved.
authenticatedTest("repository secret metadata survives reload and follows actual backend deletion", scenario("secrets.repository-metadata-readback", {
  capabilities: ["identity", "cloud"],
  description: "Create a uniquely owned private repository and synthetic secret through the real API, read only its metadata through the keyboard flow, reload, then delete it and verify the refreshed card and backend agree without revealing the value.",
  coverage: ["action:secrets.list", "host:local", "host:production", "path:success", "path:persistence", "path:keyboard", "door:slash", "dimension:keyboard", "dimension:reload", "dimension:write-only-secret", "evidence:backend-metadata-and-deletion-readback"]
}), async ({ page, request }, testInfo) => {
  const user = await realApi(page, request, "GET", "/api/user")
  expect(user.status()).toBe(200)
  const { username } = await user.json() as { username: string }
  const name = fixtureProtocolId(`smithers-e2e-secrets-${randomUUID()}`)
  const repo = `${username}/${name}`
  const repoPath = `/api/repos/${encodeURIComponent(username)}/${name}`
  const secretsPath = `${repoPath}/secrets`
  const secretName = "ACCEPTANCE_TOKEN"
  const secretPath = `${secretsPath}/${secretName}`
  const value = fixtureInputText(`owned-secret-${randomUUID()}`)
  const host = fixtureInputText("api.example.test")
  const binding = { name: secretName, hosts: [host], match_headers: ["authorization"] }
  let submitted = false, failure: unknown
  const cleanup: unknown[] = []
  try {
    submitted = true
    const created = await realApi(page, request, "POST", "/api/user/repos", { name, private: true, auto_init: false })
    expect(created.status()).toBe(201)
    const repository = await created.json() as { full_name: string; private: boolean }
    expect(repository).toMatchObject({ full_name: repo, private: true })
    const written = await realApi(page, request, "POST", secretsPath, { name: secretName, value, hosts: binding.hosts, match_headers: binding.match_headers })
    expect(written.status()).toBe(201)
    const metadata = await written.json()
    expect(metadata).toMatchObject(binding)
    expect(metadata).not.toHaveProperty("value")
    expect(JSON.stringify(metadata).includes(value)).toBe(false)
    const read = async () => {
      const response = await realApi(page, request, "GET", secretsPath)
      expect(response.status()).toBe(200)
      const body = await response.json() as Array<Record<string, unknown>>
      expect(JSON.stringify(body).includes(value)).toBe(false)
      for (const secret of body) expect(secret).not.toHaveProperty("value")
      return body
    }
    expect(await read()).toEqual([metadata])
    const started = performance.now()
    await page.goto(`/${repo}`, { waitUntil: "domcontentloaded" })
    await awaitBoot(page, "navigate", started)
    await finishFirstVisit(page)
    const list = async () => {
      const observed = page.waitForResponse(response => response.request().method() === "GET" && new URL(response.url()).pathname === secretsPath)
      void observed.catch(() => undefined)
      await command(page, `/secrets.list ${repo}`)
      await closeComposer(page)
      const response = await observed
      expect(response.status()).toBe(200)
      const body = await response.json() as Array<Record<string, unknown>>
      expect(JSON.stringify(body).includes(value)).toBe(false)
      for (const secret of body) expect(secret).not.toHaveProperty("value")
    }
    const card = page.getByTestId(`card-secrets-${repo}`)
    const row = card.getByTestId(`secret-${secretName}`)
    await list()
    await expect(card).toBeVisible()
    await expect(row).toContainText(secretName)
    await expect(row.getByRole("cell").nth(2)).toHaveText(String(binding.hosts.length))
    expect((await page.locator("body").innerText()).includes(value)).toBe(false)
    await reloadApp(page)
    await expect(row).toBeVisible()
    await list()
    await expect(row).toBeVisible()
    expect(await read()).toEqual([metadata])
    expect((await page.locator("body").innerText()).includes(value)).toBe(false)

    expect((await realApi(page, request, "DELETE", secretPath)).status()).toBe(204)
    expect(await read()).toEqual([])
    await list()
    await expect(card).toBeVisible()
    await expect(row).toHaveCount(0)
    await expect(card.getByRole("table")).toHaveCount(0)
    await reloadApp(page)
    await expect(card).toBeVisible()
    await expect(row).toHaveCount(0)
    await testInfo.attach("secret-metadata-readback", { contentType: "application/json", body: Buffer.from(JSON.stringify({ repo, metadata, afterDeletion: [] })) })
  } catch (error) { failure = error }
  finally {
    if (submitted) {
      try {
        const deleted = await realApi(page, request, "DELETE", repoPath)
        expect([204, 404]).toContain(deleted.status())
        expect((await realApi(page, request, "GET", repoPath)).status()).toBe(404)
        await testInfo.attach("owned-secret-repository-cleanup", { contentType: "application/json", body: Buffer.from(JSON.stringify({ repo, status: 404 })) })
      } catch (error) { cleanup.push(new TeardownProblem(`Removing owned secret repository ${repo} failed`, { cause: error })) }
    }
  }
  const outcome = scenarioOutcome({ repository: repo, bodyError: failure, teardownFailures: cleanup })
  for (const description of outcome.teardown) testInfo.annotations.push({ type: TEARDOWN_ANNOTATION, description })
  if (outcome.verdict !== undefined) throw outcome.verdict
})

authenticatedTest("the Secrets card adds, rotates and deletes a secret through the masked form, never reading a value back", scenario("secrets.card-editor", {
  capabilities: ["identity", "cloud"],
  description: "In a uniquely owned private repository, add a bound secret from the card's masked form, rotate it with a blank binding, and delete it, reading the real backend's metadata after each step without the value reaching the page or any response.",
  coverage: ["action:secrets.set", "action:secrets.delete", "action:secrets.list", "host:local", "host:production", "path:success", "door:button", "dimension:write-only-secret", "evidence:backend-metadata-and-deletion-readback"]
}), async ({ page, request }, testInfo) => {
  const user = await realApi(page, request, "GET", "/api/user")
  expect(user.status()).toBe(200)
  const { username } = await user.json() as { username: string }
  const name = fixtureProtocolId(`smithers-e2e-secret-editor-${randomUUID()}`)
  const repo = `${username}/${name}`
  const repoPath = `/api/repos/${encodeURIComponent(username)}/${name}`
  const secretsPath = `${repoPath}/secrets`
  const secretName = "EDITOR_TOKEN"
  const secretPath = `${secretsPath}/${secretName}`
  const initialValue = fixtureInputText(`editor-secret-${randomUUID()}`)
  const rotatedValue = fixtureInputText(`editor-rotated-${randomUUID()}`)
  const values = [initialValue, rotatedValue]
  const host = fixtureInputText("api.example.test")
  let submitted = false, failure: unknown
  const cleanup: unknown[] = []
  const unrevealed = (text: string) => { for (const value of values) expect(text.includes(value)).toBe(false) }
  try {
    submitted = true
    const created = await realApi(page, request, "POST", "/api/user/repos", { name, private: true, auto_init: false })
    expect(created.status()).toBe(201)
    const read = async () => {
      const response = await realApi(page, request, "GET", secretsPath)
      expect(response.status()).toBe(200)
      const text = await response.text()
      unrevealed(text)
      return JSON.parse(text) as Array<{ name: string; hosts: string[]; match_headers: string[] }>
    }
    const started = performance.now()
    await page.goto(`/${repo}`, { waitUntil: "domcontentloaded" })
    await awaitBoot(page, "navigate", started)
    await finishFirstVisit(page)
    await command(page, `/secrets.list ${repo}`)
    await closeComposer(page)
    const card = page.getByTestId(`card-secrets-${repo}`)
    await expect(card).toBeVisible()
    await expect(card.locator(".world-card-path")).toHaveText(repo)
    const form = page.locator('.flow-form[data-flow-name="secrets.set"]').last()
    const save = async (value: string, fields: Record<string, string>) => {
      for (const [field, text] of Object.entries(fields)) await form.getByTestId(`flow-form-${field}`).fill(text)
      const masked = form.getByTestId("flow-form-value")
      await expect(masked).toHaveAttribute("type", "password")
      await masked.fill(value)
      const put = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === secretsPath)
      await form.getByTestId("flow-form-submit").click()
      const answer = await put
      expect(answer.status()).toBe(201)
      unrevealed(await answer.text())
    }

    await card.getByRole("button", { name: "Add secret" }).click()
    await save(values[0]!, { name: secretName, hosts: host, headers: "authorization" })
    await expect.poll(read).toEqual([expect.objectContaining({ name: secretName, hosts: [host], match_headers: ["authorization"] })])
    const row = card.getByTestId(`secret-${secretName}`)
    await expect(row.getByRole("cell").nth(2)).toHaveText("1")

    await row.getByRole("button", { name: `Rotate ${secretName}` }).click()
    await save(values[1]!, {})
    await expect.poll(read).toEqual([expect.objectContaining({ name: secretName, hosts: [host], match_headers: ["authorization"] })])
    unrevealed(await page.locator("body").innerText())

    const deleted = page.waitForResponse(response => response.request().method() === "DELETE" && new URL(response.url()).pathname === secretPath)
    await row.getByRole("button", { name: `Delete ${secretName}` }).click()
    expect((await deleted).status()).toBe(204)
    await expect.poll(read).toEqual([])
    await expect(row).toHaveCount(0)
    unrevealed(await page.locator("body").innerText())
    await testInfo.attach("secret-editor-readback", { contentType: "application/json", body: Buffer.from(JSON.stringify({ repo, afterDeletion: [] })) })
  } catch (error) { failure = error }
  finally {
    if (submitted) {
      try {
        const deleted = await realApi(page, request, "DELETE", repoPath)
        expect([204, 404]).toContain(deleted.status())
        expect((await realApi(page, request, "GET", repoPath)).status()).toBe(404)
      } catch (error) { cleanup.push(new TeardownProblem(`Removing owned secret repository ${repo} failed`, { cause: error })) }
    }
  }
  const outcome = scenarioOutcome({ repository: repo, bodyError: failure, teardownFailures: cleanup })
  for (const description of outcome.teardown) testInfo.annotations.push({ type: TEARDOWN_ANNOTATION, description })
  if (outcome.verdict !== undefined) throw outcome.verdict
})

type SecretMetadata = { name: string; main_only: boolean; hosts: string[]; match_headers: string[]; updated_at: string }

const withSeparateSecretAuthorities = async (
  page: Page, request: APIRequestContext,
  use: (fixture: { repo: OwnedRepository; name: string; secretPath: string; read: () => Promise<SecretMetadata[]>; unchanged: () => Promise<void>; privateText: (text: string) => void; list: () => Promise<void> }) => Promise<void>
) => withOwnedRepository(page, request, async (repo) => {
  const name = "CI_ACCEPTANCE_TOKEN"
  const otherName = "UNTOUCHED_TOKEN"
  const ciValue = fixtureInputText(`ci-private-${randomUUID()}`)
  const agentValue = fixtureInputText(`agent-private-${randomUUID()}`)
  const otherValue = fixtureInputText(`other-private-${randomUUID()}`)
  const agentHost = fixtureInputText("agent.example.test")
  const values = [ciValue, agentValue, otherValue]
  const privateText = (text: string) => { for (const value of values) expect(text.includes(value)).toBe(false) }
  const collection = `${repo.path}/secrets`
  const secretPath = `${collection}/${name}`
  const environmentPath = `${repo.path}/agent-environment`
  const created = await realApi(page, request, "POST", collection, { name, value: values[0], main_only: false })
  expect(created.status()).toBe(201)
  privateText(await created.text())
  const other = await realApi(page, request, "POST", collection, { name: otherName, value: values[2], main_only: true })
  expect(other.status()).toBe(201)
  const untouched = await other.json() as SecretMetadata
  privateText(JSON.stringify(untouched))
  const agent = await realApi(page, request, "PUT", `${environmentPath}/secrets/${name}`, {
    value: values[1], hosts: [agentHost], match_headers: ["authorization"]
  })
  expect(agent.status()).toBe(201)
  privateText(await agent.text())
  const readEnvironment = async () => {
    const response = await realApi(page, request, "GET", environmentPath)
    expect(response.status()).toBe(200)
    const text = await response.text()
    privateText(text)
    return JSON.parse(text) as unknown
  }
  const originalEnvironment = await readEnvironment()
  const read = async () => {
    const response = await realApi(page, request, "GET", collection)
    expect(response.status()).toBe(200)
    const text = await response.text()
    privateText(text)
    const rows = JSON.parse(text) as SecretMetadata[]
    for (const row of rows) expect(row).not.toHaveProperty("value")
    return rows
  }
  const unchanged = async () => {
    expect((await read()).find(row => row.name === otherName)).toEqual(untouched)
    expect(await readEnvironment()).toEqual(originalEnvironment)
    privateText(await page.locator("body").innerText())
  }
  const started = performance.now()
  await page.goto(`/${repo.fullName}`, { waitUntil: "domcontentloaded" })
  await awaitBoot(page, "navigate", started)
  await finishFirstVisit(page)
  const list = async () => {
    await command(page, `/secrets.list ${repo.fullName}`)
    await closeComposer(page)
    const card = page.getByTestId(`card-secrets-${repo.fullName}`)
    await expect(card.locator(".world-card-path")).toHaveText(repo.fullName)
    await expect(card.getByTestId(`secret-${name}`)).toBeVisible()
  }
  await list()
  await use({ repo, name, secretPath, read, unchanged, privateText, list })
})

authenticatedTest("CI secret scope keyboard actions persist without touching agent credentials", scenario("secrets.ci-scope-authority-readback", {
  capabilities: ["identity", "cloud"],
  description: "Toggle an owned CI secret between main-only and every run through existing keyboard and slash doors, independently read metadata after reload, and preserve a same-name agent-environment secret and another CI secret.",
  coverage: ["action:secrets.scope", "host:local", "path:success", "path:persistence", "path:keyboard", "dimension:keyboard", "dimension:secret-authority-isolation", "dimension:reload", "dimension:main-only-and-all", "door:button", "door:slash", "evidence:ci-secret-metadata-readback"]
}), async ({ page, request }, testInfo) => {
  await withSeparateSecretAuthorities(page, request, async ({ repo, name, secretPath, read, unchanged, privateText, list }) => {
    const row = page.getByTestId(`card-secrets-${repo.fullName}`).getByTestId(`secret-${name}`)
    const before = (await read()).find(secret => secret.name === name)!
    expect(before.main_only).toBe(false)
    const button = row.getByRole("button", { name: `Limit to main ${name}`, exact: true })
    await button.focus()
    await expect(button).toBeFocused()
    const pending = page.waitForResponse(response => response.request().method() === "PATCH" && new URL(response.url()).pathname === secretPath)
    await button.press("Enter")
    const changed = await pending
    expect(changed.status()).toBe(200)
    expect(changed.request().postDataJSON()).toEqual({ main_only: true })
    privateText(await changed.text())
    await expect.poll(async () => (await read()).find(secret => secret.name === name)?.main_only).toBe(true)
    await list()
    await expect(row.getByRole("button", { name: `Give to every run ${name}`, exact: true })).toBeVisible()
    await reloadApp(page)
    await expect(row.getByRole("cell").nth(1)).toHaveText("yes")
    const all = page.waitForResponse(response => response.request().method() === "PATCH" && new URL(response.url()).pathname === secretPath)
    await command(page, `/secrets.scope ${name} all ${repo.fullName}`)
    await closeComposer(page)
    const restored = await all
    expect(restored.status()).toBe(200)
    expect(restored.request().postDataJSON()).toEqual({ main_only: false })
    privateText(await restored.text())
    await expect.poll(async () => (await read()).find(secret => secret.name === name)?.main_only).toBe(false)
    await list()
    await expect(row.getByRole("cell").nth(1)).toHaveText("no")
    await reloadApp(page)
    await expect(row.getByRole("cell").nth(1)).toHaveText("no")
    const after = (await read()).find(secret => secret.name === name)!
    expect(after).toMatchObject({ name, main_only: false, hosts: before.hosts, match_headers: before.match_headers })
    await unchanged()
    await attachJson(testInfo, "ci-secret-scope-readback", { repo: repo.fullName, before, after, agentEnvironmentUnchanged: true, otherCISecretUnchanged: true })
  })
})

authenticatedTest("CI secret binding form persists exact metadata and refuses an invalid host without mutation", scenario("secrets.ci-binding-form-readback", {
  capabilities: ["identity", "cloud"],
  description: "Open the existing binding form from an owned CI secret's keyboard button, save exact hosts and headers, reload and independently read metadata; reject a URL-shaped host while preserving the binding and separate agent credentials.",
  coverage: ["action:secrets.bind", "host:local", "path:success", "path:error", "path:persistence", "path:keyboard", "dimension:keyboard", "dimension:secret-authority-isolation", "dimension:invalid-binding", "dimension:reload", "door:button", "door:slash", "evidence:ci-secret-binding-api-readback"]
}), async ({ page, request }, testInfo) => {
  await withSeparateSecretAuthorities(page, request, async ({ repo, name, secretPath, read, unchanged, privateText, list }) => {
    const row = page.getByTestId(`card-secrets-${repo.fullName}`).getByTestId(`secret-${name}`)
    const bind = row.getByRole("button", { name: `Bind ${name}`, exact: true })
    await bind.focus()
    await expect(bind).toBeFocused()
    await bind.press("Enter")
    const form = page.locator('.flow-form[data-flow-name="secrets.bind"]').last()
    await expect(form).toBeVisible()
    const host = fixtureInputText("ci.example.test")
    await form.getByTestId("flow-form-hosts").fill(host)
    await form.getByTestId("flow-form-headers").fill("authorization,x-api-key")
    const pending = page.waitForResponse(response => response.request().method() === "PATCH" && new URL(response.url()).pathname === secretPath)
    const submit = form.getByTestId("flow-form-submit")
    await expect(submit).toBeEnabled()
    await submit.focus()
    await expect(submit).toBeFocused()
    await submit.press("Enter")
    const changed = await pending
    expect(changed.status()).toBe(200)
    expect(changed.request().postDataJSON()).toEqual({ hosts: [host], match_headers: ["authorization", "x-api-key"] })
    privateText(await changed.text())
    const stored = (await read()).find(secret => secret.name === name)!
    expect(stored).toMatchObject({ name, main_only: false, hosts: [host], match_headers: ["authorization", "x-api-key"] })
    await list()
    await expect(row.getByRole("cell").nth(2)).toHaveText("1")
    await reloadApp(page)
    await expect(row.getByRole("cell").nth(2)).toHaveText("1")
    expect((await read()).find(secret => secret.name === name)).toEqual(stored)
    const refusal = page.waitForResponse(response => response.request().method() === "PATCH" && new URL(response.url()).pathname === secretPath)
    await command(page, `/secrets.bind ${JSON.stringify({ name, hosts: fixtureInputText("https://ci.example.test"), headers: "authorization", repo: repo.fullName })}`)
    const answer = await refusal
    expect(answer.status()).toBe(400)
    privateText(await answer.text())
    await expect(page.locator('.toast[data-toast-status="failed"]').last()).toBeVisible()
    expect((await read()).find(secret => secret.name === name)).toEqual(stored)
    await closeComposer(page)
    await reloadApp(page)
    await expect(row.getByRole("cell").nth(2)).toHaveText("1")
    await unchanged()
    await attachJson(testInfo, "ci-secret-binding-readback", { repo: repo.fullName, stored, refusedStatus: answer.status(), agentEnvironmentUnchanged: true, otherCISecretUnchanged: true })
  })
})
