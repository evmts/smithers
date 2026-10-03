import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { Glob } from "bun"

import { act } from "react"
import { readFileSync } from "node:fs"
import type { StoryModule, ViewStory } from "./stories"

GlobalRegistrator.register()
const { createRoot } = await import("react-dom/client")
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
afterAll(() => GlobalRegistrator.unregister())
let consoleError: ReturnType<typeof spyOn>
beforeEach(() => { consoleError = spyOn(console, "error").mockImplementation(() => {}) })
afterEach(() => {
  const calls = [...consoleError.mock.calls]
  consoleError.mockRestore()
  expect(calls).toEqual([])
})
const paths = [...new Glob("*View.stories.tsx").scanSync({ cwd: import.meta.dir })].sort()
if (!paths.length) throw new Error("No View stories discovered")

async function mounted(story: ViewStory, removed = false) {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const onAction = mock((_tag: string, _args?: Record<string, string>) => {})
  const onView = mock((_patch: Record<string, unknown>) => {})
  await act(async () => root.render(story.render({ onAction, onView }, removed ? story.actions?.slice(1) : story.actions)))
  return { host, onAction, onView, close: async () => { await act(async () => root.unmount()); host.remove() } }
}
for (const path of paths) {
  const { stories } = await import(new URL(path, import.meta.url).href) as StoryModule
  if (!stories?.length) throw new Error(`${path} exports no stories`)
  for (const story of stories) for (const theme of ["light", "dark"]) {
    test(`${path}/${story.name} ${theme} DOM`, async () => {
      document.documentElement.dataset.theme = theme
      const mountedStory = await mounted(story)
      const { host, onAction, onView } = mountedStory
      try {
        if (story.name.startsWith("state-")) expect(host.textContent).toBe(story.expect[0])
        for (const text of story.expect) {
          if (story.name.startsWith("actor-")) {
            const chips = host.querySelectorAll(".mvp-avatar"); expect(chips.length).toBeGreaterThan(0)
            for (const chip of chips) expect(story.name === "actor-fixture-system" ? chip.getAttribute("data-kind") : chip.getAttribute("aria-label")).toContain(text)
          } else expect([host.textContent, ...[...host.querySelectorAll<HTMLInputElement>("input:not([type=password])")].map(input => input.value)].join("\n")).toContain(text)
        }
        if (path === "SetupView.stories.tsx" || path === "SettingsView.stories.tsx") {
          // Form actions project one submit or two stepper controls, with draft fields.
          const fixture = Object.values(path.startsWith("Setup") ? { ...setup, ...personOnlyFixtures } : settings).find(item => item.name === story.name)!
          const supplied = ([...(fixture.model.this_mac.capacity === 0 && fixture.model.this_mac.limit ? [fixture.model.this_mac.limit.fix] : []), ...fixture.actions] as import("@smthrs/rpc/CardAction").Action[]).map(action => ({ ...action, input: action.input?.map(field => ({ ...field })) }))
          if (path === "SettingsView.stories.tsx") {
            const order = ["machine", "address", "fast", "coding", "jev", "capacity", "parallel", "todo_daily_admissions", "health", "notifications", "obsidian"]
            const rank = (action: import("@smthrs/rpc/CardAction").Action) => order.indexOf(action.tag === "github" ? "health" : action.tag === "docs" ? "notifications" : action.args?.role ?? action.args?.field ?? action.args?.step ?? "")
            supplied.sort((a, b) => rank(a) - rank(b))
            for (const action of supplied) for (const field of action.input ?? []) {
              const model = fixture.model as import("@smthrs/rpc/SettingsCard").SettingsCard
              const value = action.args?.field === "capacity" ? model.capacity : action.args?.field === "parallel" ? model.parallel : action.args?.field === "todo_daily_admissions" ? model.todo_daily_admissions : action.args?.field === "obsidian" ? model.obsidian?.path : undefined
              if (value !== undefined) field.value = String(value)
            }
            expect(host.textContent).not.toMatch(/jev/i)
            for (const element of host.querySelectorAll("*")) for (const attribute of element.attributes) expect(attribute.value).not.toMatch(/jev/i)
          }
          const forms = [...host.querySelectorAll<HTMLFormElement>("form[data-flow]")]
          expect(forms.map(form => form.dataset.flow)).toEqual(supplied.map(action => action.tag))
          for (const [index, form] of forms.entries()) {
            const action = supplied[index]!
            const values = Object.fromEntries((action.input ?? []).map(field => [field.name, field.value ?? field.choices?.[0] ?? ""]))
            const buttons = [...form.querySelectorAll<HTMLButtonElement>("button")]
            for (const button of buttons) expect(button.disabled).toBe(!!action.disabled)
            if (action.disabled) expect(form.textContent).toContain(action.disabled.reason)
            for (const button of buttons) {
              onAction.mockClear()
              await act(async () => action.disabled ? button.click() : button.type === "submit"
                ? form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
                : button.click())
              expect(onAction).toHaveBeenCalledTimes(action.disabled ? 0 : 1)
              if (!action.disabled) expect(onAction.mock.calls[0]?.[0]).toBe(action.tag)
              if (!action.disabled && button.type === "submit") expect(onAction.mock.calls[0]).toEqual([action.tag, { ...action.args, ...values }])
            }
          }
          return
        }
        const interactions = story.interactions ?? []
        const gestureControls = new Set(interactions.filter(item => item.gesture).map(item => host.querySelector(item.selector)))
        const controls = [...host.querySelectorAll<HTMLButtonElement>("[data-flow]")].filter(control => !gestureControls.has(control))
        const actions = story.actions ?? []
        expect(controls.map(control => control.dataset.flow)).toEqual(actions.map(action => action.tag))
        for (let index = 0; index < actions.length; index++) {
          const action = actions[index]!, control = controls[index]!
          expect(control.textContent || control.getAttribute("aria-label")).toContain(action.label)
          onAction.mockClear(); onView.mockClear()
          if (action.disabled) {
            expect(control.disabled).toBe(true)
            expect(host.textContent).toContain(action.disabled.reason)
          }
          await act(async () => control.click())
          expect(onView).toHaveBeenCalledTimes(0)
          if (action.disabled) expect(onAction).toHaveBeenCalledTimes(0)
          else {
            expect(onAction).toHaveBeenCalledTimes(1)
            expect(onAction.mock.calls[0]).toEqual([action.tag, action.args ?? {}])
          }
        }
        const covered = new Set(controls)
        for (const interaction of interactions) {
          const control = host.querySelector<HTMLElement>(interaction.selector)
          expect(control).not.toBeNull()
          covered.add(control as HTMLButtonElement)
          onAction.mockClear(); onView.mockClear()
          const gesture = interaction.gesture ? story.gestures?.[interaction.gesture] : undefined
          const expectedAction = interaction.action ?? (gesture ? { tag: gesture.tag, args: gesture.args ?? {} } : undefined)
          await act(async () => {
            if (interaction.value !== undefined) {
              const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
              Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(control, interaction.value)
            }
            control!.dispatchEvent(interaction.event === "keydown"
              ? new KeyboardEvent("keydown", { key: interaction.key, bubbles: true })
              : new Event(interaction.event ?? "click", { bubbles: true }))
          })
          expect(onAction).toHaveBeenCalledTimes(expectedAction ? 1 : 0)
          expect(onView).toHaveBeenCalledTimes(interaction.patch ? 1 : 0)
          if (expectedAction) expect(onAction.mock.calls[0]).toEqual([expectedAction.tag, expectedAction.args])
          if (interaction.patch) expect(onView.mock.calls[0]).toEqual([interaction.patch])
        }
        for (const gesture of Object.keys(story.gestures ?? {})) {
          expect(interactions.filter(interaction => interaction.gesture === gesture)).toHaveLength(1)
        }
        // Every local/view control needs a declared interaction and callback expectation.
        for (const control of host.querySelectorAll("button, input, select, textarea, [role=button]")) {
          expect(covered.has(control as HTMLButtonElement)).toBe(true)
        }
      } finally { await mountedStory.close() }
      if (story.actions?.length) {
        const removed = await mounted(story, true)
        try { expect([...removed.host.querySelectorAll<HTMLElement>("[data-flow]")].filter(control => !(story.interactions ?? []).some(item => item.gesture && control.matches(item.selector))).map(control => control.dataset.flow)).toEqual(story.actions.slice(1).map(action => action.tag)) }
        finally { await removed.close() }
      }
    })
  }
}

