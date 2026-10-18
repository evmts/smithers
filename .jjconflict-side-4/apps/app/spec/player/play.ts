import type { Journey } from "../journey"
import type { RunResult } from "../results"
import { checkpoint } from "./checkpoint"

export interface PlayerData {
  readonly journeys: Journey[]
  readonly runs: RunResult[]
  readonly counts: Record<string, { up: number; down: number }>
  readonly live: Record<string, string>
}
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
  const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node
}
const button = (text: string, action: () => void, name = text) => {
  const node = element("button", text); node.type = "button"; node.setAttribute("aria-label", name); node.onclick = action; return node
}
/** Captions and captures follow the proof page's player; Mock restores the real spec build. */
export const play = (app: HTMLElement, data: PlayerData, definition: Journey) => {
  const params = new URLSearchParams(location.search)
  const steps = definition.steps.length ? definition.steps : [{ caption: definition.id, go: definition.go, expect: definition.expect ?? [] }]
  let index = Math.max(0, Math.min(Number(params.get("s")) || 0, steps.length - 1))
  let mode: "mock" | "live" = params.get("mode") === "live" ? "live" : "mock"
  let walk = params.get("view") === "walk"
  let timer: ReturnType<typeof setInterval> | undefined
  let replay: AbortController | undefined
  const variants: Record<string, string> = {}
  for (const name of ["as", "data", "net"]) variants[name] = params.get(name) ?? definition.world.variant?.[name] ?? ({ as: "out", data: "full", net: "ok" } as Record<string, string>)[name]!
  const header = element("header"); const home = element("a", "Journeys"); home.href = "/"; header.append(home, element("h1", definition.id))
  const controls = element("nav"); controls.setAttribute("aria-label", "Player")
  const count = element("span"); count.id = "count"; count.setAttribute("aria-live", "polite")
  const caption = element("h2"); caption.id = "caption"
  const stage = element("section"); stage.id = "stage"; stage.setAttribute("data-keyboard-pane", "Capture")
  const chips = element("section"); chips.id = "chips"; chips.setAttribute("aria-label", "Assertions")
  const status = element("p"); status.id = "status"; status.setAttribute("role", "status")
  const labels = element("div"); labels.className = "labels"
  const pause = () => { clearInterval(timer); timer = undefined; autoplay.textContent = "▶"; autoplay.setAttribute("aria-label", "Play") }
  const move = (delta: number) => { pause(); index = Math.max(0, Math.min(index + delta, steps.length - 1)); show() }
  const toggle = () => {
    if (timer) { pause(); return }
    if (index === steps.length - 1) { index = 0; show() }
    autoplay.textContent = "❚❚"; autoplay.setAttribute("aria-label", "Pause")
    timer = setInterval(() => { if (index >= steps.length - 1) { pause(); return }; index++; show() }, 3200)
  }
  const previous = button("◀", () => move(-1), "Previous step")
  const autoplay = button("▶", toggle, "Play")
  const next = button("▶", () => move(1), "Next step")
  const mock = button("Mock", () => { pause(); mode = "mock"; walk = false; show() })
  const live = button("Live", () => { pause(); mode = "live"; walk = false; show() })
  const walking = button("Walk", () => { pause(); walk = !walk; show() })
  const world = element("div"); world.className = "bar"; world.setAttribute("aria-label", "World")
  for (const [name, choices] of Object.entries({ as: ["out", "member"], data: ["full", "empty"], net: ["ok", "slow", "error"] })) {
    const label = element("label", name + " "); const select = element("select"); select.setAttribute("aria-label", name)
    for (const choice of choices) { const option = element("option", choice); option.value = choice; select.append(option) }
    select.value = variants[name]!
    select.onchange = () => { pause(); variants[name] = select.value; show() }
    label.append(select); world.append(label)
  }
  controls.append(previous, autoplay, next, count, mock, live, walking)
  app.replaceChildren(header, controls, world, caption, stage, chips, labels, status)
  const runFor = () => data.runs.find(run => run.journey === definition.id && run.mode === mode)
  const show = () => {
    replay?.abort(); replay = new AbortController(); const signal = replay.signal
    const step = steps[index]!
    status.textContent = ""; count.textContent = `${index + 1}/${steps.length}`; caption.textContent = step.caption
    previous.disabled = index === 0; next.disabled = index === steps.length - 1
    mock.setAttribute("aria-pressed", String(!walk && mode === "mock")); live.setAttribute("aria-pressed", String(!walk && mode === "live")); walking.setAttribute("aria-pressed", String(walk))
    world.hidden = mode !== "mock" || walk
    const url = new URL(location.href); url.searchParams.set("journey", definition.id); url.searchParams.set("s", String(index)); url.searchParams.set("mode", mode); url.searchParams.set("view", walk ? "walk" : "play")
    for (const [name, value] of Object.entries(variants)) url.searchParams.set(name, value)
    history.replaceState(null, "", url.pathname + url.search)
    stage.replaceChildren(); chips.replaceChildren(); labels.replaceChildren()
    if (walk) {
      const layout = element("div"); layout.className = "walk"; const checklist = element("div")
      const checked = JSON.parse(sessionStorage.getItem(`walk:${definition.id}`) ?? "[]") as number[]
      for (const [number, step] of steps.entries()) {
        const label = element("label"); const check = element("input"); check.type = "checkbox"; check.checked = checked.includes(number)
        check.onchange = () => { const saved = new Set<number>(JSON.parse(sessionStorage.getItem(`walk:${definition.id}`) ?? "[]")); if (check.checked) saved.add(number); else saved.delete(number); sessionStorage.setItem(`walk:${definition.id}`, JSON.stringify([...saved])) }
        label.append(check, document.createTextNode(step.caption)); checklist.append(label)
      }
      const frame = element("iframe"); frame.title = "Live walk"; frame.referrerPolicy = "no-referrer"; frame.sandbox.add("allow-scripts", "allow-same-origin")
      const target = "target" in definition.live ? data.live[definition.live.target] : undefined
      if (target) {
        const route = step.go ?? [...steps.slice(0, index + 1)].reverse().find(step => step.go)?.go ?? "/"
        const subject = "subject" in definition.live ? definition.live.subject ?? {} : {}
        frame.src = new URL(route.replace(/\$\{([^}]+)\}/g, (_, key: string) => subject[key] ?? ""), target).href
        layout.append(checklist, frame)
      } else layout.append(checklist, element("p", "Live unavailable"))
      stage.append(layout); return
    }
    const run = runFor(); const receipt = run?.steps[index]
    if (mode === "live") {
      if (receipt) {
        const image = element("img"); image.alt = `${step.caption} · Live`; image.src = `/__spec/capture?id=${encodeURIComponent(`${definition.id}:live:${index}`)}`
        image.onerror = () => { image.replaceWith(element("p", "Capture unavailable")) }; stage.append(image)
      } else stage.append(element("p", run?.reason ?? "Live unavailable"))
    } else if (definition.world.base !== "default") {
      stage.append(element("p", "Mock build unavailable"))
    } else {
      const frame = element("iframe"); frame.title = "Mock checkpoint"; frame.className = "locked"; frame.tabIndex = -1
      const tryIt = button("Try it", () => { pause(); frame.classList.remove("locked"); frame.tabIndex = 0; frame.focus(); tryIt.disabled = true })
      tryIt.disabled = true; stage.append(frame, tryIt)
      void checkpoint(frame, definition, index, variants, signal).then(() => { if (!signal.aborted) tryIt.disabled = false }).catch(error => { if (!signal.aborted) status.textContent = String(error) })
    }
    for (const [number, assertion] of (receipt?.assertions ?? []).entries()) {
      const chip = element("label"); chip.dataset.assertion = String(number)
      const details = element("details"); const summary = element("summary", `${assertion.ok === true ? "✓" : assertion.ok === false ? "✗" : "?"} ${assertion.kind}`)
      details.append(summary, element("pre", `Expected ${JSON.stringify(assertion.expected)}\nActual ${JSON.stringify(assertion.actual)}${assertion.reason ? "\n" + assertion.reason : ""}`)); chip.append(details); chips.append(chip)
    }
    if (!receipt) chips.append(element("span", "No receipt"))
  }
  window.addEventListener("keydown", event => {
    if (event.ctrlKey || event.metaKey || event.altKey || (event.target as HTMLElement).closest("input,textarea,select,button,a,[contenteditable=true],summary")) return
    if (event.key === "ArrowLeft") { event.preventDefault(); move(-1) }
    if (event.key === "ArrowRight") { event.preventDefault(); move(1) }
    if (event.key === " ") { event.preventDefault(); toggle() }
  })
  show()
}
