import { describe, expect, it } from "vitest"
import { QuickJSLifecycle } from "../src/index.ts"

describe("QuickJS lifecycle budgets", () => {
  it("arms, refunds paused calls, preserves the first limit and resets", () => {
    let now = 10
    const budget = QuickJSLifecycle.interruptBudget(() => now)
    expect(budget.poll()).toBeUndefined()
    budget.arm(5, 1)
    expect(budget.poll()).toBeUndefined()
    expect(budget.poll()).toBe("steps")
    now = 20
    expect(budget.poll()).toBe("steps")
    budget.arm(5, undefined)
    budget.pause(10)
    now = 34
    expect(budget.poll()).toBeUndefined()
    now = 35
    expect(budget.poll()).toBe("time")
    expect(budget.poll()).toBe("time")
    budget.arm(100, 0)
    expect(budget.poll()).toBe("steps")
  })

  it.each(["", "abc", "é", "€", "😀", "\ud800", "\ud800a", "\udc00", "\ud800\ud800"])(
    "measures UTF8 including malformed UTF16: %j",
    (text) => {
      expect(QuickJSLifecycle.utf8Length(text)).toBe(new TextEncoder().encode(text).length)
    }
  )
})
