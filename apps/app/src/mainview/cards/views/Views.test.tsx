import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { Glob } from "bun"
import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { readFileSync } from "node:fs"
import { fixtures } from "@smthrs/rpc/fixtures/Draft"
import type { DraftViewProps } from "@smthrs/rpc/DraftCard"
import { DraftView } from "./DraftView"
import type { StoryModule, ViewStory } from "./stories"

GlobalRegistrator.register()
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
          } else expect(host.textContent + [...host.querySelectorAll<HTMLInputElement>("input,textarea")].map(node => node.value).join(" ")).toContain(text)
        }
        const interactions = story.interactions ?? []
        const gestureControls = new Set(interactions.map(item => host.querySelector(item.selector)))
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
            if (!interaction.event || interaction.event === "click") control!.click()
            else control!.dispatchEvent(interaction.event === "keydown"
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
        try { expect([...removed.host.querySelectorAll<HTMLElement>("[data-flow]")].filter(control => !(story.interactions ?? []).some(item => control.matches(item.selector))).map(control => control.dataset.flow)).toEqual(story.actions.slice(1).map(action => action.tag)) }
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
    else if (styleCase === "harness") expect(getComputedStyle(node).maxWidth).not.toBe("900px")
    else expect(getComputedStyle(node).color).toBe(getComputedStyle(document.documentElement).getPropertyValue(styleCase === "merged" ? "--text-faint" : "--text-muted").trim())
  } finally { state.remove(); css.remove() }
})

let root: Root
const calls: unknown[] = []
function render(props: Partial<DraftViewProps> = {}) {
  const host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<DraftView {...fixtures.append} onAction={(...args) => calls.push(args)} onView={() => { throw new Error("Unexpected view patch") }} {...props} />))
  return host
}
afterEach(() => { act(() => root?.unmount()); document.body.innerHTML = ""; calls.length = 0 })
const blur = (element: HTMLElement) => act(() => element.dispatchEvent(new FocusEvent("focusout", { bubbles: true })))
const change = (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) => act(() => {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value)
  element.dispatchEvent(new Event("input", { bubbles: true }))
  element.dispatchEvent(new Event("change", { bubbles: true }))
})
const press = (element: HTMLElement) => act(() => element.click())

