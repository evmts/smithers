import { createRoot } from "../cards/views/testDom"
import { act, useContext } from "react"
import { createPortal } from "react-dom"
import { expect, test } from "bun:test"
import { RepoFrame, RepositoryNoticesContext } from "./RepoFrame"

/** What ShellRail does with the context: its filtered stack renders where the frame says, and an action reveals the Ask first. */
function Notices() {
  const hosted = useContext(RepositoryNoticesContext)
  const notice = <div className="notice" data-notice="toast-repository.ready">Loading repository…
    <button type="button" onClick={() => hosted?.reveal()}>Open</button></div>
  return hosted === null ? notice : createPortal(notice, hosted.host)
}

test("a collapsed Ask shows its notices in the frame's notice region; an open Ask keeps them inside", () => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const commands: string[] = []
  act(() => root.render(<RepoFrame repo="ada/widgets" login="ben" onRunCommand={name => { commands.push(name) }} ask={() => <Notices />}>content</RepoFrame>))
  const notice = () => host.querySelector('[data-notice="toast-repository.ready"]')
  try {
    // happy-dom lays out no width, so the frame is narrower than 1440: the Ask starts collapsed.
    expect(host.querySelector(".repo-frame")?.getAttribute("data-ask-open")).toBe("auto")
    expect(notice()?.closest(".repo-ui-toasts")).not.toBeNull()
    expect(notice()?.closest("aside[aria-label=Ask]")).toBeNull()
    expect(host.querySelector(".repo-ui-toasts")?.getAttribute("data-keyboard-pane")).toBe("Notifications")
    act(() => (host.querySelector(".repo-frame-ask-button") as HTMLButtonElement).click())
    expect(commands).toEqual(["chat.open"])
    expect(notice()?.closest("aside[aria-label=Ask]")).not.toBeNull()
    expect(host.querySelector(".repo-ui-toasts")?.childElementCount).toBe(0)
    act(() => (host.querySelector('[aria-label="Close Ask"]') as HTMLButtonElement).click())
    expect(commands).toEqual(["chat.open", "chat.close"])
    expect(notice()?.closest(".repo-ui-toasts")).not.toBeNull()
    // A notice's action reveals the Ask its target lives in.
    act(() => (notice()!.querySelector("button") as HTMLButtonElement).click())
    expect(commands).toEqual(["chat.open", "chat.close", "chat.open"])
    expect(notice()?.closest("aside[aria-label=Ask]")).not.toBeNull()
    act(() => (host.querySelector('[aria-label="Close Ask"]') as HTMLButtonElement).click())
    // The chord from a focused notice opens the Ask instead of reaching the hidden chat.
    act(() => { notice()!.querySelector("button")!.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true })) })
    expect(commands).toEqual(["chat.open", "chat.close", "chat.open", "chat.close", "chat.open"])
    expect(notice()?.closest("aside[aria-label=Ask]")).not.toBeNull()
  } finally {
    act(() => root.unmount())
  }
})

// Signed out, the Ask leads to sign-in, but a notice's reveal is not the Ask button: it never starts sign-in, so the
// notice's own action (a Retry, a sign-in) is the only command that runs (guardian f-m5u7qt).
test("signed out, revealing a notice runs no command and the notice stays in the frame's region", () => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const commands: string[] = []
  act(() => root.render(<RepoFrame repo="sponsor/public" onRunCommand={name => { commands.push(name) }} ask={() => <Notices />}>content</RepoFrame>))
  const notice = () => host.querySelector('[data-notice="toast-repository.ready"]')
  try {
    expect(host.querySelector(".repo-frame")?.getAttribute("data-ask-open")).toBe("false")
    expect(notice()?.closest(".repo-ui-toasts")).not.toBeNull()
    act(() => (notice()!.querySelector("button") as HTMLButtonElement).click())
    expect(commands).toEqual([])
    expect(host.querySelector(".repo-frame")?.getAttribute("data-ask-open")).toBe("false")
    expect(notice()?.closest(".repo-ui-toasts")).not.toBeNull()
    // The Ask button itself still leads to sign-in.
    act(() => (host.querySelector(".repo-frame-ask-button") as HTMLButtonElement).click())
    expect(commands).toEqual(["sign-in"])
  } finally {
    act(() => root.unmount())
  }
})

