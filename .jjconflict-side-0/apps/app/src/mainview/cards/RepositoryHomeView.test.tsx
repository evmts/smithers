import { afterEach, expect, test } from "bun:test"
import { act } from "react"
import { createRoot } from "./views/testDom"
import { RepositoryHomeView } from "./RepositoryHomeView"
import type { RepositoryHomeAnswer } from "./RepositoryHomeView"
import { RepositoryHomeSchema } from "@smthrs/rpc/RepositoryHome"

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
