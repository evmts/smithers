import type { RunResult } from "../results"

/** Send only receipt coordinates; the host owns identity, time and assertion evidence. */
export const thumbs = (container: HTMLElement, chips: HTMLElement, run: RunResult, step: number, counts: Record<string, { up: number; down: number }>, status: HTMLElement) => {
  const up = document.createElement("button"); up.textContent = "👍"; up.setAttribute("aria-label", "Thumb up")
  const down = document.createElement("button"); down.textContent = "👎"; down.setAttribute("aria-label", "Thumb down")
  const counter = document.createElement("span"); counter.setAttribute("aria-label", "Labels")
  const showCount = () => { const value = counts[run.journey] ?? { up: 0, down: 0 }; counter.textContent = `👍 ${value.up} · 👎 ${value.down}` }
  const form = document.createElement("form"); form.hidden = true
  const note = document.createElement("textarea"); note.setAttribute("aria-label", "Note"); note.maxLength = 4000
  const save = document.createElement("button"); save.textContent = "Save"; save.type = "submit"
  const selected = new Set<number>()
  for (const chip of chips.querySelectorAll<HTMLElement>("[data-assertion]")) {
    const check = document.createElement("input"); check.type = "checkbox"; check.hidden = true
    check.setAttribute("aria-label", `Dispute assertion ${Number(chip.dataset.assertion) + 1}`)
    check.onchange = () => { note.setCustomValidity(""); const index = Number(chip.dataset.assertion); if (check.checked) selected.add(index); else selected.delete(index) }
    chip.prepend(check)
  }
  const submit = async (thumb: "up" | "down") => {
    if (save.disabled) return
    if (thumb === "down" && !note.value.trim() && !selected.size) { note.setCustomValidity("Add a note or select a chip"); note.reportValidity(); return }
    note.setCustomValidity(""); save.disabled = true; up.disabled = true; down.disabled = true; status.textContent = "Saving…"
    try {
      const response = await fetch("/__spec/labels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ journey: run.journey, step, mode: run.mode, revision: run.revision, thumb, assertions: thumb === "down" ? [...selected] : [], ...(note.value.trim() ? { note: note.value.trim() } : {}) }) })
      if (!response.ok) throw new Error(response.status === 401 ? "Sign in with the host link" : response.status === 409 ? "Receipt changed; reload" : "Label not saved; retry")
      const result = await response.json() as { counts: typeof counts }
      Object.assign(counts, result.counts); showCount()
      if (up.isConnected) { status.textContent = "Saved"; form.hidden = true; note.value = "" }
    } catch (error) { if (up.isConnected) status.textContent = (error as Error).message }
    finally { save.disabled = false; up.disabled = false; down.disabled = false }
  }
  note.oninput = () => note.setCustomValidity("")
  up.onclick = () => { void submit("up") }
  down.onclick = () => { form.hidden = false; chips.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(check => { check.hidden = false }); note.focus() }
  form.onsubmit = event => { event.preventDefault(); void submit("down") }
  form.append(note, save); container.append(up, down, counter, form); showCount()
}
