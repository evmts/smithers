import "../cards/views/testDom"
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"

test("Ask reserves the composer's height and lets complete transcript cards scroll", () => {
  const style = document.createElement("style")
  style.textContent =
    readFileSync(new URL("../styles/chat.css", import.meta.url), "utf8") +
    readFileSync(new URL("repository.css", import.meta.url), "utf8")
  const host = document.createElement("div")
  host.className = "repository-chat"
  host.innerHTML =
    '<div class="app-shell"><div class="app-main"><div class="smithers-transcript"><div class="sui-chat-messages"><div class="sui-msg-scroller-item"><section class="hosted-change-confirm">Start agent</section></div></div></div><div class="composer-overlay"><textarea></textarea></div></div></div>'
  document.head.append(style)
  document.body.append(host)
  try {
    expect(getComputedStyle(host.querySelector(".composer-overlay")!).position).toBe("relative")
    expect(getComputedStyle(host.querySelector(".composer-overlay")!).flexShrink).toBe("0")
    expect(getComputedStyle(host.querySelector(".sui-msg-scroller-item")!).marginTop).toBe("0px")
    expect(getComputedStyle(host.querySelector(".sui-msg-scroller-item")!).flexShrink).toBe("0")
  } finally {
    host.remove()
    style.remove()
  }
})

import { act } from "react"
import { createRoot } from "react-dom/client"
import { RepoFrame } from "./RepoFrame"

test("signed-out Ask opens only the sign-in gate and never starts chat", () => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  let asks = 0, signs = 0
  try {
    act(() => root.render(<RepoFrame repo="maya/tinyhttp" publicRepo onAsk={() => asks++} onSignIn={() => signs++} ask={<textarea />}><p>Files</p></RepoFrame>))
    expect(host.querySelector(".repo-frame")?.getAttribute("data-ask-open")).toBe("false")
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Ask"]')!.click())
    expect(host.querySelector(".repo-frame")?.getAttribute("data-ask-open")).toBe("true")
    expect(host.querySelector("#repo-ask")?.textContent).toContain("Sign in to start an agent.")
    expect(host.querySelector("#repo-ask textarea")).toBeNull()
    expect(asks).toBe(0)
    act(() => host.querySelector<HTMLButtonElement>(".repo-ask-sign-in button")!.click())
    expect(signs).toBe(1)
  } finally {
    act(() => root.unmount())
    host.remove()
  }
})
