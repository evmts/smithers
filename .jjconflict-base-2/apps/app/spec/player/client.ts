import type { Journey } from "../journey"
import type { RunResult } from "../results"

interface Data { journeys: Journey[]; runs: RunResult[]; counts: Record<string, { up: number; down: number }>; live: Record<string, string>; drift: { builtMinutes?: number; ahead?: number; regressed?: number } | null }
const app = document.querySelector<HTMLElement>("#app")!
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
  const element = document.createElement(tag)
  if (text !== undefined) element.textContent = text
  return element
}
const button = (text: string, action: () => void) => {
  const element = node("button", text); element.type = "button"; element.onclick = action; return element
}
const main = async () => {
  const response = await fetch("/__spec/data")
  if (!response.ok) throw new Error("Results unavailable")
  const data = await response.json() as Data
  const header = node("header"); header.append(node("h1", "Spec")); app.replaceChildren(header)
  if (data.drift) header.append(node("small", `built ${data.drift.builtMinutes ?? "?"} min ago · ahead ${data.drift.ahead ?? 0} · regressed ${data.drift.regressed ?? 0}`))
  const filters = node("nav"); filters.setAttribute("aria-label", "Results")
  const list = node("div"); app.append(filters, list)
  let filter = ""
  const present = (journey: Journey, mode: string) => data.runs.some(run => run.journey === journey.id && (mode === "judged" ? run.steps.some(step => step.assertions.some(a => ["fuzzy", "rubric"].includes(a.kind) && a.ok !== null)) : run.mode === mode && run.steps.length > 0))
  const show = () => {
    list.replaceChildren()
    for (const site of [...new Set(data.journeys.map(j => j.site))]) {
      const section = node("section"); section.append(node("h2", site)); const items = node("ul")
      for (const journey of data.journeys.filter(j => j.site === site && (!filter || present(j, filter)))) {
        const item = node("li"); const link = node("a", journey.id); link.href = `?journey=${encodeURIComponent(journey.id)}`; item.append(link)
        for (const mode of ["mock", "live", "judged"]) {
          const pill = button(`${mode} ${Number(present(journey, mode))}`, () => { filter = filter === mode ? "" : mode; show() }); pill.setAttribute("aria-label", `${journey.id} ${mode} filter`); item.append(pill)
        }
        items.append(item)
      }
      if (items.children.length) { section.append(items); list.append(section) }
    }
    for (const child of filters.children) child.setAttribute("aria-pressed", String((child as HTMLElement).dataset.mode === filter))
  }
  for (const mode of ["mock", "live", "judged"]) {
    const control = button(`${mode} ${data.journeys.filter(j => present(j, mode)).length}`, () => { filter = filter === mode ? "" : mode; show() }); control.dataset.mode = mode; filters.append(control)
  }
  show()
}
void main().catch(error => { app.replaceChildren(node("p", String(error))) })