test("tabs follow Monday's order: Flows for everyone, Settings for members only, each current on its own routes", () => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const tabs = () => [...host.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Repository"] a')].map(tab => [tab.textContent, tab.getAttribute("href"), tab.getAttribute("aria-current")])
  const at = (path: string) => (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(`https://smithers.sh${path}`)
  const before = window.location.href
  try {
    at("/ada/widgets/flows/review")
    act(() => root.render(<RepoFrame repo="ada/widgets" onRunCommand={() => {}} ask={null}>content</RepoFrame>))
    expect(tabs()).toEqual([["Code", "/ada/widgets", null], ["Issues", "/ada/widgets/issues", null], ["Pull requests", "/ada/widgets/pulls", null], ["Flows", "/ada/widgets/flows", "page"]])
    at("/ada/widgets/settings/sync")
    act(() => root.render(<RepoFrame repo="ada/widgets" login="ben" member onRunCommand={() => {}} ask={null}>content</RepoFrame>))
    expect(tabs().map(([label, , current]) => [label, current])).toEqual([["Code", null], ["Issues", null], ["Pull requests", null], ["Flows", null], ["Settings", "page"]])
    act(() => root.render(<RepoFrame repo="ada/widgets" login="ben" onRunCommand={() => {}} ask={null}>content</RepoFrame>))
    expect(tabs().map(([label]) => label)).not.toContain("Settings")
  } finally { act(() => root.unmount()); host.remove(); (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(before) }
})

/*
 * Design d-fbhqgy: a signed-out visitor's Ask leads to sign-in that returns to
 * `/<owner>/<repo>/?ask=1`, and the frame opens Ask on arrival from the entry's
 * reading of that marker (RepoLink.askRequested). Signed out, the marker opens
 * nothing: nothing redirects on load. No draft travels in the address.
 */
test("the Ask door's sign-in carries ?ask=1 in the page's own address, beside what the address already held", () => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const commands: string[] = []
  // The shared test DOM boots on about:blank; a real address is what the door edits.
  const setURL = (url: string) => (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(url)
  setURL("https://smithers.sh/sponsor/public/blob/main/src/index.ts?L=2")
  act(() => root.render(<RepoFrame repo="sponsor/public" onRunCommand={name => { commands.push(name) }} ask={() => null}>content</RepoFrame>))
  try {
    act(() => (host.querySelector(".repo-frame-ask-button") as HTMLButtonElement).click())
    expect(commands).toEqual(["sign-in"])
    expect(`${window.location.pathname}${window.location.search}`).toBe("/sponsor/public/blob/main/src/index.ts?L=2&ask=1")
  } finally {
    act(() => root.unmount())
    setURL("about:blank")
  }
})

test("an entry that asked for Ask opens it for a viewer who can Ask, and opens nothing signed out", () => {
  const mount = (login: string | undefined) => {
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const commands: string[] = []
    act(() => root.render(<RepoFrame repo="ada/widgets" login={login} askRequested onRunCommand={name => { commands.push(name) }} ask={visible => <div data-ask-visible={String(visible)} />}>content</RepoFrame>))
    return { host, commands, unmount: () => act(() => root.unmount()) }
  }
  const member = mount("ben")
  try {
    // happy-dom lays out no width, so without the request the Ask would start collapsed ("auto").
    expect(member.host.querySelector(".repo-frame")?.getAttribute("data-ask-open")).toBe("true")
    expect(member.host.querySelector(".repo-frame-ask-button")?.getAttribute("aria-expanded")).toBe("true")
    expect(member.host.querySelector("[data-ask-visible]")?.getAttribute("data-ask-visible")).toBe("true")
    // Opening on arrival ran no command: the Ask is a disclosure, and the composer's own focus act is the person's.
    expect(member.commands).toEqual([])
    act(() => (member.host.querySelector('[aria-label="Close Ask"]') as HTMLButtonElement).click())
    expect(member.host.querySelector(".repo-frame")?.getAttribute("data-ask-open")).toBe("false")
  } finally { member.unmount() }
  const visitor = mount(undefined)
  try {
    expect(visitor.host.querySelector(".repo-frame")?.getAttribute("data-ask-open")).toBe("false")
    expect(visitor.host.querySelector(".repo-frame-ask-button")?.getAttribute("aria-expanded")).toBe("false")
    expect(visitor.commands).toEqual([])
  } finally { visitor.unmount() }
})

// Design (K): the Ask heading names what the Ask is about, and takes the home's own prompt title when it declares one.
test("the Ask heading says what it is about and carries the home's prompt title", () => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<RepoFrame repo="ada/widgets" login="ben" askTitle="Ask about widgets" askContext="ada/widgets at main" onRunCommand={() => true} ask={() => null}>content</RepoFrame>))
  try {
    expect(host.querySelector(".repo-frame-ask-heading h2")?.textContent).toBe("Ask about widgets")
    expect(host.querySelector(".repo-frame-ask-heading p")?.textContent).toBe("Asking about ada/widgets at main")
  } finally { act(() => root.unmount()) }
  const plain = createRoot(host)
  act(() => plain.render(<RepoFrame repo="ada/widgets" login="ben" onRunCommand={() => true} ask={() => null}>content</RepoFrame>))
  try {
    expect(host.querySelector(".repo-frame-ask-heading h2")?.textContent).toBe("Ask")
    expect(host.querySelector(".repo-frame-ask-heading p")).toBeNull()
  } finally { act(() => plain.unmount()) }
})