// Assert independent status mappings in both themes; no test reads design specs.
for (const theme of ["light", "dark"]) test(`Paper tone mappings ${theme}`, () => {
  document.documentElement.dataset.theme = theme
  const css = document.createElement("style")
  css.textContent = readFileSync(new URL("../../styles/tokens.css", import.meta.url), "utf8") + readFileSync(new URL("../../styles/views/primitives.css", import.meta.url), "utf8")
  document.head.append(css)
  try {
    for (const [tone, token] of [["live", "--brand"], ["attention", "--attention"], ["failed", "--danger"], ["done", "--text-muted"], ["quiet", "--text-muted"]]) {
      const node = document.createElement("span")
      node.dataset.tone = tone
      document.body.append(node)
      expect(getComputedStyle(node).getPropertyValue("--tone").trim()).toBe(getComputedStyle(document.documentElement).getPropertyValue(token).trim())
      node.remove()
    }
  } finally { css.remove() }
})

for (const styleCase of ["starting", "in_review", "merged", "harness"]) test(`primitive style ${styleCase}`, () => {
  const css = document.createElement("style")
  css.textContent = readFileSync(new URL("../../styles/tokens.css", import.meta.url), "utf8") + readFileSync(new URL("../../styles/views/primitives.css", import.meta.url), "utf8")
  if (styleCase === "harness") css.textContent += readFileSync(new URL("./view-stories.css", import.meta.url), "utf8")
  document.head.append(css)
  const state = document.createElement("span")
  state.className = "mvp-state"
  state.dataset.state = styleCase
  const node = document.createElement("span")
  state.append(node)
  document.body.append(state)
  try {
    node.className = styleCase === "starting" ? "mvp-dot" : styleCase === "harness" ? "view-story" : "mvp-glyph"
    node.dataset.state = styleCase
    if (styleCase === "starting") expect(getComputedStyle(node).animation).toContain("mvp-blink")
    else if (styleCase === "harness") {
      expect(getComputedStyle(node).maxWidth).toBe("900px")
      expect(getComputedStyle(node).boxSizing).toBe("border-box")
      expect(getComputedStyle(node).padding).toBe("24px")
      expect(getComputedStyle(node).margin).toBe("24px auto")
    }
    else expect(getComputedStyle(node).color).toBe(getComputedStyle(document.documentElement).getPropertyValue(styleCase === "merged" ? "--text-faint" : "--text-muted").trim())
  } finally { state.remove(); css.remove() }
})

