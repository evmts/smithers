import { expect, test } from "bun:test"
import { act } from "react"
import { createRoot } from "./cards/views/testDom"
import { EntryRow } from "./EntryRow"

test("only a failed row with correlation offers the typed bug door", () => {
  for (const tone of ["failed", "quiet"] as const) for (const correlation of ["req-123", undefined]) for (const failureCode of ["host_no_capacity", undefined]) {
    const calls: unknown[][] = []
    const host = document.createElement("div")
    const root = createRoot(host)
    act(() => root.render(<>
      <EntryRow kind="answer" title="" author={{ kind: "system", color_index: 7 }} tone={tone} source={{ correlation, failureCode }}
        onAction={(...args) => { calls.push(args) }} />
    </>))
    const button = host.querySelector<HTMLButtonElement>('[data-flow="bug.report"]')
    if (tone === "failed" && correlation !== undefined) {
      expect(button?.textContent).toBe("Report a bug")
      button!.click()
      expect(calls).toEqual([["bug.report", { correlationId: "req-123", ...(failureCode === undefined ? {} : { failureCode }) }]])
    } else expect(button).toBeNull()
    act(() => root.unmount())
  }
})