/*
 * The GitHub sync chip (repo-ui-spec "The repo header"; mock RepoFrame.tsx GitHubSyncChip): the document's mirror
 * health off the entry, rendered with the mock's classes and strings: a link to Settings -> GitHub sync for a member,
 * text for everyone else. No sync fields, or no claim to make, is no chip.
 */
const mountChip = (sync: Parameters<typeof RepoFrame>[0]["sync"], member = false) => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<RepoFrame repo="maya/tinyhttp" publicRepo member={member} sync={sync} onRunCommand={() => {}} ask={() => null}>content</RepoFrame>))
  return host
}
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

test("the sync chip follows the Public badge in the repo title and says what the document says", () => {
  const synced = mountChip({ status: "synced", behindRefs: 0, failedRefs: 0, lastMirrorAt: minutesAgo(180), lastMirrorError: null })
  const chip = synced.querySelector(".repo-frame-repo-title .repo-frame-github")!
  expect(chip.tagName).toBe("SPAN")
  expect(chip.previousElementSibling?.className).toBe("repo-frame-visibility")
  expect(chip.firstElementChild?.className).toBe("repo-frame-sync-separator")
  expect(chip.firstElementChild?.getAttribute("aria-hidden")).toBe("true")
  expect(chip.textContent).toBe("·Synced with GitHub")
  expect(chip.classList.contains("repo-frame-sync-error")).toBe(false)
  expect(chip.querySelector("a, svg")).toBeNull()

  const stale = mountChip({ status: "behind", behindRefs: 2, failedRefs: 0, lastMirrorAt: minutesAgo(180), lastMirrorError: null })
  expect(stale.querySelector(".repo-frame-github")?.textContent).toBe("·Synced 3 h ago")
  const configured = mountChip({ status: "behind", behindRefs: 0, failedRefs: 0, lastMirrorAt: minutesAgo(5), lastMirrorError: null })
  expect(configured.querySelector(".repo-frame-github")?.textContent).toBe("·Synced with GitHub")

  // A failure's reason is a member's to read (the visitor case: the test below).
  const failed = mountChip({ status: "failed", behindRefs: 1, failedRefs: 1, lastMirrorAt: minutesAgo(180), lastMirrorError: "GitHub returned 401 for the app installation." }, true)
  const failure = failed.querySelector(".repo-frame-github")!
  expect(failure.classList.contains("repo-frame-sync-error")).toBe(true)
  expect(failure.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
  expect(failure.textContent).toBe("·GitHub sync failed: GitHub returned 401 for the app installation.")
  // No "Last success": last_mirror_at is stamped on failed reports too, so it is no last-success time (Platform d-yhg0yo).
  expect(failure.querySelector(".repo-frame-last-sync")).toBeNull()
  expect(failure.querySelector("a")).toBeNull()
})

test("no last_mirror_at, no status, or no sync fields at all: no chip and no separator", () => {
  for (const sync of [
    { status: "behind", behindRefs: 3, failedRefs: 0, lastMirrorAt: null, lastMirrorError: null },
    { status: "", behindRefs: 0, failedRefs: 0, lastMirrorAt: minutesAgo(1), lastMirrorError: null },
    undefined
  ]) {
    const host = mountChip(sync)
    expect(host.querySelector(".repo-frame-github")).toBeNull()
    expect(host.querySelector(".repo-frame-sync-separator")).toBeNull()
    expect(host.querySelector(".repo-frame-visibility")).not.toBeNull()
  }
})

test("a member's sync chip links to Settings -> GitHub sync; a visitor's stays text", () => {
  const sync = { status: "synced", behindRefs: 0, failedRefs: 0, lastMirrorAt: new Date(Date.now() - 60_000).toISOString(), lastMirrorError: null }
  for (const [member, tag, href] of [[true, "A", "/maya/tinyhttp/settings/sync"], [false, "SPAN", null]] as const) {
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<RepoFrame repo="maya/tinyhttp" login="ben" member={member} publicRepo sync={sync} onRunCommand={() => {}} ask={() => null}>content</RepoFrame>))
    try {
      const chip = host.querySelector(".repo-frame-repo-title .repo-frame-github")!
      expect(chip.tagName).toBe(tag)
      expect(chip.getAttribute("href")).toBe(href)
      expect(chip.textContent).toBe("·Synced with GitHub")
    } finally { act(() => root.unmount()); host.remove() }
  }
})