import { fixtures as setup, personOnlyFixtures } from "@smthrs/rpc/fixtures/Setup"
import { fixtures as settings } from "@smthrs/rpc/fixtures/Settings"
import { SetupView } from "./SetupView"
import { SettingsView } from "./SettingsView"
let root: import("react-dom/client").Root | undefined
function render(element: React.ReactNode) { const host = document.createElement("div"); document.body.append(host); root = createRoot(host); act(() => root!.render(element)); return host }
afterEach(() => { act(() => root?.unmount()); document.body.innerHTML = "" })

for (const [id, story] of Object.entries(setup)) test(`Setup ${id}`, () => {
  const host = render(<SetupView {...story} onAction={() => {}} onView={() => {}} />)
  for (const text of story.expect) expect([host.textContent, ...[...host.querySelectorAll<HTMLInputElement>("input:not([type=password])")].map(input => input.value)].join("\n")).toContain(text)
  expect([...host.querySelectorAll("[data-step]")].map(row => row.getAttribute("data-step"))).toEqual(["address", "app_manifest", "sign_in", "repository", "models", "source", "machine"])
  expect(host.textContent).toContain("Decisions")
  expect(host.querySelector('input[aria-label="AI Gateway key"]')?.getAttribute("type")).toBe("password")
})
for (const [id, story] of Object.entries(settings)) test(`Settings ${id}`, () => {
  const host = render(<SettingsView {...story} onAction={() => {}} onView={() => {}} />)
  for (const text of story.expect) expect([host.textContent, ...[...host.querySelectorAll<HTMLInputElement>("input:not([type=password])")].map(input => input.value)].join("\n")).toContain(text)
  expect(host.textContent).toContain("700 MB")
})
test("Address submits literal bound step and edited fields once", () => {
  const calls: unknown[] = []
  const host = render(<SetupView {...setup.fresh} onAction={(...args) => calls.push(args)} onView={() => { throw new Error("Unexpected view patch") }} />)
  const input = host.querySelector('input[id$="-bind"]') as HTMLInputElement
  act(() => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!; setter.call(input, "0.0.0.0:8080"); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })) })
  act(() => host.querySelector<HTMLButtonElement>('button[data-flow="settings"]')!.click())
  expect(calls).toEqual([["settings", { step: "address", listen: "mac", bind: "0.0.0.0:8080" }]])
})
test("Missing actions omit controls; disabled reason stays visible", () => {
  const host = render(<SetupView {...setup.fresh} actions={[]} onAction={() => { throw new Error("Unexpected dispatch") }} onView={() => {}} />)
  expect(host.querySelector("button")).toBeNull()
  act(() => root!.render(<SetupView {...setup.fresh} actions={[{ tag: "settings", label: "Save address", disabled: { reason: "Address unavailable" } }]} onAction={() => { throw new Error("Unexpected dispatch") }} onView={() => {}} />))
  expect(host.textContent).toContain("Address unavailable")
  expect(host.querySelector<HTMLButtonElement>("button")!.disabled).toBe(true)
})
test("Blocked repository links to the supplied fix; capacity explains limit", () => {
  const host = render(<SetupView {...setup.squash_blocked} onAction={() => {}} onView={() => {}} />)
  expect(host.querySelector("a")!.href).toBe("https://github.com/smithersai/smithers/settings")
  act(() => root!.render(<SetupView {...setup.no_capacity} onAction={() => {}} onView={() => {}} />))
  expect(host.textContent).toContain("No machine fits · memory · Close apps to free 6 GB")
})
test("Model keys stay masked and submit only supplied fields", () => {
  const calls: unknown[] = []
  const host = render(<SetupView {...setup.models_validating} onAction={(...args) => calls.push(args)} onView={() => {}} />)
  const input = host.querySelector('input[id$="-jev"]') as HTMLInputElement
  expect(input.type).toBe("password")
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "private-key"); input.dispatchEvent(new Event("input", { bubbles: true })) })
  act(() => host.querySelector<HTMLButtonElement>('button[data-flow="settings"]')!.click())
  expect(calls).toEqual([["settings", { step: "models", fast: "", coding: "", jev: "private-key" }]])
  expect(host.textContent).not.toContain("private-key")
})
test("Machines stepper dispatches the supplied field and string values", () => {
  const calls: unknown[] = []
  const host = render(<SettingsView {...settings.ready} onAction={(...args) => calls.push(args)} onView={() => {}} />)
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="More Machines"]')!.click())
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Fewer Machines"]')!.click())
  expect(calls).toEqual([["settings", { field: "capacity", value: "3" }], ["settings", { field: "capacity", value: "1" }]])
})
test("Settings shows literal sync health and Obsidian receipts", () => {
  const host = render(<SettingsView {...settings.obsidian} onAction={() => {}} onView={() => {}} />)
  expect(host.textContent).toContain("2026-10-02T17:40:00.000Z")
  expect(host.textContent).toContain("GitHub rate budget · 4812/5000")
  expect(host.textContent).toContain("Disk free · 412 GB")
  expect(host.textContent).toContain("Process · ok")
})
test("Owner action forms retain literal order and model arguments", () => {
  const calls: unknown[] = []
  const host = render(<SettingsView {...settings.ready} onAction={(...args) => calls.push(args)} onView={() => {}} />)
  expect([...host.querySelectorAll('.setup-action')].map(form => form.getAttribute('data-flow'))).toEqual(['settings.model.set', 'settings.model.set', 'settings.model.set', 'settings', 'settings', 'github', 'settings'])
  for (const button of host.querySelectorAll<HTMLButtonElement>('.setup-action button[type="submit"]')) act(() => button.click())
  expect(calls).toEqual([
    ['settings.model.set', { role: 'fast', model: 'llama-4-scout' }],
    ['settings.model.set', { role: 'coding', model: 'gpt-6.1-sol' }],
    ['settings.model.set', { role: 'jev', model: 'typesafe-ai/jev' }],
    ['github', {}],
    ['settings', { field: 'obsidian', path: '' }]
  ])
})

