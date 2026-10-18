import { expect, test } from "bun:test"
import { act } from "react"
import { createRoot } from "./cards/views/testDom"
import { ControllerContext } from "./ControllerContext"
import type { AppController } from "./state/AppController"
import { EntryRow } from "./EntryRow"

test("only a failed row with correlation offers the typed bug door", () => {
  for (const tone of ["failed", "quiet"] as const) for (const correlation of ["req-123", undefined]) for (const failureCode of ["host_no_capacity", undefined]) {
    const calls: unknown[][] = []
    const host = document.createElement("div")
    const root = createRoot(host)
    const controller = { runCommand: (...args: unknown[]) => { calls.push(args) } } as unknown as AppController
    act(() => root.render(<ControllerContext value={controller}>
      <EntryRow kind="answer" title="" author={{ kind: "system", color_index: 7 }} tone={tone} source={{ correlation, failureCode }}
        onAction={() => {}} />
    </ControllerContext>))
    const button = host.querySelector<HTMLButtonElement>('[data-flow="bug.report"]')
    if (tone === "failed" && correlation !== undefined) {
      expect(button?.textContent).toBe("Report a bug")
      button!.click()
      expect(calls).toEqual([["bug.report", JSON.stringify({ correlationId: "req-123", ...(failureCode === undefined ? {} : { failureCode }) })]])
    } else expect(button).toBeNull()
    act(() => root.unmount())
  }
})
