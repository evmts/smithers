import { expect, type Locator, type Page, type Route } from "@playwright/test"
import { installCloudFixture } from "../playwright/cloudFixture"
import { signedOutVisitor } from "../playwright/identity"
import type { ShowcaseApp, ShowcaseBackend } from "./showcase"

const BOOTED = '[data-testid="transcript"][aria-busy="false"], [data-testid^="tab-body-"]:not([hidden])'

export const DEFAULT_VIEWPORT = { width: 1280, height: 800 } as const

/*
 * The in-page observer. It records invocations in the product's own terms:
 * a button's data-flow, the composer's submitted line (a slash names its
 * flow; plain text is chat.send; Alt+Enter is chat.queue), and the summon
 * chord (palette.open). While recording it also draws a cursor and a chord
 * badge, which live outside the app shell and are aria-hidden.
 */
const observerScript = (recording: boolean): void => {
  const report = (flow: string, door: string): void => {
    void (window as unknown as { __showcaseDoor?: (flow: string, door: string) => Promise<void> }).__showcaseDoor?.(flow, door)
  }
  const log = { doors: { push: ({ flow, door }: { readonly flow: string; readonly door: string }) => report(flow, door) } }
  // What the viewer sees on the control: a form reads as its submit button.
  const labelOf = (element: Element, clicked: Element): string => {
    const control = element instanceof HTMLFormElement ? clicked.closest("button") ?? element.querySelector("button[type=submit]") ?? element : element
    const text = control instanceof HTMLElement ? control.innerText : control.textContent ?? ""
    const label = control.getAttribute("aria-label") ?? (text.trim() === "" ? control.getAttribute("title") ?? "" : text)
    // A lettered choice ("B Engineering") reads without its key hint.
    return label.replace(/\s+/g, " ").trim().replace(/^[A-Z] (?=\S)/, "").slice(0, 40)
  }
  const submitted = (text: string, queued: boolean): void => {
    const line = text.trim()
    if (line === "") return
    if (queued) log.doors.push({ flow: "chat.queue", door: "Alt+Enter" })
    else if (line.startsWith("/")) log.doors.push({ flow: line.slice(1).split(/\s/)[0] ?? "", door: line })
    else log.doors.push({ flow: "chat.send", door: "Enter" })
  }
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
      log.doors.push({ flow: "palette.open", door: "⌘K" })
      return
    }
    const target = event.target
    if (event.key === "Enter" && !event.shiftKey && target instanceof HTMLTextAreaElement && target.dataset.testid === "composer-input") {
      // With the palette open, Enter chooses the highlighted row: a flow row
      // runs that flow; a namespace or help row only moves through the menu.
      const row = event.altKey ? null : document.querySelector('[data-testid="palette"] [role="option"][aria-selected="true"]')
      if (row === null) submitted(target.value, event.altKey)
      else {
        // The "ask" row sends the text to Smithers as a chat turn.
        const flow = row.hasAttribute("data-ask") ? "chat.send" : row.getAttribute("data-flow")
        const line = target.value.trim()
        if (flow === "chat.send") log.doors.push({ flow, door: "Enter" })
        else if (flow !== null) log.doors.push({ flow, door: line.startsWith(`/${flow}`) ? line : `/${flow}` })
      }
    }
  }, true)
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return
    const send = event.target.closest("[data-testid=composer-send]")
    if (send !== null) {
      const input = document.querySelector<HTMLTextAreaElement>("[data-testid=composer-input]")
      if (input !== null) submitted(input.value, false)
      return
    }
    const button = event.target.closest("[data-flow]")
    // A form's flow runs on submit (below), not on a click into its fields.
    if (button !== null && !(button instanceof HTMLFormElement)) log.doors.push({ flow: button.getAttribute("data-flow") ?? "", door: labelOf(button, event.target) })
  }, true)
  document.addEventListener("submit", (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target.closest("[data-flow]") : null
    const submitter = (event as SubmitEvent).submitter
    if (form !== null) log.doors.push({ flow: form.getAttribute("data-flow") ?? "", door: labelOf(form, submitter ?? form) })
  }, true)
  if (!recording) return
  const mount = (): void => {
    if (document.getElementById("showcase-overlay") !== null || document.body === null) return
    const overlay = document.createElement("div")
    overlay.id = "showcase-overlay"
    overlay.setAttribute("aria-hidden", "true")
    overlay.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647"
    overlay.innerHTML = `<div id="showcase-cursor" style="position:absolute;left:-40px;top:-40px;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(255,77,46,.35);border:2px solid rgba(255,77,46,.9);transition:transform .12s"></div>` +
      `<div id="showcase-keys" style="position:absolute;left:84px;bottom:28px;padding:8px 16px;border-radius:10px;background:rgba(20,20,20,.86);color:#fff;font:600 22px/1.2 ui-monospace,Menlo,monospace;opacity:0;transition:opacity .2s"></div>`
    document.body.append(overlay)
    document.addEventListener("mousemove", (event) => {
      const cursor = document.getElementById("showcase-cursor")
      if (cursor !== null) { cursor.style.left = `${event.clientX}px`; cursor.style.top = `${event.clientY}px` }
    }, true)
    document.addEventListener("mousedown", () => {
      const cursor = document.getElementById("showcase-cursor")
      if (cursor !== null) cursor.style.transform = "scale(.7)"
    }, true)
    document.addEventListener("mouseup", () => {
      const cursor = document.getElementById("showcase-cursor")
      if (cursor !== null) cursor.style.transform = ""
    }, true)
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount)
  else mount()
}

