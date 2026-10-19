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