test("a failed sync's reason is a member's: a visitor reads 'GitHub sync failed' without the mirror's error", () => {
  const sync = { status: "failed", behindRefs: 1, failedRefs: 1, lastMirrorAt: new Date(Date.now() - 180 * 60_000).toISOString(), lastMirrorError: "fatal: could not read from internal-host" }
  for (const member of [true, false]) {
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<RepoFrame repo="maya/tinyhttp" login="ben" member={member} publicRepo sync={sync} onRunCommand={() => {}} ask={() => null}>content</RepoFrame>))
    try {
      const chip = host.querySelector(".repo-frame-github")!
      expect(chip.classList.contains("repo-frame-sync-error")).toBe(true)
      if (member) expect(chip.textContent).toContain("GitHub sync failed: fatal: could not read from internal-host")
      else {
        expect(chip.textContent).toContain("GitHub sync failed")
        expect(host.textContent).not.toContain("internal-host")
      }
    } finally { act(() => root.unmount()); host.remove() }
  }
})

test("the repository tabs draw a partial list's count as a floor and a complete one plainly", () => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  // A tab's count: the counter inside the tab whose label is `name`.
  const tab = (name: string) => [...host.querySelectorAll('nav[aria-label="Repository"] a')].find(link => link.firstChild?.textContent === name)?.querySelector(".repo-ui-counter")?.textContent
  try {
    act(() => root.render(<RepoFrame repo="ada/widgets" onRunCommand={() => {}} ask={null} issueCount={29} issuesPartial pullCount={3} pullsPartial>content</RepoFrame>))
    expect(tab("Issues")).toBe("29+")
    expect(tab("Pull requests")).toBe("3+")
    act(() => root.render(<RepoFrame repo="ada/widgets" onRunCommand={() => {}} ask={null} issueCount={2} pullCount={3} pullsPartial={false}>content</RepoFrame>))
    expect(tab("Issues")).toBe("2")
    expect(tab("Pull requests")).toBe("3")
  } finally { act(() => root.unmount()); host.remove() }
})
