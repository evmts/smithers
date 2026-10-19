import { afterAll, beforeAll, expect, test } from "bun:test"
import { chromium, type Browser, type Page } from "playwright"
import { mkdir, readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { fixtureCards } from "../../src/mainview/cards/fixtures/UiSurfaces"

/*
 * The surfaces smithers-ui-DESIGN.md extends, rendered in a real browser at
 * desktop and phone widths, light and dark: every card mounts with no console
 * error and no horizontal overflow, and `UI_EVIDENCE_DIR` receives one
 * screenshot per card, width and theme.
 */
let browser: Browser
let server: ReturnType<typeof Bun.serve>
const evidence = process.env.UI_EVIDENCE_DIR
beforeAll(async () => {
  const build = Bun.spawn([process.execPath, fileURLToPath(new URL("./ui-surfaces.build.ts", import.meta.url))], { stdout: "pipe", stderr: "pipe" })
  const [script, errors, status] = await Promise.all([new Response(build.stdout).text(), new Response(build.stderr).text(), build.exited])
  if (status !== 0) throw new Error(`UI surfaces fixture did not build: ${errors}`)
  const font = await readFile(Bun.resolveSync("@fontsource/inter/files/inter-latin-400-normal.woff2", import.meta.dir))
  const mono = await readFile(Bun.resolveSync("@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2", import.meta.dir))
  const styles = `@font-face{font-family:Inter;font-weight:400;src:url(data:font/woff2;base64,${font.toString("base64")}) format('woff2')}` +
    `@font-face{font-family:"IBM Plex Mono";font-weight:400;src:url(data:font/woff2;base64,${mono.toString("base64")}) format('woff2')}` +
    (await Promise.all(["tokens", "base", "chat", "cards", "github-cards", "identity", "threads"].map((name) =>
      readFile(new URL(`../../src/mainview/styles/${name}.css`, import.meta.url), "utf8")))).join("\n")
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (request) => {
    const path = new URL(request.url).pathname
    if (path === "/fixture.js") return new Response(script, { headers: { "content-type": "text/javascript" } })
    return new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles}
      body { margin: 0; background: var(--bg); } main { padding: 16px; max-width: 900px; margin: 0 auto; box-sizing: border-box; width: 100%; }</style></head>
      <body><main id="fixture"></main><script type="module" src="/fixture.js"></script></body></html>`, { headers: { "content-type": "text/html" } })
  } })
  browser = await chromium.launch()
  if (evidence !== undefined) await mkdir(evidence, { recursive: true })
}, 60_000)
afterAll(async () => {
  try { await browser?.close() }
  finally { await server?.stop(true) }
}, 15_000)

const open = async (width: number, theme: "light" | "dark", card?: string): Promise<{ page: Page; errors: string[] }> => {
  const errors: string[] = []
  const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: theme })
  page.on("pageerror", (error) => errors.push(String(error)))
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()) })
  page.setDefaultTimeout(15_000)
  await page.goto(`${server.url}?theme=${theme}${card === undefined ? "" : `&card=${encodeURIComponent(card)}`}`)
  await page.locator(".smithers-card").first().waitFor()
  await page.evaluate(() => document.fonts.ready)
  return { page, errors }
}

const cards = fixtureCards()

/*
 * The agent rows the fixture declares, read off the fixture itself: a profile
 * is a row of the target repository's flow catalog (controller/agents.ts), so
 * the probe can only knock on a door the fixture actually renders. It used to
 * name `implementation`, one of the `@smthrs/rpc/AgentRoles` seed ids that
 * 9396d62f retired from this card because no host without `install` answers
 * for them ([#3831](https://github.com/smithersai/smithers/issues/3831)), and
 * the hardcoded name outlived the rows.
 */
const agentsCard = cards.find((card) => card.kind === "agents")
const agentFlows = agentsCard !== undefined && "agents" in agentsCard.payload ? agentsCard.payload.agents : []

for (const width of [1280, 390]) {
  for (const theme of ["light", "dark"] as const) {
    test(`every surface renders at ${width}px in ${theme} with no console error and no horizontal overflow`, async () => {
      const { page, errors } = await open(width, theme)
      try {
        for (const card of cards) {
          const node = page.getByTestId(`card-${card.id}`)
          await node.waitFor()
          expect(await node.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
          if (evidence !== undefined) await node.screenshot({ path: `${evidence}/${card.kind}-${width}-${theme}.png` })
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
        if (evidence !== undefined) await page.screenshot({ path: `${evidence}/all-${width}-${theme}.png`, fullPage: true })
        expect(errors).toEqual([])
      } finally { await page.close() }
    }, 60_000)
  }
}

test("the surfaces answer the keyboard: a Runs door names its agent flow, a conversation row opens on Enter, a step row expands on Enter, and the answered Agents card names its source", async () => {
  const { page, errors } = await open(1280, "light")
  try {
    /*
     * The Runs door goes first: a command is a transition, and the controller
     * rewrites an open Agents card to the inventory this host answers for
     * after every one of them. The seeded rows are the card's content until
     * then, so the keyboard reaches them here and nowhere later.
     */
    expect(agentFlows.length).toBeGreaterThan(0)
    for (const flow of agentFlows) {
      const door = page.getByTestId(`agent-runs-${flow.id}`)
      await door.waitFor()
      expect(await door.count()).toBe(1)
    }
    const first = agentFlows[0]!
    const runs = page.getByTestId(`agent-runs-${first.id}`)
    await runs.focus()
    expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBe(`agent-runs-${first.id}`)
    await page.keyboard.press("Enter")
    await page.waitForFunction(() => window.uiSurfaces.commands.some((command) => command.name === "runs.list"))
    expect(await page.evaluate(() => window.uiSurfaces.commands.find((command) => command.name === "runs.list")?.args)).toContain(first.id)
    const row = page.locator(".thread-row-btn").first()
    await row.focus()
    await page.keyboard.press("Enter")
    await page.waitForFunction(() => window.uiSurfaces.commands.some((command) => command.name === "issues.view"))
    expect(await page.evaluate(() => window.uiSurfaces.commands.find((command) => command.name === "issues.view")?.args)).toContain("2104 example/app")
    const step = page.locator(".run-step").first()
    await step.focus()
    await page.keyboard.press("Enter")
    await page.waitForFunction(() => document.querySelector(".run-step[aria-expanded='true']") !== null)
    expect(await page.locator(".run-trace-pane").count()).toBe(1)
    /*
     * What the card holds once the controller has answered: this fixture host
     * has no repository to read a flow catalog from, so the card names that
     * source and keeps no row. An inventory nothing answered for is not a Runs
     * capability, and the empty list is not presented as a verdict.
     */
    const source = page.getByTestId("card-agents").locator("[data-agents-source]")
    await source.waitFor()
    expect(await source.getAttribute("data-agents-source")).toBe("no-repository")
    expect(await page.getByTestId("card-agents").locator("[data-testid=\"agents-list\"] > li.agent-row").count()).toBe(0)
    expect(errors).toEqual([])
  } finally { await page.close() }
}, 60_000)
