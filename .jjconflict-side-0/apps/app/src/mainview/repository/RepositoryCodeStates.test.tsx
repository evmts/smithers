import { createRoot } from "../cards/views/testDom"
import { act } from "react"
import { afterEach, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { smithersUiCss } from "@smthrs/ui"
import { CodeHome } from "./CodeHome"
import { RepositoryCodeView } from "./RepositoryCodeView"
import { codeReadKey, repositoryCodeReads, setCodeRead } from "./RepositoryCodeRead"

/*
 * Design's live review of .17/.18/.20 (2026-10-19), against the stage 1 mock:
 * a missing file says so (views/code/Tree.tsx CodeNotFound) instead of failing,
 * a real failure keeps its sentence with Details as a disclosure, Copy
 * permalink is a 14px/500 repo button with a link icon, and README links read
 * as links (ui/ui.css:77).
 */

// The view reads its route from the address, so the page needs a real origin.
;(window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL("https://smithers.test/")
const repo = "ada/widgets"
const commit = "a".repeat(40)
const sheets = ["../styles/tokens.css", "ui.css", "frame.css", "repository.css", "code.css", "repository-code.css", "../styles/chat.css"]

afterEach(() => {
  act(() => { for (const row of repositoryCodeReads.values()) repositoryCodeReads.delete(row.id) })
  document.head.querySelectorAll("style[data-test-sheet]").forEach(node => node.remove())
  window.history.replaceState(null, "", "/")
})

/** The app's sheets in their real order, the shared kit last (it is injected after them). */
const styled = (): ReadonlyMap<string, HTMLStyleElement> => new Map([...sheets.map(path => [path, readFileSync(new URL(path, import.meta.url), "utf8")] as const), ["kit", smithersUiCss] as const].map(([name, css]) => {
  const style = document.createElement("style")
  style.dataset.testSheet = ""
  style.textContent = css
  document.head.append(style)
  return [name, style] as const
}))

const mount = async (location: string, state: "ready" | "failed" | "missing", error?: string) => {
  window.history.replaceState(null, "", `/${repo}/blob/${location}`)
  const content = "export const value = 1\n"
  setCodeRead(codeReadKey(repo, "blob", location, "current"), state, error, state === "ready"
    ? { content, size: content.length, binary: false, tooLarge: false, commitSha: commit, rawUrl: `/api/repos/${repo}/contents/x?raw=1` }
    : undefined)
  const host = document.createElement("div"); host.className = "repo-frame"; document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(<RepositoryCodeView onRunCommand={() => true} repo={repo} cards={[]} refs={["main"]} commits={{ main: commit }} admitted requestId="current" onAsk={() => {}} />)
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  return host
}

const color = (host: Element, value: string) => {
  const probe = document.createElement("span"); probe.style.color = value; host.append(probe)
  const computed = getComputedStyle(probe).color; probe.remove()
  return computed
}

test("a 404 says the ref has no such file, offers the parent folder at that ref, and no permalink", async () => {
  const host = await mount("main/src/missing.ts", "missing")
  expect(host.querySelector(".repo-frame-state h2")?.textContent).toBe("No src/missing.ts at main")
  const up = [...host.querySelectorAll("a")].find(link => link.textContent === "Go up a directory")
  expect(up?.getAttribute("href")).toBe(`/${repo}/tree/main/src`)
  expect(up?.className).toBe("repo-ui-btn")
  expect(up?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
  expect([...host.querySelectorAll("button")].map(button => button.textContent)).not.toContain("Copy permalink")
  expect(host.querySelector('[role="alert"]')).toBeNull()
  expect(host.textContent).not.toContain("Couldn’t load this file.")
})

test("a missing file at the repository root goes up to the root folder at the same ref", async () => {
  const host = await mount("main/missing.ts", "missing")
  expect(host.querySelector(".repo-frame-state h2")?.textContent).toBe("No missing.ts at main")
  expect([...host.querySelectorAll("a")].find(link => link.textContent === "Go up a directory")?.getAttribute("href")).toBe(`/${repo}/tree/main`)
})

test("a 500 keeps the failure sentence with its status behind a styled Details disclosure, and no permalink", async () => {
  styled()
  const host = await mount("main/src/broken.ts", "failed", "File read failed (500)")
  const notice = host.querySelector('[role="alert"]')!
  expect(notice.className).toBe("repo-frame-state")
  expect(notice.querySelector("p")?.textContent).toBe("Couldn’t load this file.")
  const summary = notice.querySelector("details > summary")!
  expect(summary.textContent).toBe("Details")
  expect(notice.querySelector(".failure-detail")?.textContent).toBe("File read failed (500)")
  expect(host.textContent).not.toContain("No src/broken.ts")
  expect([...host.querySelectorAll("button")].map(button => button.textContent)).not.toContain("Copy permalink")
  // Muted 13px with its own chevron (`.repo-frame summary` drops the native marker), never a bare body-text line.
  const look = getComputedStyle(summary)
  expect({ display: look.display, fontSize: look.fontSize, color: look.color }).toEqual({ display: "inline-flex", fontSize: "13px", color: color(host, "var(--text-muted)") })
  expect(look.color).not.toBe(color(host, "var(--text)"))
})

test("Copy permalink is the repo button with a link icon, 14px at weight 500", async () => {
  styled()
  const host = await mount("main/src/index.ts", "ready")
  const button = [...host.querySelectorAll("button")].find(node => node.textContent === "Copy permalink")!
  expect([...button.classList]).toEqual(["repo-ui-btn", "repo-ui-btn-primary", "repo-code-permalink"])
  expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
  expect(button.querySelector("svg")?.getAttribute("width")).toBe("14")
  const look = getComputedStyle(button)
  expect({ fontSize: look.fontSize, fontWeight: look.fontWeight, minHeight: look.minHeight }).toEqual({ fontSize: "14px", fontWeight: "500", minHeight: "36px" })
})

/** [ids, classes/attributes/pseudo-classes, elements] of one compound selector list entry; enough for the plain selectors these sheets use. */
const specificity = (selector: string): readonly [number, number, number] => {
  const plain = selector.replace(/::[\w-]+/g, "")
  return [(plain.match(/#[\w-]+/g) ?? []).length, (plain.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g) ?? []).length, (plain.match(/(?:^|[\s>+~])[a-z][\w-]*/gi) ?? []).length]
}
const outranks = (a: readonly [number, number, number], b: readonly [number, number, number]) => a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2]

/*
 * happy-dom resolves `color: inherit` (the frame's `.repo-frame a` reset) by
 * falling through to lower-ranked rules, so a computed color here cannot show
 * the defect; Chrome can (repository-frame.spec.ts asserts the computed brand).
 * This asserts the cascade itself: a repository sheet rule that colors links
 * brand matches the rendered README and home-block links, outranks the frame's
 * reset, and reaches no chat or wiki link.
 */
test("README and home markdown links read as brand links; chat and wiki links keep their own color", async () => {
  const host = document.createElement("div"); host.className = "repo-frame"; document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(<CodeHome repo={repo} onRunCommand={() => false} branch="main"
      home={{ kind: "blocks", blocks: [{ type: "markdown", path: "docs/fixed.md", title: "Fixed by agents", markdown: "- [#4255](https://github.com/ada/widgets/issues/4255) Fix parser" }] }}
      readme={{ state: "ready", name: "README.md", markdown: "Follow the [app quickstart](https://smithers.sh/docs/quickstart/)." }} />)
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  const readme = host.querySelector('[aria-label="README"] a.sui-md-link')!
  const block = host.querySelector(".repo-code-home-block a.sui-md-link")!
  expect(readme.textContent).toBe("app quickstart")
  expect(block.textContent).toBe("#4255")
  host.insertAdjacentHTML("beforeend",
    '<div class="smithers-transcript"><div class="smithers-chat-message" data-role="user"><div class="message-markdown"><a class="sui-md-link">you</a></div></div>'
    + '<div class="smithers-chat-message" data-role="assistant"><div class="message-markdown"><a class="sui-md-link">agent</a></div></div></div>'
    + '<div class="wiki-page"><a class="sui-md-link">wiki</a></div>')
  const chatAndWiki = [...host.querySelectorAll(".smithers-transcript a, .wiki-page a")]
  expect(chatAndWiki).toHaveLength(3)
  const css = ["ui.css", "repository.css", "code-home.css"].map(path => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n").replace(/\/\*[\s\S]*?\*\//g, "")
  const brandSelectors = [...css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)]
    .filter(rule => /(?:^|;)\s*color\s*:\s*var\(--brand\)/.test(rule[2]!))
    .flatMap(rule => rule[1]!.split(",").map(selector => selector.trim()))
    .filter(selector => !/:(?:hover|focus|focus-visible|active)\b/.test(selector))
  const reset = specificity(".repo-frame a")
  for (const link of [readme, block]) {
    const winning = brandSelectors.filter(selector => link.matches(selector) && outranks(specificity(selector), reset))
    expect({ link: link.textContent, winning: winning.length > 0 }).toEqual({ link: link.textContent, winning: true })
  }
  for (const link of chatAndWiki) expect(brandSelectors.filter(selector => selector.includes("repo-") && link.matches(selector))).toEqual([])
})