for (const [name, fixture] of Object.entries(fixtures)) {
  test(`Draft fixture ${name} renders`, () => {
    const host = render(fixture)
    for (const expected of fixture.expect) {
      const contents = host.textContent + Array.from(host.querySelectorAll("input,textarea")).map(element => (element as HTMLInputElement).value).join(" ")
      expect(contents).toContain(expected)
    }
    expect(host.querySelector(".draft-private") !== null).toBe(!fixture.model.committed && fixture.model.private)
  })
}
test("DraftView submits fields and renders private and committed drafts", () => {
  const host = render({ model: { ...fixtures.issue_fixes.model, place: { mode: "append", options: [{ n: 12, title: "Keep edits", state: "queued" }] } } })
  expect(host.querySelector(".draft-private")!.textContent).toBe("Only you")
  const title = host.querySelector<HTMLInputElement>(".draft-field input")!
  change(title, "  Literal title  "); blur(title)
  const [prompt, acceptance] = host.querySelectorAll<HTMLTextAreaElement>("textarea")
  change(prompt!, "Literal\nprompt"); blur(prompt!)
  change(acceptance!, "passes checks\nkeeps edits"); blur(acceptance!)
  const place = host.querySelector("select")!
  change(place, '{"mode":"before","n":12}'); blur(place)
  change(place, '{"mode":"amend","n":12}'); blur(place)
  change(place, '{"mode":"append"}'); blur(place)
  const fixes = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  press(fixes); blur(fixes)
  press(fixes); blur(fixes)
  expect(calls).toEqual([
    ["form.set", { entry: "entry-draft-1", field: "title", value: "  Literal title  " }],
    ["form.set", { entry: "entry-draft-1", field: "prompt", value: "Literal\nprompt" }],
    ["form.set", { entry: "entry-draft-1", field: "acceptance", value: '["passes checks","keeps edits"]' }],
    ["form.set", { entry: "entry-draft-1", field: "place", value: '{"mode":"before","n":12}' }],
    ["form.set", { entry: "entry-draft-1", field: "place", value: '{"mode":"amend","n":12}' }],
    ["form.set", { entry: "entry-draft-1", field: "fixes", value: "false" }]
  ])
  act(() => root.render(<DraftView {...fixtures.committed} onAction={(...args) => calls.push(args)} onView={() => {}} />))
  expect(host.textContent).toContain("Committed as T12")
  expect(host.querySelector(".draft-private")).toBeNull()
})
test("Commit forwards full supplied input once; Discard only deletes Draft", () => {
  const host = render({ actions: [
    { tag: "todo.new", label: "Commit", primary: true, args: { title: "Keep edits", prompt: "Implement", acceptance: '["passes"]', place: '{"mode":"append"}', issue: "42", fixes: "true", seed: '["a.ts"]' } },
    { tag: "draft.discard", label: "Discard", args: { draft: "entry-draft-1" } }
  ] })
  press(host.querySelector('[data-flow="todo.new"]')!)
  press(host.querySelector('[data-flow="draft.discard"]')!)
  expect(calls).toEqual([
    ["todo.new", { title: "Keep edits", prompt: "Implement", acceptance: '["passes"]', place: '{"mode":"append"}', issue: "42", fixes: "true", seed: '["a.ts"]' }],
    ["draft.discard", { draft: "entry-draft-1" }]
  ])
  expect(Array.from(host.querySelectorAll("button")).map(button => button.dataset.flow)).toEqual(["todo.new", "draft.discard"])
})
test("missing Commit and gesture create no authority", () => {
  const host = render({ actions: [{ tag: "draft.discard", label: "Discard", args: { draft: "entry-draft-1" } }], gestures: {} })
  expect(host.querySelector('[data-flow="todo.new"]')).toBeNull()
  expect(host.querySelector("input")!.readOnly).toBe(true)
  blur(host.querySelector("input")!)
  expect(calls).toEqual([])
})
test("disabled actions and gestures show reasons and never dispatch", () => {
  const host = render({ ...fixtures.empty_stack, gestures: { set: { tag: "form.set", label: "Edit", disabled: { reason: "Draft is read-only" } } } })
  expect(host.textContent).toContain("Add a title")
  expect(host.textContent).toContain("Draft is read-only")
  press(host.querySelector('[data-flow="todo.new"]')!)
  blur(host.querySelector("input")!)
  expect(calls).toEqual([])
})
test("committed amendment has +1 and seed remains data only", () => {
  const host = render(fixtures.committed_amendment)
  expect(host.textContent).toContain("Committed as T9")
  expect(host.textContent).toContain("+1")
  expect(host.querySelector("input")).toBeNull()
  act(() => root.render(<DraftView {...fixtures.seed} onAction={(...args) => calls.push(args)} onView={() => {}} />))
  expect(host.querySelector(".draft-seed")!.textContent).toContain("Read-only")
  expect(host.querySelectorAll(".draft-seed button").length).toBe(0)
  expect(calls).toEqual([])
})

test("empty acceptance clears; amendment forwards its bound item", () => {
  const host = render(fixtures.amend)
  const acceptance = host.querySelectorAll<HTMLTextAreaElement>("textarea")[1]!
  change(acceptance, ""); blur(acceptance)
  press(host.querySelector('[data-flow="todo.amend"]')!)
  expect(calls).toEqual([
    ["form.set", { entry: "entry-draft-1", field: "acceptance", value: "[]" }],
    ["todo.amend", { n: "9" }]
  ])
})
test("hostile seed text is literal, with no executable surface", () => {
  const host = render({ model: { ...fixtures.seed.model, seed: { files: ['<script>alert("seed")</script>'] } } })
  expect(host.querySelector(".draft-seed")!.textContent).toContain('<script>alert("seed")</script>')
  expect(host.querySelector("script")).toBeNull()
})

