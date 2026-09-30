import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { join } from "node:path"
import { stat, writeFile } from "node:fs/promises"
import { PackagedFixtureRun } from "./FixtureRun"
import type { PackagedTestFixture } from "./FixtureRun"
import { launchApp } from "./PackagedApp"
import type { PackagedApp } from "./PackagedApp"

const executable = process.env.SMITHERS_E2E_EXECUTABLE
const artifactsDirectory = process.env.SMITHERS_E2E_ARTIFACTS
const enabled = process.platform === "darwin" && executable !== undefined && artifactsDirectory !== undefined
let fixtureRun: PackagedFixtureRun | undefined

interface RenderedShell {
  readonly title: string
  readonly bodyTextLength: number
  readonly htmlLength: number
  readonly composer: boolean
  readonly transcript: boolean
}

const renderedShell = `
  ({
    title: document.title,
    bodyTextLength: document.body?.innerText.length ?? 0,
    htmlLength: document.documentElement.outerHTML.length,
    composer: document.querySelector('[data-testid="composer-input"]') instanceof HTMLTextAreaElement,
    transcript: document.querySelector('[data-testid="transcript"]') instanceof HTMLElement
  })
`

/** A controlled provider transport; durable admission, auth and inference run in the packaged backend. */
const providerFixture = () => {
  const key = randomBytes(32).toString("hex")
  const requests: Array<{ path: string; model: string; text: string }> = []
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: async request => {
    const path = new URL(request.url).pathname
    if (request.method !== "POST" || path !== "/v1/chat/completions") return new Response(null, { status: 404 })
    if (request.headers.get("authorization") !== `Bearer ${key}`) return new Response(null, { status: 401 })
    const body = await request.json() as { model: string; messages: Array<{ role: string; content: string }> }
    const text = body.messages.filter(message => message.role === "user").at(-1)?.content ?? ""
    requests.push({ path, model: body.model, text })
    const frame = { id: "packaged-provider", choices: [{ index: 0, delta: { role: "assistant", content: `stub: ${text}` }, finish_reason: null }] }
    const done = { id: "packaged-provider", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }
    return new Response(`data: ${JSON.stringify(frame)}\n\ndata: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`,
      { headers: { "content-type": "text/event-stream" } })
  } })
  return { origin: server.url.origin, key, requests, stop: () => server.stop(true) }
}

const initializeOwner = async (app: PackagedApp, provider: ReturnType<typeof providerFixture>): Promise<void> => {
  await clickSelector(app, 'button[data-flow="auth.sign-in"]')
  await app.waitFor<boolean>(`document.querySelector('.local-auth-dialog input[name="username"]') !== null`)
  await app.eval<boolean>(`(() => {
    for (const [name, value] of ${JSON.stringify([["username", "packagedowner"], ["password", "Packaged fixture owner Aa1!"]])}) {
      const input = document.querySelector('.local-auth-dialog input[name="' + name + '"]')
      if (!(input instanceof HTMLInputElement)) throw new Error('Missing owner input')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    document.querySelector('.local-auth-dialog button[type="submit"]').click()
    return true
  })()`)
  await app.waitFor<boolean>(`document.querySelector('.local-auth-dialog') === null`)
  expect(await app.eval<string>(`fetch('/api/user').then(async response => {
    if (!response.ok) throw new Error('Owner readback failed: ' + response.status)
    return (await response.json()).username
  })`)).toBe("packagedowner")
  expect(await app.eval<boolean>(`(async () => {
    const csrf = document.cookie.split('; ').find(value => value.startsWith('__csrf='))?.slice(7)
    if (!csrf) throw new Error('Owner CSRF receipt missing')
    const headers = { 'content-type': 'application/json', 'x-csrf-token': decodeURIComponent(csrf) }
    const credential = await fetch('/api/model/credential', { method: 'POST', headers, body: JSON.stringify(${JSON.stringify({ action: "enroll", requestId: crypto.randomUUID(), name: "PACKAGED_PROVIDER", origin: provider.origin, value: provider.key })}) })
    if (!credential.ok) throw new Error('Owner credential enrollment failed: ' + credential.status)
    const selected = await fetch('/api/model/default', { method: 'PUT', headers, body: JSON.stringify(${JSON.stringify({ model: { protocol: "openai-chat", modelId: "packaged-fixture", credential: "PACKAGED_PROVIDER", baseUrl: provider.origin } })}) })
    if (!selected.ok) throw new Error('Owner model selection failed: ' + selected.status)
    return true
  })()`)).toBe(true)
}

