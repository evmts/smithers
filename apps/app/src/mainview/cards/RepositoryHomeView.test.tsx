import { afterEach, expect, test } from "bun:test"
import { act } from "react"
import { createRoot } from "./views/testDom"
import { RepositoryHomeView } from "./RepositoryHomeView"
import type { RepositoryHomeAnswer } from "./RepositoryHomeView"
import { RepositoryHomeSchema } from "@smthrs/rpc/RepositoryHome"
import type { MythicalStack } from "@smthrs/rpc/Mythical"
import { MythicalStackSchema } from "@smthrs/rpc/Mythical"
import { ControllerContext } from "../ControllerContext"
import type { AppController } from "../state/AppController"
import type { RepositorySnapshot } from "../state/seams/RepositoryHistorySeam"

/*
 * A repository's own default view at `/owner/repo` (M-45, §6.14, #4025).
 * The declaration is the existing `RepositoryHome` one — there is no second
 * mechanism — and it is DATA: nothing a repository writes executes here, no
 * flow runs because the page opened, and a declaration that is absent,
 * unreadable or failed leaves the file tree as the view.
 */

const mounted: Array<() => void> = []
afterEach(() => { while (mounted.length > 0) mounted.pop()?.() })

const COPY = "shared:ada/widgets"

const render = (home: RepositoryHomeAnswer | undefined, treeCopyId: string | null = COPY) => {
  const calls: Array<[string, string | undefined]> = []
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<RepositoryHomeView repo="ada/widgets" home={home} treeCopyId={treeCopyId ?? undefined}
    onRunCommand={(name, args) => { calls.push([name, args]) }} />))
  mounted.push(() => { act(() => root.unmount()); host.remove() })
  return { host, calls }
}

test("a declared homepage replaces the tree, and the tree is one press away", () => {
  const home = RepositoryHomeSchema.parse({
    kind: "blocks",
    blocks: [
      { type: "text", title: "Widgets", text: "The widget factory." },
      { type: "markdown", path: "docs/start.md", markdown: "# Start\n\nRun the flow." },
      { type: "links", title: "Docs", links: [{ label: "Guide", url: "https://example.com/guide" }] },
      { type: "app", flow: "review", title: "Review", picture: "review" }
    ]
  })
  const { host, calls } = render(home)
  const view = host.querySelector<HTMLElement>("[data-testid=repository-home]")!
  expect(view.dataset.home).toBe("blocks")
  expect(view.textContent).toContain("The widget factory.")
  expect(view.querySelector(".sui-md-h1")!.textContent).toBe("Start")
  expect(view.querySelector<HTMLAnchorElement>('a[href="https://example.com/guide"]')!.textContent).toBe("Guide")
  // Opening the page ran nothing at all.
  expect(calls).toEqual([])
  const files = view.querySelector<HTMLButtonElement>(".repository-home-files")!
  expect(files.textContent).toBe("Files")
  files.click()
  expect(calls).toEqual([["files", JSON.stringify({ operation: "tree", copy: COPY })]])
})

test("a declared flow is an offer, never a launch: it runs only when the person presses it", () => {
  const home = RepositoryHomeSchema.parse({ kind: "blocks", blocks: [{ type: "app", flow: "review", title: "Review", picture: "review" }] })
  const { host, calls } = render(home)
  expect(calls).toEqual([])
  const app = host.querySelector<HTMLButtonElement>('[data-flow="review"]')!
  app.click()
  // The registry owns the run: its actor, role and confirmation are untouched here.
  expect(calls).toEqual([["review", undefined]])
})

test("a README homepage renders as the repository's view", () => {
  const { host } = render(RepositoryHomeSchema.parse({ kind: "readme", markdown: "# Widgets" }))
  const view = host.querySelector<HTMLElement>("[data-testid=repository-home]")!
  expect(view.dataset.home).toBe("readme")
  expect(view.querySelector(".sui-md-h1")!.textContent).toBe("Widgets")
})

