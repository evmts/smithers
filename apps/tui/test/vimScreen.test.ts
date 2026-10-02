import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { awaitVimBuffer, hitEnter, vimEditable, vimForeground } from "../e2e/vimScreen.ts"
const marker = "resize-draft-中文-🦉"
const retained = readFileSync(new URL("./fixtures/vim-wrapped-screen.txt", import.meta.url), "utf8")
test("retained wrapped filename establishes Vim ownership but never editable readiness", () => {
  expect(vimForeground(retained, false)).toBe(true)
  expect(hitEnter(retained)).toBe(true)
  expect(vimEditable(retained, marker, false)).toBe(false)
})
for (let split = 1; split < "prompt.md".length; split++) {
  test(`recognizes filename wrap at position ${split} without flattening unrelated screen rows`, () => {
    const name = "prompt.md".slice(0, split) + "\n" + "prompt.md".slice(split)
    const screen = `"/private/tmp/owned/${name}" 1 line\nPress ENTER or type command to continue`
    expect(vimForeground(screen, false)).toBe(true)
    expect(vimForeground(screen, true)).toBe(false)
    expect(vimEditable(screen, marker, false)).toBe(false)
  })
}
test("unwrapped foreground, absent filename and still-TUI remain distinct", () => {
  expect(vimForeground("\"/owned/prompt.md\" 1 line", false)).toBe(true)
  expect(vimForeground("unrelated editor process alive", false)).toBe(false)
  expect(vimForeground("\"/owned/prompt.md\"", true)).toBe(false)
})
test("editable readiness requires its whole buffer row and dismissed hit-enter", () => {
  expect(vimEditable(`${marker}\n~\n~`, marker, false)).toBe(true)
  expect(vimEditable(`${marker}\nPress ENTER or type command to continue`, marker, false)).toBe(false)
  expect(vimEditable(`message includes ${marker}`, marker, false)).toBe(false)
  expect(vimEditable(`${marker}\n~`, marker, true)).toBe(false)
  expect(vimEditable("~\n~", marker, false)).toBe(false)
})

// Unit doubles exercise this test-harness protocol; actual Vim behavior is qualified separately in PTY.
test("rejects backup/larger filenames and a TUI footer even beside the real filename", () => {
  for (const screen of ["\"/owned/notprompt.md\"", "\"/owned/prompt.md.bak\"", "\"/owned/promptXmd\""]) {
    expect(vimForeground(screen, false)).toBe(false)
  }
  expect(vimForeground("\"/owned/prompt.md\"\n↑1 ↓2", true)).toBe(false)
})
for (let split = 1; split < "prompt.md".length; split++) {
  test(`recognizes CRLF and terminal padding at filename boundary ${split}`, () => {
    const name = "prompt.md".slice(0, split) + "\r\n  " + "prompt.md".slice(split)
    expect(vimForeground(`"/owned/${name}" 1 line`, false)).toBe(true)
  })
}
test("acknowledges hit-enter exactly once and shares the original five-second budget", async () => {
  let clock = 10_000
  const budgets: number[] = []
  const presses: string[] = []
  const labels: string[] = []
  const subject = {
    until: async (predicate: (screen: string) => boolean, ms: number, label: string) => {
      budgets.push(ms)
      labels.push(label)
      const screen = budgets.length === 1 ? retained : `${marker}\n~`
      expect(predicate(screen)).toBe(true)
      clock += budgets.length === 1 ? 2_000 : 100
      return screen
    },
    press: async (keys: string) => {
      presses.push(keys)
      clock += 500
    }
  }
  expect(await awaitVimBuffer(subject, marker, () => false, "owned Vim", () => clock)).toBe(`${marker}\n~`)
  expect(presses).toEqual(["\r"])
  expect(budgets).toEqual([5_000, 2_500])
  expect(labels).toEqual(["owned Vim", "owned Vim editable buffer"])
})
test("an already editable Vim never receives an extra Enter", async () => {
  let clock = 0
  const budgets: number[] = []
  const presses: string[] = []
  const subject = {
    until: async (predicate: (screen: string) => boolean, ms: number) => {
      budgets.push(ms)
      const screen = `${marker}\n"/owned/prompt.md" 1 line`
      expect(predicate(screen)).toBe(true)
      clock += 400
      return screen
    },
    press: async (keys: string) => {
      presses.push(keys)
    }
  }
  await awaitVimBuffer(subject, marker, () => false, "Vim", () => clock)
  expect(presses).toEqual([])
  expect(budgets).toEqual([5_000, 4_600])
})
for (const phase of ["startup", "ack", "buffer"] as const) {
  test(`preserves ${phase} errors without an additional key or retry`, async () => {
    const failure = new Error(`owned ${phase} refusal`)
    let waits = 0
    const presses: string[] = []
    const subject = {
      until: async (_predicate: (screen: string) => boolean, _ms: number) => {
        waits++
        if (phase === "startup" || (phase === "buffer" && waits === 2)) throw failure
        return retained
      },
      press: async (keys: string) => {
        presses.push(keys)
        if (phase === "ack") throw failure
      }
    }
    await expect(awaitVimBuffer(subject, marker, () => false, "Vim", () => 0)).rejects.toBe(failure)
    expect(waits).toBe(phase === "buffer" ? 2 : 1)
    expect(presses).toEqual(phase === "startup" ? [] : ["\r"])
  })
}
for (const phase of ["startup", "ack"] as const) {
  test(`deadline exhausted during ${phase} cannot receive a fresh buffer budget`, async () => {
    let clock = 0
    const budgets: number[] = []
    const presses: string[] = []
    const subject = {
      until: async (_predicate: (screen: string) => boolean, ms: number) => {
        budgets.push(ms)
        clock += phase === "startup" ? 5_000 : 4_000
        return retained
      },
      press: async (keys: string) => {
        presses.push(keys)
        clock += 1_000
      }
    }
    await expect(awaitVimBuffer(subject, marker, () => false, "Vim", () => clock)).rejects.toThrow(
      "Vim readiness deadline exceeded"
    )
    expect(budgets).toEqual([5_000])
    expect(presses).toEqual(phase === "startup" ? [] : ["\r"])
  })
}
