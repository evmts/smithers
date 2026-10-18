import { interpolate, type Element, type Journey } from "../journey"

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
/** Restore from the last route, then replay its remaining gestures inside the real build. */
export const checkpoint = async (frame: HTMLIFrameElement, definition: Journey, index: number, variant: Record<string, string>, signal: AbortSignal) => {
  const bindings = "subject" in definition.live ? definition.live.subject ?? {} : {}
  const planned = definition.steps.length ? definition.steps : [{ caption: definition.id, go: definition.go, expect: definition.expect ?? [] }]
  let start = index
  while (start > 0 && planned[start]?.go === undefined) start--
  const route = interpolate(planned[start]?.go ?? definition.go ?? "/", bindings)
  const url = new URL(route, location.origin)
  if (url.origin !== location.origin) throw new Error("Mock route must stay on the spec host")
  url.searchParams.set("__spec_mock", "1")
  for (const [key, value] of Object.entries({ ...definition.world.variant, ...variant })) url.searchParams.set(key, value)
  const navigate = (destination: string) => new Promise<void>((resolve, reject) => {
    const abort = () => { cleanup(); reject(new DOMException("Cancelled", "AbortError")) }
    const load = () => { cleanup(); resolve() }
    const timeout = setTimeout(() => { cleanup(); reject(new Error("Checkpoint timed out")) }, 20_000)
    const cleanup = () => { clearTimeout(timeout); frame.removeEventListener("load", load); signal.removeEventListener("abort", abort) }
    if (signal.aborted) { abort(); return }
    frame.addEventListener("load", load, { once: true }); signal.addEventListener("abort", abort, { once: true }); frame.src = destination
  })
  await navigate(url.href)
  const find = (target: Element, root: Document | HTMLElement): HTMLElement | undefined => {
    const scope = target.within ? find(target.within, root) : root
    if (!scope) return undefined
    const selector = ({ button: 'button,[role="button"]', link: 'a[href],[role="link"]', textbox: 'input,textarea,[contenteditable="true"],[role="textbox"]', region: '[role="region"]' } as Record<string, string>)[target.role]
    if (!selector) throw new Error(`Unsupported checkpoint role: ${target.role}`)
    const matches = [...scope.querySelectorAll<HTMLElement>(selector)].filter(element => {
      const name = element.getAttribute("aria-label") ?? element.textContent?.trim()
      return (!target.name || name === target.name) && (!target.href || element.getAttribute("href") === target.href) && element.getClientRects().length > 0
    })
    if (matches.length > 1) throw new Error(`Ambiguous checkpoint control: ${target.name ?? target.role}`)
    return matches[0]
  }
  for (let current = start + 1; current <= index; current++) {
    const step = planned[current]!
    if (step.say) throw new Error("Chat checkpoint replay is unavailable")
    const target = step.click ?? step.type?.into
    if (!target) continue
    let control: HTMLElement | undefined
    const deadline = Date.now() + 15_000
    while (!signal.aborted && !(control = find(target, frame.contentDocument!)) && Date.now() < deadline) await sleep(50)
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError")
    if (!control) throw new Error(`Checkpoint control unavailable: ${target.name ?? target.role}`)
    if (step.click) {
      const link = control.closest("a")
      if (link?.target === "_blank") {
        if (new URL(link.href).origin !== location.origin) throw new Error("Linked document must stay on the spec host")
        await navigate(link.href)
      } else control.click()
    }
    else if (step.type) {
      const value = interpolate(step.type.text, bindings)
      const win = frame.contentWindow!
      const prototype = control.tagName === "TEXTAREA" ? win.document.createElement("textarea") : win.document.createElement("input")
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(prototype), "value")?.set?.call(control, value)
      control.dispatchEvent(new Event("input", { bubbles: true }))
    }
  }
}
