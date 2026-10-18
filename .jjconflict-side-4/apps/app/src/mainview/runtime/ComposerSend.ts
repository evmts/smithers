import type { AppStore } from "../state/AppStore"
import type { CommandOutcome } from "../flows/Commands"

/** Move the accepted prompt from the input into its own transcript row. */
export async function animateComposerSend(input: HTMLTextAreaElement | null, store: AppStore, submit: () => Promise<CommandOutcome>): Promise<void> {
  const doc = input?.ownerDocument
  const view = doc?.defaultView
  const text = input?.value.trim()
  const origin = input?.getBoundingClientRect()
  const style = input && view?.getComputedStyle(input)
  const requests = new Set(store.session().sharedPrompts?.filter(row => row.state !== "editing").map(row => row.id))
  const messages = new Set(store.collections.messages.keys())
  const outcome = await submit()
  if (outcome.status !== "executed" || !doc || !view || !text || !origin || !style || store.session().paletteOpen === true || view.matchMedia("(prefers-reduced-motion: reduce)").matches) return
  const request = store.session().sharedPrompts?.find(row => !requests.has(row.id) && row.prompt === text && row.state !== "editing")
  const message = [...store.collections.messages.values()].find(row => !messages.has(row.id) && row.role === "user" && row.text === text)
  const id = request?.id ?? message?.id
  if (!id) return
  // Admission is synchronous, but its React projection may commit next frame.
  const deadline = view.performance.now() + 1000
  const arrive = (): void => {
    if (!input?.isConnected || store.session().paletteOpen === true || view.performance.now() > deadline) return
    const target = doc.querySelector<HTMLElement>(`[data-composer-prompt="${view.CSS.escape(id)}"]`)
    if (!target) {
      if (view.performance.now() < deadline) view.requestAnimationFrame(arrive)
      return
    }
    if (typeof target.animate !== "function") return
    target.scrollIntoView({ block: "nearest", behavior: "instant" })
    const destination = target.getBoundingClientRect()
    const left = origin.left + Number.parseFloat(style.paddingLeft) - destination.left
    const top = origin.top + Number.parseFloat(style.paddingTop) - destination.top
    // A fixed copy clears the scroller's clipping and survives the pending
    // row being replaced by the server's admission receipt mid-flight.
    const flight = target.cloneNode(true) as HTMLElement
    flight.removeAttribute("data-composer-prompt")
    flight.dataset.composerFlight = id
    flight.setAttribute("aria-hidden", "true")
    flight.inert = true
    const appearance = view.getComputedStyle(target)
    Object.assign(flight.style, { position: "fixed", left: `${destination.left}px`, top: `${destination.top}px`, width: `${destination.width}px`,
      zIndex: "82", pointerEvents: "none", font: appearance.font, color: appearance.color })
    const hidden = doc.createElement("style")
    hidden.textContent = `[data-composer-prompt="${view.CSS.escape(id)}"] { opacity: 0; }`
    doc.body.append(hidden, flight)
    const cleanup = () => { flight.remove(); hidden.remove() }
    const animation = flight.animate([
      { transform: `translate(${left}px, ${top}px)`, opacity: 0.7 },
      { transform: "translate(0px, 0px)", opacity: 1 }
    ], { duration: 260, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" })
    void animation.finished.then(cleanup, cleanup)
  }
  view.requestAnimationFrame(arrive)
}