test("a failed declaration falls back to the tree with an honest notice, never a blank frame", () => {
  const { host } = render({ kind: "error", message: "Homepage unavailable" })
  const view = host.querySelector<HTMLElement>("[data-testid=repository-home]")!
  expect(view.dataset.home).toBe("error")
  expect(view.textContent).toContain("Homepage unavailable. Showing ada/widgets's files instead.")
  expect(view.querySelector(".repository-home-files")).not.toBeNull()
})

test("a declaration that is absent, or still loading, leaves the tree as the view", () => {
  for (const home of [undefined, RepositoryHomeSchema.parse({ kind: "none" })]) {
    const { host } = render(home)
    expect(host.querySelector("[data-testid=repository-home]")).toBeNull()
  }
})

test("a repository cannot run code, forge authority or smuggle a link scheme through its homepage", () => {
  // The schema refuses a non-http link before any render.
  expect(RepositoryHomeSchema.safeParse({ kind: "blocks", blocks: [{ type: "links", links: [{ label: "x", url: "javascript:alert(1)" }] }] }).success).toBe(false)
  const home = RepositoryHomeSchema.parse({
    kind: "blocks",
    blocks: [{ type: "markdown", path: "README.md", markdown: "<script>window.__owned = 1</script>\n\n[x](javascript:alert(1))" }]
  })
  const { host } = render(home)
  expect(host.querySelector("script")).toBeNull()
  expect((globalThis as { __owned?: number }).__owned).toBeUndefined()
  for (const link of host.querySelectorAll("a")) expect(link.getAttribute("href") ?? "").not.toContain("javascript:")
})

test("with no copy to read there is no Files act claiming a tree this page cannot open", () => {
  const { host } = render(RepositoryHomeSchema.parse({ kind: "readme", markdown: "# Widgets" }), null)
  expect(host.querySelector<HTMLElement>("[data-testid=repository-home] .repository-home-files")).toBeNull()
})

for (const mixed of [false, true]) {
  for (const copy of [COPY, null]) {
    test(`a ${mixed ? "mixed" : "stack-only"} homepage keeps the unavailable stack visible (${copy === null ? "no copy" : "copy"})`, () => {
      const home = RepositoryHomeSchema.parse({ kind: "blocks", blocks: [
        ...(mixed ? [{ type: "text", text: "Project overview" }] : []),
        { type: "stack", title: "Project work" }
      ] })
      const { host, calls } = render(home, copy)
      const view = host.querySelector<HTMLElement>("[data-testid=repository-home]")
      expect(view).not.toBeNull()
      expect(view!.textContent).toContain("Project work")
      expect(view!.querySelector('[role="status"]')?.textContent).toBe("Stack unavailable")
      if (mixed) expect(view!.textContent).toContain("Project overview")
      expect(calls).toEqual([])
      const files = view!.querySelector<HTMLButtonElement>(".repository-home-files")
      if (copy === null) expect(files).toBeNull()
      else {
        expect(files).not.toBeNull()
        files!.click()
        expect(calls).toEqual([["files", JSON.stringify({ operation: "tree", copy })]])
      }
    })
  }
}

/*
 * The declared `stack` block against the repository's OWN live read model
 * (#4085): `RepositoryHistorySeam.watchRepository` already keeps that
 * snapshot live for exactly this declaration, so a served snapshot renders
 * through the shared `@smthrs/rpc/StackView` projections and the shipped
 * StatusPill. No snapshot, a refused read, an absent stack or an empty one
 * each say so in one line, and Files stays below either way. Nothing here
 * runs a command, admits a model or writes.
 */

