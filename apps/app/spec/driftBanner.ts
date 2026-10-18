/** Loaded before the fixture transport; this read stays on the spec host. */
const request = globalThis.fetch.bind(globalThis)
const show = async () => {
  try {
    const response = await request("/__spec/drift")
    if (!response.ok) return
    const value = await response.json() as { builtMinutes: number; ahead: number; regressed: number }
    if (![value.builtMinutes, value.ahead, value.regressed].every(n => Number.isInteger(n) && n >= 0)) return
    const ready = () => {
      let banner = document.getElementById("spec-drift")
      if (!banner) { banner = document.createElement("aside"); banner.id = "spec-drift"; banner.setAttribute("role", "status"); document.body.prepend(banner) }
      banner.textContent = `built ${value.builtMinutes} min ago · ahead ${value.ahead} · regressed ${value.regressed}`
    }
    if (document.body) ready()
    else document.addEventListener("DOMContentLoaded", ready, { once: true })
  } catch { /* Missing feed never fabricates a green count. */ }
}
void show()
setInterval(() => { void show() }, 60_000)