const CHORD_LABEL: Record<string, string> = { Meta: "⌘", ControlOrMeta: "⌘", Control: "Ctrl", Alt: "⌥", Shift: "⇧", Enter: "↵", Escape: "Esc", ArrowDown: "↓", ArrowUp: "↑", Tab: "Tab" }
const chordLabel = (keys: string): string => keys.split("+").map(key => CHORD_LABEL[key] ?? key.toUpperCase()).join("")

export interface ShowcaseRun {
  readonly app: ShowcaseApp
  readonly backend: ShowcaseBackend
  /** Read the invoked doors and the registry manifest off the page. */
  readonly collect: () => Promise<{ readonly doors: ReadonlyArray<{ readonly flow: string; readonly door: string }>; readonly registered: ReadonlyArray<string> }>
  /** Milliseconds from the page's creation to the first booted shell. */
  readonly bootedAt: () => number | undefined
}

/** Build the helpers a case receives. `recording` adds pacing, a cursor and chord badges. */
export const prepare = async (page: Page, recording: boolean): Promise<ShowcaseRun> => {
  const created = Date.now()
  let booted: number | undefined
  const doors: Array<{ flow: string; door: string }> = []
  const registered = new Set<string>()
  await page.exposeFunction("__showcaseDoor", (flow: string, door: string) => { doors.push({ flow, door }) })
  await page.addInitScript(observerScript, recording)
  const beat = async (ms = 700): Promise<void> => {
    if (recording) await page.waitForTimeout(ms)
  }
  const readManifest = async (): Promise<void> => {
    const names = await page.locator(".app-shell").first().getAttribute("data-flows", { timeout: 1000 }).catch(() => null)
    for (const name of names?.split(" ") ?? []) if (name !== "") registered.add(name)
  }
  const showChord = async (keys: string): Promise<void> => {
    if (!recording) return
    await page.evaluate((label) => {
      const badge = document.getElementById("showcase-keys")
      if (badge === null) return
      badge.textContent = label
      badge.style.opacity = "1"
      const token = String(Math.random())
      badge.dataset.token = token
      setTimeout(() => { if (badge.dataset.token === token) badge.style.opacity = "0" }, 1100)
    }, chordLabel(keys))
  }
  const click = async (target: Locator): Promise<void> => {
    await expect(target).toBeVisible()
    if (recording) {
      await target.scrollIntoViewIfNeeded()
      const box = await target.boundingBox()
      if (box !== null) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 14 })
      await beat(250)
    }
    await target.click()
  }
  const type = async (target: Locator, text: string): Promise<void> => {
    // Focus by click in both modes, so the assertion run sees the same doors the recording does.
    await target.click()
    if (!recording) return target.fill(text)
    await target.fill("")
    await target.pressSequentially(text, { delay: text.length > 40 ? 18 : 45 })
  }
  const composer = page.getByTestId("composer-input")
  const openComposer = async (): Promise<void> => {
    if (await composer.isVisible()) return
    await showChord("Meta+k")
    await page.keyboard.press("ControlOrMeta+k")
    await expect(composer).toBeVisible()
    await beat(300)
  }
  const submit = async (text: string): Promise<void> => {
    await openComposer()
    await type(composer, text)
    await beat(350)
    await showChord("Enter")
    await composer.press("Enter")
    await expect(composer).not.toHaveValue(text)
    await readManifest()
  }
  const app: ShowcaseApp = {
    recording,
    open: async (path = "/") => {
      await page.goto(path)
      // The booted view (e2e/README.md "Waiting after a navigation"): a settled transcript or an active tab body.
      await expect(page.locator(BOOTED).first()).toBeAttached({ timeout: 30_000 })
      booted ??= Date.now() - created
      await readManifest()
      await beat(1500)
    },
    slash: submit,
    say: submit,
    closeComposer: async () => {
      if (!await composer.isVisible()) return
      await showChord("Escape")
      await composer.press("Escape")
      await expect(composer).toBeHidden()
      await beat(300)
    },
    press: async (keys) => {
      await showChord(keys)
      await page.keyboard.press(keys)
      await beat(300)
    },
    click,
    type,
    beat,
    show: async (target) => {
      await expect(target).toBeVisible()
      await target.evaluate(node => node.scrollIntoView({ block: "center", behavior: "smooth" }))
      await page.waitForTimeout(recording ? 700 : 100)
    },
    maximize: async (card) => {
      const id = (await card.getAttribute("data-testid"))?.replace(/^card-/, "")
      if (id === undefined) throw new Error("maximize: not an embedded card")
      await click(card.getByTestId(`card-maximize-${id}`))
      await expect(card).toHaveAttribute("data-maximized", "true")
      await beat(600)
    },
    saw: async (flow, proof) => {
      await proof()
      doors.push({ flow, door: "" })
    },
    still: async (name, target) => {
      const directory = process.env.SHOWCASE_STILLS
      if (directory === undefined) return
      await page.evaluate(() => document.fonts.ready)
      const path = `${directory}/${name}.png`
      // An element is clipped out of the page as the viewer sees it, so a scrolled pane never leaves it blank.
      const clip = target === undefined ? null : await target.boundingBox()
      await page.screenshot({ path, animations: "disabled", ...(clip === null ? {} : { clip }) })
    }
  }
  const route = async (match: (url: URL) => boolean, handler: (route: Route) => Promise<void> | void): Promise<void> => {
    await page.route(match, handler)
  }
  const backend: ShowcaseBackend = {
    cloud: (options) => installCloudFixture(page, options),
    signedOut: () => signedOutVisitor(page),
    json: (pathname, body, status = 200) =>
      route(url => url.pathname === pathname, routed => routed.fulfill({ status, json: typeof body === "function" ? (body as () => unknown)() : body })),
    route
  }
  return {
    app,
    backend,
    bootedAt: () => booted,
    collect: async () => {
      await readManifest()
      return { doors: [...doors], registered: [...registered].sort() }
    }
  }
}
