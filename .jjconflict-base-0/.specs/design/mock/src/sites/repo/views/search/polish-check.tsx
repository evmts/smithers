import { Window } from "happy-dom"
import type { ComponentType } from "react"

// Exercise mounted views and their real slash handlers without launching a browser.
const dom = new Window({ url: "https://mock.example.test/" })
for (const name of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLFormElement", "Event", "CustomEvent", "MouseEvent", "FormData", "sessionStorage", "localStorage"] as const) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name === "window" ? dom : dom[name] })
}
Object.defineProperty(globalThis, "matchMedia", { configurable: true, value: dom.matchMedia.bind(dom) })
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true })

const [{ createElement, act }, { createRoot }, { MockProvider, DEFAULTS }, fixtures, slash,
  { AgentsReady }, { FlowReady }, { WikiReady }, { Releases }, { GeneralReady }, { ModelsReady },
  { SecretsReady }, { MembersReady }, { SyncReady }, { TriggersReady }, { Search }] = await Promise.all([
  import("react"), import("react-dom/client"), import("../../../core/mock"), import("../../fixtures"), import("../../frame/slash"),
  import("../flows/Agents"), import("../flows/Flow"), import("../wiki/Wiki"), import("../releases/Releases"),
  import("../settings/General"), import("../settings/Models"), import("../settings/Secrets"), import("../settings/Members"),
  import("../settings/Sync"), import("../settings/Triggers"), import("./Search")
])
fixtures.selectRepo("maya/tinyhttp")
dom.sessionStorage.setItem("site-mock-flags", JSON.stringify({ ...DEFAULTS, as: "in", role: "member", host: "install", landing: "open" }))
const host = dom.document.createElement("div")
dom.document.body.append(host)
const container = host as unknown as HTMLElement
const root = createRoot(container)
let revision = 0
let assertions = 0
const check = (value: unknown, message: string) => {
  assertions++
  if (!value) throw new Error(message)
}
const mount = async <P extends object,>(view: ComponentType<P>, props = {} as P, path = "flows") => {
  dom.location.hash = `#/smithers.sh/maya/tinyhttp/${path}`
  await act(async () => root.render(createElement(MockProvider, { key: ++revision, children: createElement(view, props) })))
}
const run = async (name: string, values: Record<string, string> = {}) => {
  const command = slash.getSlash(name)
  check(command, `${name} is registered on its view`)
  check(!slash.missingSlashFields(command!, values).length, `${name} accepts its button arguments`)
  await act(async () => command!.run(values, { flags: { ...DEFAULTS, as: "in", role: "member", host: "install", landing: "open" }, location: dom.location.hash, closeAsk: () => {} }))
}

await mount(FlowReady, { flow: fixtures.flows[0] })
await run("flow.run", { flow: fixtures.flows[0].name })
check(container.querySelector('[aria-label="Run a flow"]'), "flow.run opens the inputs card")
await run("triggers.set", { trigger: "1", enabled: "off" })
check(container.querySelector('[role="switch"]')?.getAttribute("aria-checked") === "false", "triggers.set changes the visible switch")

await mount(AgentsReady)
const agent = fixtures.agents[0]
const select = container.querySelector<HTMLSelectElement>(`#repo-agent-${agent.id}`)!
const otherModel = Array.from(select.options).find(option => option.value !== agent.model)?.value
check(otherModel, "The agent has another available model")
await run("agent.model", { agent: agent.id, model: otherModel! })
check(select.value === otherModel, "agent.model updates the agent select")
await run("model.connect", { provider: "claude" })
check(dom.location.hash.endsWith("settings/models?connect=claude"), "Agent connections open the requested provider")

await mount(WikiReady, { slug: "middleware-order" }, "wiki/middleware-order")
const wikiRevision = fixtures.wikiPage("middleware-order")!.revision
await run("wiki.edit")
check(container.querySelector("textarea"), "wiki.edit opens the markdown editor")
await run("wiki.cancel")
await run("wiki.accept", { run: "run-511" })
check(!container.querySelector(".repo-wiki-proposal"), "wiki.accept removes the accepted proposal")
check(container.textContent?.includes(`revision ${wikiRevision + 1}`), "wiki.accept advances the page revision")
await mount(WikiReady, { slug: "middleware-order" }, "wiki/middleware-order")
await run("wiki.dismiss", { run: "run-511" })
check(!container.querySelector(".repo-wiki-proposal"), "wiki.dismiss removes the dismissed proposal")
check(container.textContent?.includes(`revision ${wikiRevision}`), "wiki.dismiss keeps the page revision")

await mount(Releases, {}, "releases")
await run("release.draft")
check(dom.location.hash.endsWith("releases?draft=1"), "release.draft opens a release draft")
await mount(Releases, {}, "releases?draft=1")
await run("release.notes", { tag: "v0.4.2" })
check(container.querySelector<HTMLTextAreaElement>("#repo-releases-notes")?.value.includes("pull/32"), "release.notes fills landed changes")

await mount(GeneralReady, {}, "settings/general")
await run("settings.feature", { feature: "wiki" })
check(!container.querySelector<HTMLButtonElement>('[title="/settings.save general"]')?.disabled, "Changed settings enable Save")
await run("settings.save", { section: "general" })
check(container.querySelector<HTMLButtonElement>('[title="/settings.save general"]')?.disabled, "settings.save submits and clears unsaved changes")

await mount(ModelsReady, {}, "settings/models")
await run("model.connect", { provider: "codex" })
check(container.textContent?.includes("Connect Codex") && container.querySelector(".repo-settings-form-card"), "model.connect opens the connection form")
await run("model.disconnect", { provider: "claude" })
check(container.querySelector('[role="dialog"]')?.textContent?.includes("Disconnect Claude?"), "model.disconnect opens a confirmation")

await mount(SecretsReady, {}, "settings/secrets")
await run("secret.new", { name: "RELEASE_TOKEN" })
check(container.querySelector<HTMLInputElement>('input:not([type="password"])')?.value === "RELEASE_TOKEN", "secret.new prefills the secret name")
check(container.querySelector('input[type="password"]'), "Secret values stay in a password field")

await mount(MembersReady, {}, "settings/members")
await run("member.invite", { login: "dev-ahn", role: "member" })
check(container.querySelector<HTMLInputElement>(".repo-settings-form-card input")?.value === "dev-ahn", "member.invite prefills the invite form")

await mount(SyncReady, {}, "settings/sync")
await run("sync.now")
check(container.querySelector("time")?.getAttribute("datetime") === fixtures.MOCK_NOW, "sync.now updates the last sync time")

await mount(TriggersReady, {}, "settings/triggers")
const trigger = `${fixtures.flows[0].name}:0`
await run("triggers.set", { trigger, enabled: "off" })
check(!container.querySelector<HTMLInputElement>("tbody input")?.checked, "Settings triggers.set updates the table control")

await mount(Search, {}, "search")
await run("search", { query: "parseQuery" })
check(dom.location.hash.includes("search?q=parseQuery&type=code"), "search navigates to the requested query")
await act(async () => root.unmount())
await dom.happyDOM.close()
console.log(`s1-polish: ${assertions} mounted-view slash assertions passed`)