const withApp = async (
  label: string,
  run: (app: PackagedApp, fixture: PackagedTestFixture, provider: ReturnType<typeof providerFixture>) => Promise<void>
): Promise<void> => {
  if (executable === undefined || artifactsDirectory === undefined || fixtureRun === undefined) {
    throw new Error(
      "Run this suite through `bun run test:e2e` so it receives a packaged executable, artifacts, and fixture lease."
    )
  }
  const fixture = await fixtureRun.beginTest(label)
  const stateDirectory = await fixture.makeDirectory("application-state")
  const provider = providerFixture()
  let app: PackagedApp | undefined
  let failure: unknown
  try {
    app = await launchApp({ executable, artifactsDirectory, stateDirectory, env: { SMITHERS_BACKEND_MODE: "own" } })
    await app.ready()
    await app.waitFor<RenderedShell>(renderedShell, (value) => value.composer && value.transcript)
    await initializeOwner(app, provider)
    await run(app, fixture, provider)
  } catch (error) {
    failure = error
    if (app !== undefined) {
      try {
        await app.captureDiagnostics(label)
      } catch (diagnosticError) {
        failure = new AggregateError([error, diagnosticError], `${label} failed and diagnostics could not be captured.`)
      }
    }
  }

  const cleanupFailures: Array<unknown> = []
  if (app !== undefined) {
    try {
      await app.cleanup()
    } catch (error) {
      cleanupFailures.push(error)
    }
  }
  try { await provider.stop() } catch (error) { cleanupFailures.push(error) }
  // Do not erase fixture state while a packaged process may still own it.
  // The marker then blocks the next test and afterAll reports the leak.
  if (cleanupFailures.length === 0) {
    try {
      await fixture.cleanup()
    } catch (error) {
      cleanupFailures.push(error)
    }
  }
  const failures = [...(failure === undefined ? [] : [failure]), ...cleanupFailures]
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) throw new AggregateError(failures, `${label} and its cleanup failed.`)
}

const selectorForTestId = (testId: string): string => `[data-testid=${JSON.stringify(testId)}]`

const clickSelector = async (app: PackagedApp, selector: string): Promise<void> => {
  await app.eval<boolean>(`
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)})
      if (!(element instanceof HTMLElement)) throw new Error(${JSON.stringify(`Missing clickable ${selector}`)})
      element.click()
      return true
    })()
  `)
}

const clickTestId = (app: PackagedApp, testId: string): Promise<void> => clickSelector(app, selectorForTestId(testId))


const setControlValue = async (app: PackagedApp, testId: string, value: string): Promise<void> => {
  await app.eval<boolean>(`
    (() => {
      const element = document.querySelector(${JSON.stringify(selectorForTestId(testId))})
      if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) {
        throw new Error(${JSON.stringify(`Missing input ${testId}`)})
      }
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
      if (setter === undefined) throw new Error('control value setter is missing')
      setter.call(element, ${JSON.stringify(value)})
      element.dispatchEvent(new Event('input', { bubbles: true }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })()
  `)
}

const sendMessage = async (app: PackagedApp, text: string): Promise<void> => {
  await app.eval<boolean>(`
    (() => {
      const input = document.querySelector('[data-testid="composer-input"]')
      if (!(input instanceof HTMLTextAreaElement) || input.getBoundingClientRect().height === 0) {
        const opener = Array.from(document.querySelectorAll('button[data-flow="chat.open"]'))
          .find((button) => button instanceof HTMLButtonElement && button.getBoundingClientRect().height > 0)
        if (!(opener instanceof HTMLButtonElement)) throw new Error('Missing visible Chat button')
        opener.click()
      }
      return true
    })()
  `)
  await app.waitFor<boolean>(`
    (document.querySelector('[data-testid="composer-input"]')?.getBoundingClientRect().height ?? 0) > 0
  `)
  await setControlValue(app, "composer-input", text)
  await app.waitFor<boolean>(`
    (() => {
      const send = document.querySelector('[data-testid="composer-send"]')
      return send instanceof HTMLButtonElement && !send.disabled
    })()
  `)
  await clickTestId(app, "composer-send")
}

const transcriptContains = (text: string): string => `
  Array.from(document.querySelectorAll('.smithers-chat-message'))
    .some((element) => element.textContent?.includes(${JSON.stringify(text)}) === true)
`

