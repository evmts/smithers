import * as Cell from "@smthrs/harness/Cell"
import { Effect, Option } from "effect"
import { chatCopyFlows } from "../flows/entries/chat"
import type { CommandActions } from "../flows/entries/Declare"
import { payloadFor } from "../flows/SlashPayload"
import { createRoot } from "../cards/views/testDom"
import { act, type ReactNode } from "react"
import { afterEach, expect, mock, test } from "bun:test"
import { CodeHome, REPOSITORY_CLONE_HOST } from "./CodeHome"
import { RepositoryCodeView } from "./RepositoryCodeView"
import { codeReadKey, repositoryCodeReads, setCodeRead } from "./RepositoryCodeRead"

// #4316: repository copy buttons must work on plain-HTTP installs, where the
// browser omits navigator.clipboard, through the shipped adapter's fallback.
;(window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL("http://install.test/")
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard")
const originalExec = Object.getOwnPropertyDescriptor(document, "execCommand")
afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard)
  else Reflect.deleteProperty(navigator, "clipboard")
  if (originalExec) Object.defineProperty(document, "execCommand", originalExec)
  else Reflect.deleteProperty(document, "execCommand")
  act(() => { for (const row of repositoryCodeReads.values()) repositoryCodeReads.delete(row.id) })
  window.history.replaceState(null, "", "/")
})

const repo = "ada/widgets"
const commit = "a".repeat(40)
const content = "export const value = 1\n\n// preserve final newline\n"
const actions = ["clone", "contents", "permalink"] as const
const render = async (action: typeof actions[number]) => {
  const entry = chatCopyFlows({} as CommandActions)[0]!
  let pending: Promise<unknown> = Promise.resolve()
  const onRunCommand = (name: string, args?: string) => {
    expect(name).toBe("chat.copy-message")
    const parsed = payloadFor("chat.copy-message", args)
    if (!("payload" in parsed)) throw new Error("Invalid copy arguments")
    pending = Effect.runPromise(entry.binding.run(new Cell.Call({
      flowName: name, input: parsed.payload, capabilities: [],
      effects: { reads: [], writes: [], mode: "hermetic", onConflict: "serialize", tier: "sealed" },
      placement: Option.none(), identity: new Cell.CallIdentity({ session: "repository-copy", frame: 0, cell: "copy", ordinal: 0, declaration: "copy", layers: [] })
    })))
  }
  let element: ReactNode
  let label: string
  let expected: string
  if (action === "clone") {
    element = <CodeHome repo={repo} onRunCommand={onRunCommand} treeAvailable={false} />
    label = "Copy clone URL"
    expected = `git clone ${REPOSITORY_CLONE_HOST}/${repo}.git`
  } else {
    window.history.replaceState(null, "", `/${repo}/blob/main/src/file%20name.ts?L=2-3`)
    setCodeRead(codeReadKey(repo, "blob", "main/src/file%20name.ts", "current"), "ready", undefined, {
      content, size: new TextEncoder().encode(content).length, binary: false, tooLarge: false,
      commitSha: commit, rawUrl: `/api/repos/${repo}/contents/src/file%20name.ts?raw=1&ref=${commit}`
    })
    element = <RepositoryCodeView onRunCommand={onRunCommand} repo={repo} cards={[]} refs={["main"]} admitted requestId="current" onAsk={() => {}} />
    label = action === "contents" ? "Copy file contents" : "Copy permalink"
    expected = action === "contents" ? content : `${window.location.origin}/${repo}/blob/${commit}/src/file%20name.ts?L=2-3`
  }
  const host = document.createElement("div"); document.body.append(host)
  const root = createRoot(host)
  await act(async () => { root.render(element); await new Promise(resolve => setTimeout(resolve, 0)) })
  if (action === "clone") host.querySelector("details")?.setAttribute("open", "")
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => (button.getAttribute("aria-label") ?? button.textContent) === label)
  if (!button) throw new Error(`Missing ${label} at ${window.location.href}: ${host.innerHTML.slice(0, 1200)}`)
  return { host, button, expected, result: () => pending }
}

for (const action of actions) {
  test(`${action} copies exact text through the plain HTTP fallback and retains focus`, async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined })
    const copied: string[] = []
    const exec = mock((command: string) => {
      expect(command).toBe("copy")
      copied.push((document.activeElement as HTMLTextAreaElement).value)
      return true
    })
    Object.defineProperty(document, "execCommand", { configurable: true, value: exec })
    const { button, expected, result } = await render(action)
    button.focus()
    await act(async () => { button.click(); await result() })
    expect(copied).toEqual([expected])
    expect(document.activeElement).toBe(button)
    expect(document.querySelector("textarea")).toBeNull()
    expect(await result()).toMatchObject({ outcome: "success" })
  })

  test(`${action} reports refused copy without host error text and clears it after a successful retry`, async () => {
    const write = mock(async (_text: string): Promise<void> => { throw new Error("private clipboard diagnostic") })
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: write } })
    const exec = mock(() => false)
    Object.defineProperty(document, "execCommand", { configurable: true, value: exec })
    const { host, button, expected, result } = await render(action)
    await act(async () => { button.click(); await result() })
    expect(write).toHaveBeenCalledWith(expected)
    expect(exec).toHaveBeenCalledTimes(1)
    expect(await result()).toMatchObject({ outcome: "failure", message: "Flow chat.copy-message failed: The copy didn't go through — select the text and copy it yourself." })
    expect(host.textContent).not.toContain("private clipboard diagnostic")
    expect(JSON.stringify(await result())).not.toContain("private clipboard diagnostic")
    write.mockImplementation(async () => {})
    await act(async () => { button.click(); await result() })
    expect(write).toHaveBeenCalledTimes(2)
    expect(exec).toHaveBeenCalledTimes(1)
    expect(await result()).toMatchObject({ outcome: "success" })
  })
}
