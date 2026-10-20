import { createRoot } from "../cards/views/testDom"
import { act } from "react"
import { expect, test } from "bun:test"
import { frameAskPlaceholder, guestAdmission, RepoFrame } from "./RepoFrame"

/*
 * Who opens Ask on a repository route (PM gap list row 15): a signed-in
 * member, or a signed-out visitor the server admitted to this repository's
 * guest conversation (session.guestConversation). Anyone else goes to sign-in.
 * The admission is a receipt the frame reads; it never stands in for an
 * identity, so the header keeps its Sign in door for a guest.
 */
const mount = (props: { login?: string; guest?: boolean }) => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const commands: string[] = []
  act(() => root.render(<RepoFrame repo="sponsor/public" {...props} onRunCommand={name => { commands.push(name) }}
    ask={visible => <p data-rail={String(visible)}>rail</p>}><p>Code</p></RepoFrame>))
  const frame = host.querySelector<HTMLElement>(".repo-frame")!
  const ask = host.querySelector<HTMLButtonElement>(".repo-frame-ask-button")!
  const chord = (target: HTMLElement) => act(() => { target.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true })) })
  return { host, frame, ask, commands, chord }
}

test("signed out without an admission, Ask and ⌘K lead to sign-in and the panel stays closed", () => {
  const { host, frame, ask, commands, chord } = mount({})
  expect(frame.getAttribute("data-ask-open")).toBe("false")
  expect(ask.getAttribute("data-flow")).toBe("sign-in")
  expect(ask.getAttribute("aria-expanded")).toBe("false")
  act(() => ask.click())
  expect(commands).toEqual(["sign-in"])
  chord(ask)
  expect(commands).toEqual(["sign-in", "sign-in"])
  expect(frame.getAttribute("data-ask-open")).toBe("false")
  expect(host.querySelector("[data-rail]")?.getAttribute("data-rail")).toBe("false")
})

test("an admitted guest opens Ask without a login, and the header keeps its Sign in door", () => {
  const { host, frame, ask, commands } = mount({ guest: true })
  expect(frame.getAttribute("data-ask-open")).toBe("auto")
  expect(ask.getAttribute("data-flow")).toBe("chat.open")
  expect(host.querySelector(".repo-frame-avatar-menu")).toBeNull()
  expect(host.querySelector<HTMLButtonElement>('.repo-frame-global [data-flow="sign-in"]')?.textContent).toBe("Sign in")
  act(() => ask.click())
  expect(commands).toEqual(["chat.open"])
  expect(frame.getAttribute("data-ask-open")).toBe("true")
  expect(ask.getAttribute("aria-expanded")).toBe("true")
  expect(host.querySelector("[data-rail]")?.getAttribute("data-rail")).toBe("true")
})

test("⌘K opens Ask for an admitted guest", () => {
  const { frame, ask, commands, chord } = mount({ guest: true })
  chord(ask)
  expect(commands).toEqual(["chat.open"])
  expect(frame.getAttribute("data-ask-open")).toBe("true")
})

test("a member opens Ask as before", () => {
  const { frame, ask, commands } = mount({ login: "ada" })
  expect(ask.getAttribute("data-flow")).toBe("chat.open")
  act(() => ask.click())
  expect(commands).toEqual(["chat.open"])
  expect(frame.getAttribute("data-ask-open")).toBe("true")
})

test("guestAdmission reads only this repository's receipt", () => {
  expect(guestAdmission("guest:sponsor/public:opaque-session", "sponsor/public")).toBe(true)
  expect(guestAdmission("guest:Sponsor/Public:opaque-session", "sponsor/public")).toBe(true)
  expect(guestAdmission("guest:sponsor/public:opaque-session", "sponsor/other")).toBe(false)
  expect(guestAdmission("guest:sponsor/publication:opaque-session", "sponsor/public")).toBe(false)
  expect(guestAdmission(undefined, "sponsor/public")).toBe(false)
})

// PM d-8bjzg6: while hosted coding is closed the frame Ask invites a question, never a change; signed out the frame says nothing of its own.
test("the frame Ask invites every signed-in viewer to ask, and none to describe a change", () => {
  expect(frameAskPlaceholder(true)).toBe("Ask a question…")
  expect(frameAskPlaceholder(false)).toBeUndefined()
  expect(frameAskPlaceholder(true)).not.toMatch(/change/i)
  // One ellipsis character, never three dots.
  expect(frameAskPlaceholder(true)!.endsWith("…") && !frameAskPlaceholder(true)!.includes("...")).toBe(true)
})