test("unavailable placement stays selected and focus/blur never appends", () => {
  for (const mode of ["before", "amend"] as const) {
    const host = render({ model: { ...fixtures.append.model, place: { mode, n: 99, options: [] } } })
    const select = host.querySelector("select")!
    expect(select.selectedOptions[0]!.textContent).toBe(`${mode === "before" ? "Before" : "Amend"} T99 (unavailable)`)
    expect(select.value).toBe(JSON.stringify({ mode, n: 99 }))
    act(() => select.focus()); blur(select)
    expect(calls).toEqual([])
    act(() => root.unmount()); host.remove(); root = undefined!
  }
})
test("checkbox and select dispatch once on change without focus or blur", () => {
  const host = render(fixtures.issue_fixes)
  const fixes = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  const initial = fixes.checked
  press(fixes)
  expect(calls).toEqual([["form.set", { entry: "entry-draft-1", field: "fixes", value: String(!initial) }]])
  blur(fixes)
  expect(calls.length).toBe(1)
  change(host.querySelector("select")!, '{"mode":"append"}')
  expect(calls.length).toBe(1)
})
test("Commit has no unsupported Enter hint", () => {
  const host = render()
  expect(host.querySelector('[data-flow="todo.new"]')!.textContent).toBe("Commit")
})
test("committed receipt has no unsupported link hint", () => {
  const host = render(fixtures.committed)
  expect(host.querySelector(".draft-receipt")!.textContent).not.toContain("↗")
})

test("agent model updates resync every field and unchanged blur never dispatches", () => {
  const host = render(fixtures.issue_fixes)
  change(host.querySelector("input")!, "Unsent title")
  const model = { ...fixtures.issue_fixes.model, title: "Agent title", prompt: "Agent prompt", acceptance: ["Agent acceptance"], place: { mode: "before" as const, n: 9, options: fixtures.issue_fixes.model.place.options }, issue: { ...fixtures.issue_fixes.model.issue!, fixes: false } }
  act(() => root.render(<DraftView {...fixtures.issue_fixes} model={model} onAction={(...args) => calls.push(args)} onView={() => {}} />))
  const title = host.querySelector("input")!
  expect(title.value).toBe("Agent title"); blur(title)
  const areas = host.querySelectorAll("textarea")
  expect(areas[0]!.value).toBe("Agent prompt"); blur(areas[0]!)
  expect(areas[1]!.value).toBe("Agent acceptance"); blur(areas[1]!)
  expect(host.querySelector("select")!.value).toBe('{"mode":"before","n":9}')
  change(host.querySelector("select")!, '{"mode":"before","n":9}')
  expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false)
  expect(calls).toEqual([])
})
test("issue arrow requires the model GitHub href", () => {
  const host = render(fixtures.issue_fixes)
  const issue = host.querySelector(".draft-issue")!
  expect(issue.getAttribute("href")).toBe(fixtures.issue_fixes.model.issue!.url!)
  expect(issue.textContent).toContain("↗")
  act(() => root.render(<DraftView {...fixtures.issue_fixes} model={{ ...fixtures.issue_fixes.model, issue: { ...fixtures.issue_fixes.model.issue!, url: undefined as unknown as string } }} onAction={() => {}} onView={() => {}} />))
  expect(host.querySelector(".draft-issue")!.textContent).not.toContain("↗")
})

test("one model field update preserves other unsubmitted edits", () => {
  const host = render(fixtures.append)
  const prompt = host.querySelector("textarea")!
  change(prompt, "Human prompt")
  act(() => root.render(<DraftView {...fixtures.append} model={{ ...fixtures.append.model, title: "Agent title" }} onAction={(...args) => calls.push(args)} onView={() => {}} />))
  expect(host.querySelector("input")!.value).toBe("Agent title")
  expect(prompt.value).toBe("Human prompt")
  blur(host.querySelector("input")!); blur(prompt)
  expect(calls).toEqual([["form.set", { entry: "entry-draft-1", field: "prompt", value: "Human prompt" }]])
})

test("unchanged acceptance is silent for empty entries and embedded newlines", () => {
  const host = render()
  for (const acceptance of [[], [""], ["First\nSecond"]]) {
    act(() => root.render(<DraftView {...fixtures.append} model={{ ...fixtures.append.model, acceptance }} onAction={(...args) => calls.push(args)} onView={() => {}} />))
    const field = host.querySelectorAll("textarea")[1]!
    expect(field.value).toBe(acceptance.join("\n")); blur(field)
    expect(calls).toEqual([])
  }
})