test("Failed address keeps the live bind and shows the attempted bind and reason", () => {
  const host = render(<SettingsView {...settings.address_failed} onAction={() => {}} onView={() => {}} />)
  const failed = settings.address_failed.model.address.failed!
  expect(host.textContent).toContain(settings.address_failed.model.address.bind)
  const row = host.querySelector(".setup-settings dd")!
  expect(row.textContent).toContain("In effect: 0.0.0.0:8080")
  expect(row.querySelector<HTMLInputElement>('input[id$="-bind"]')?.value).toBe("0.0.0.0:9090")
  expect(row.querySelector('button[type="submit"]')?.textContent).toBe("Retry")
  expect([...host.querySelectorAll("dt")].map(dt => dt.textContent)).not.toContain("Address")
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(failed.reason.message)
})

test("Rejected key retry submits a write-only secret; agent projection has no retry input", () => {
  const calls: unknown[] = []
  const host = render(<SetupView {...setup.models_failed} onAction={(...args) => calls.push(args)} onView={() => {}} />)
  const input = host.querySelector<HTMLInputElement>('input[id$="-key"]')!
  expect(input.type).toBe("password")
  expect(input.value).toBe("")
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "replacement-key")
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  act(() => host.querySelector<HTMLFormElement>('form[data-flow="settings.model-key"]')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
  expect(calls).toEqual([["settings.model-key", { role: "jev", provider: "AI Gateway", key: "replacement-key" }]])
  expect(host.textContent).not.toContain("replacement-key")
  act(() => root!.render(<SetupView {...personOnlyFixtures.models_failed_agent} onAction={() => {}} onView={() => {}} />))
  expect(host.querySelector('input[id$="-key"]')).toBeNull()
})