describe.skipIf(!enabled)("the packaged production Electrobun app", () => {
  beforeAll(async () => {
    fixtureRun = await PackagedFixtureRun.start({
      artifactsDirectory,
      ...(process.env.SMITHERS_E2E_FIXTURE_REGISTRY === undefined
        ? {}
        : { registryDirectory: process.env.SMITHERS_E2E_FIXTURE_REGISTRY }),
      allowStaleRecovery: process.env.SMITHERS_E2E_RECOVER_STALE === "1"
    })
  })

  afterAll(async () => {
    const run = fixtureRun
    fixtureRun = undefined
    await run?.cleanup()
  })

  test("launches the stable native renderer and exposes only an authenticated bridge", async () => {
    await withApp("launch", async (app) => {
      const state = await app.state()
      expect(state.app).toMatchObject({ packaged: true, channel: "stable", defaultRenderer: "native" })
      expect(state.window).toMatchObject({ renderer: "native", url: state.app.origin + "/" })
      expect(await app.unauthorizedStatus()).toBe(401)

      const shell = await app.waitFor<RenderedShell>(renderedShell, (value) => value.composer && value.transcript)
      expect(shell.title).toMatch(/Smithers/i)
      expect(shell.bodyTextLength).toBeGreaterThan(200)
      expect(shell.htmlLength).toBeGreaterThan(2_000)
      expect(await app.eval<number>("document.querySelectorAll('button').length")).toBeGreaterThan(3)
      await expect(app.eval("(() => { throw new Error('expected renderer failure') })()")).rejects.toThrow(
        "expected renderer failure"
      )
      expect(await app.eval<number>("6 * 7")).toBe(42)

      await sendMessage(app, "/appearance.theme")
      expect(await app.waitFor<boolean>(`document.querySelector('[data-testid="card-theme-picker"]') !== null`)).toBe(
        true
      )
      await clickTestId(app, "card-maximize-theme-picker")
      await app.waitFor<boolean>(`document.querySelector('[data-testid="card-theme-picker"]')?.getAttribute('data-maximized') === 'true'`)
      await clickTestId(app, "card-open-in-tab-theme-picker")
      expect(
        await app.waitFor<boolean>(
          `document.querySelector('[data-testid="tab-body-card-theme-picker"]')?.checkVisibility() === true`
        )
      ).toBe(true)
      await sendMessage(app, "/tab.close card-theme-picker")
      expect(await app.waitFor<boolean>(`document.querySelector('[data-testid="tab-body-card-theme-picker"]') === null`))
        .toBe(true)
      expect(await app.eval<boolean>(`document.querySelector('[data-testid="card-theme-picker"]') !== null`)).toBe(true)

      const screenshot = await app.screenshot("launch.png").catch((error) => {
        expect(String(error)).toContain("screenshot_unavailable")
        return undefined
      })
      if (screenshot !== undefined) expect((await stat(screenshot)).size).toBeGreaterThan(100)
    })
  })

  test("round-trips chat, recovers from a rejected mutation, and persists through relaunch", async () => {
    await withApp("chat-persistence", async (app, _fixture, provider) => {
      const firstState = await app.state()
      const csrfRefusal = await app.eval<{ status: number; body: { code: string; message: string } }>(`
        fetch(${JSON.stringify(`${firstState.app.origin}/api/chat/cancel`)}, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ runId: 'unauthorized-e2e-probe' })
        }).then(async response => ({ status: response.status, body: await response.json() }))
      `)
      expect(csrfRefusal).toMatchObject({ status: 403, body: { code: "forbidden", message: "csrf token missing" } })
      expect(provider.requests).toEqual([])

      const message = `packaged app e2e ${crypto.randomUUID()}`
      await sendMessage(app, message)
      expect(await app.waitFor<boolean>(transcriptContains(message))).toBe(true)
      expect(await app.waitFor<boolean>(transcriptContains(`stub: ${message}`), (value) => value, 30_000)).toBe(true)
      expect(provider.requests).toEqual([{ path: "/v1/chat/completions", model: "packaged-fixture", text: message }])
      await app.relaunch()
      const relaunchedState = await app.state()
      const restored = await app.eval<{ userStatus: number; message: boolean; reply: boolean }>(`(async () => ({
        userStatus: (await fetch('/api/user')).status,
        message: ${transcriptContains(message)}, reply: ${transcriptContains(`stub: ${message}`)}
      }))()`)
      await writeFile(join(app.artifactsDirectory, "chat-relaunch-readback.json"), JSON.stringify({
        before: firstState.app.origin,
        after: relaunchedState.app.origin, changedPid: relaunchedState.app.pid !== firstState.app.pid, restored
      }, null, 2))
      expect(relaunchedState.app.pid).not.toBe(firstState.app.pid)
      expect(restored.userStatus).toBe(200)
      expect(await app.waitFor<boolean>(transcriptContains(message), (value) => value, 30_000)).toBe(true)
      expect(relaunchedState.app.origin).toBe(firstState.app.origin)
      expect(await app.waitFor<boolean>(transcriptContains(`stub: ${message}`), (value) => value, 30_000)).toBe(true)
      expect(provider.requests).toEqual([{ path: "/v1/chat/completions", model: "packaged-fixture", text: message }])
    })
  })

})
