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