const STACK: MythicalStack = MythicalStackSchema.parse({
  repository: "ada/widgets",
  state: "active",
  generation: 7,
  mainBehind: false,
  limits: { maxParallel: 2 },
  lanes: [{ index: 0, state: "busy", itemId: "i1" }, { index: 1, state: "idle" }],
  changes: [
    { changeId: "c1", commitId: "0".repeat(40), title: "Widget sizes", kind: "item", state: "landed", itemId: "i9" },
    { changeId: "c2", commitId: "1".repeat(40), title: "Widget colours", kind: "item", state: "pending", itemId: "i2" }
  ],
  items: [
    { id: "i1", state: "running", attempt: 1, lane: 0, runs: {}, dependsOn: [], updatedAt: "2026-10-16T10:00:00Z",
      issue: { number: 12, title: "Resize widgets", url: "https://github.com/ada/widgets/issues/12" } },
    { id: "i2", state: "retrying", attempt: 2, runs: {}, dependsOn: [], updatedAt: "2026-10-16T10:00:00Z", reason: "main moved",
      issue: { number: 13, title: "Recolour widgets", url: "https://github.com/ada/widgets/issues/13" } },
    { id: "i3", state: "queued", attempt: 0, runs: {}, dependsOn: [], updatedAt: "2026-10-16T10:00:00Z",
      issue: { number: 14, title: "Pack widgets", url: "https://github.com/ada/widgets/issues/14" } }
  ]
})

/** The seam's snapshot store, as the controller exposes it, for one repository. */
const withSnapshot = (snapshot: RepositorySnapshot | undefined, blocks: ReadonlyArray<unknown> = [{ type: "stack", title: "Project work" }]) => {
  const calls: Array<[string, string | undefined]> = []
  const controller = {
    repositorySnapshots: { get: (repo: string) => repo === "ada/widgets" ? snapshot : undefined, subscribe: () => () => {} }
  } as unknown as AppController
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const home = RepositoryHomeSchema.parse({ kind: "blocks", blocks })
  act(() => root.render(<ControllerContext value={controller}>
    <RepositoryHomeView repo="ada/widgets" home={home} treeCopyId={COPY}
      onRunCommand={(name, args) => { calls.push([name, args]) }} />
  </ControllerContext>))
  mounted.push(() => { act(() => root.unmount()); host.remove() })
  return { host, calls, stack: host.querySelector<HTMLElement>('[data-testid="repository-home-stack"]')! }
}

test("a served stack renders the repository's own live work, not a fallback", () => {
  const { host, calls, stack } = withSnapshot({ stack: STACK, error: null })
  expect(stack.dataset.stack).toBe("served")
  expect(stack.textContent).toContain("Project work")
  // The shared counts projection, in the owner's words.
  expect(stack.querySelector('[data-testid="repository-home-stack-counts"]')!.textContent)
    .toBe("1 of 2 lanes working · 1 queued · 0 to decide · 2 changes, 1 landed")
  // The shared row projection: the issue's title and the shipped status pill's label.
  // The shared row projection: work not on the stack yet, then the stack's own changes.
  const rows = [...stack.querySelectorAll(".repository-home-stack-row")]
  expect(rows.map(row => row.querySelector(".repository-home-stack-title")!.textContent))
    .toEqual(["#12 Resize widgets", "#14 Pack widgets", "Widget sizes", "Widget colours"])
  expect(rows.map(row => row.querySelector("[data-status]")!.textContent)).toEqual(["implementing", "queued", "landed", "pending"])
  // A change carries its own item's reason, so a retry is not silent.
  expect(rows[3]!.querySelector(".repository-home-stack-reason")!.textContent).toBe("main moved")
  // No fallback line where the stack is actually served, and nothing ran.
  expect(stack.querySelector('[role="status"]')).toBeNull()
  expect(calls).toEqual([])
  expect(host.querySelector(".repository-home-files")).not.toBeNull()
})

test("a mixed homepage keeps its other blocks beside the served stack", () => {
  const { stack, host } = withSnapshot({ stack: STACK, error: null },
    [{ type: "text", text: "Project overview" }, { type: "stack", title: "Project work" }])
  expect(host.querySelector('[data-testid="repository-home"]')!.textContent).toContain("Project overview")
  expect(stack.dataset.stack).toBe("served")
  expect(stack.textContent).toContain("#12 Resize widgets")
})