test("No-capacity fix dispatches its supplied tag and arguments", () => {
  const calls: unknown[] = []
  const host = render(<SetupView {...setup.no_capacity} onAction={(...args) => calls.push(args)} onView={() => {}} />)
  act(() => host.querySelector<HTMLButtonElement>(".setup-capacity button")!.click())
  const fix = setup.no_capacity.model.this_mac.limit!.fix
  expect(calls).toEqual([[fix.tag, fix.args ?? {}]])
})

test("Settings actions live in their rows and unassigned actions retain order", () => {
  const host = render(<SettingsView {...settings.ready} actions={[...settings.ready.actions, { tag: "flows", label: "Add" }, { tag: "docs", label: "Docs" }]} onAction={() => {}} onView={() => {}} />)
  const row = (label: string) => [...host.querySelectorAll("dt")].find(dt => dt.textContent === label)!.nextElementSibling!
  expect(row("Machines").textContent).toBe("−2+")
  expect(row("TODOs per day").textContent).toBe("−12+")
  expect(row("Decisions").textContent).toBe("AI GatewaySavedChange")
  expect(row("Health").querySelector('button[data-flow="github"]')!.textContent).toBe("Repair")
  expect(row("Obsidian folder").querySelector("button")!.textContent).toBe("Change")
  expect([...host.querySelectorAll(".setup-view > .setup-actions button")].map(button => button.textContent)).toEqual(["Add", "Docs"])
})