test("a refused stack read says the seam's own refusal, and Files is still there", () => {
  const { host, calls, stack } = withSnapshot({ stack: null, error: "Stack access refused" })
  expect(stack.dataset.stack).toBe("refused")
  expect(stack.querySelector('[role="status"]')!.textContent).toBe("Stack access refused")
  expect(stack.querySelector('[data-testid="repository-home-stack-counts"]')).toBeNull()
  expect(calls).toEqual([])
  expect(host.querySelector(".repository-home-files")).not.toBeNull()
})

test("an absent stack and an empty one are each honest, never an invented count", () => {
  const absent = withSnapshot({ stack: MythicalStackSchema.parse({ ...STACK, state: "absent", reason: "No mythical bookmark yet", changes: [], items: [] }), error: null })
  expect(absent.stack.dataset.stack).toBe("absent")
  expect(absent.stack.querySelector('[role="status"]')!.textContent).toBe("No mythical bookmark yet")
  expect(absent.stack.querySelector('[data-testid="repository-home-stack-counts"]')).toBeNull()

  const empty = withSnapshot({ stack: MythicalStackSchema.parse({ ...STACK, changes: [], items: [] }), error: null })
  expect(empty.stack.dataset.stack).toBe("served")
  expect(empty.stack.querySelector('[data-testid="repository-home-stack-counts"]')!.textContent)
    .toBe("0 of 2 lanes working · 0 queued · 0 to decide · 0 changes, 0 landed")
  expect(empty.stack.querySelector('[role="status"]')!.textContent).toBe("Nothing on the stack right now.")
  expect(empty.host.querySelector(".repository-home-files")).not.toBeNull()
})

test("outside a controller the stack block is the honest fallback, never a blank frame", () => {
  const { host } = render(RepositoryHomeSchema.parse({ kind: "blocks", blocks: [{ type: "stack", title: "Project work" }] }))
  const stack = host.querySelector<HTMLElement>('[data-testid="repository-home-stack"]')!
  expect(stack.dataset.stack).toBe("unavailable")
  expect(stack.querySelector('[role="status"]')!.textContent).toBe("Stack unavailable")
})

test("a last-good stack beside a failed read is never shown as live work", () => {
  // The seam's readFailed publishes BOTH the previous stack and the error.
  const { host, stack } = withSnapshot({ stack: STACK, error: "Smithers Cloud could not read the stack (HTTP 500)." })
  expect(stack.dataset.stack).toBe("refused")
  expect(stack.querySelector('[role="status"]')!.textContent).toBe("Smithers Cloud could not read the stack (HTTP 500).")
  // None of the stale work is on screen, as work or as counts.
  expect(stack.querySelector('[data-testid="repository-home-stack-counts"]')).toBeNull()
  expect(stack.querySelectorAll(".repository-home-stack-row")).toHaveLength(0)
  expect(stack.textContent).not.toContain("#12 Resize widgets")
  expect(host.querySelector(".repository-home-files")).not.toBeNull()
})

test("another repository's snapshot is not this repository's stack", () => {
  // The hook asks for the route's own repository; the seam keys its values by repository.
  const controller = {
    repositorySnapshots: { get: (repo: string) => repo === "bob/other" ? { stack: STACK, error: null } : undefined, subscribe: () => () => {} }
  } as unknown as AppController
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<ControllerContext value={controller}>
    <RepositoryHomeView repo="ada/widgets" home={RepositoryHomeSchema.parse({ kind: "blocks", blocks: [{ type: "stack", title: "Project work" }] })}
      treeCopyId={COPY} onRunCommand={() => {}} />
  </ControllerContext>))
  mounted.push(() => { act(() => root.unmount()); host.remove() })
  const stack = host.querySelector<HTMLElement>('[data-testid="repository-home-stack"]')!
  expect(stack.dataset.stack).toBe("unavailable")
  expect(stack.textContent).not.toContain("#12 Resize widgets")
  expect(host.querySelector(".repository-home-files")).not.toBeNull()
})
