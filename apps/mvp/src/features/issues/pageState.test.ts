import { describe, expect, test } from "vitest"
import { pageOf } from "./view"

describe("direct issue and pull pages before a repository's first sync", () => {
  test("settles an answered shape without claiming an absent item is Not found", () => {
    expect(pageOf(undefined, undefined, false, false, { status: "unknown" })).toBe("loading")
    // A 2xx grants access before a cold eager shape has installed all its item rows.
    expect(pageOf(undefined, undefined, false, false, { status: "allowed" })).toBe("loading")
    expect(pageOf(undefined, undefined, true, false, { status: "allowed" })).toBe("loading")
    expect(pageOf(undefined, undefined, true, true, { status: "allowed" })).toBe("loading")
    expect(pageOf(undefined, undefined, true, true, { status: "allowed", installed: true })).toBe("unknown")
    expect(pageOf({ number: 1 }, undefined, false, false, { status: "allowed" })).toBe("shown")
    expect(pageOf(undefined, { syncedAt: "2026-10-23T00:00:00Z" }, false, true, { status: "allowed" })).toBe("loading")
    expect(pageOf(undefined, { syncedAt: "2026-10-23T00:00:00Z" }, true, false, { status: "allowed" })).toBe("loading")
    expect(pageOf(undefined, { syncedAt: "2026-10-23T00:00:00Z" }, true, true, { status: "allowed" })).toBe("loading")
    expect(pageOf(undefined, { syncedAt: "2026-10-23T00:00:00Z" }, true, true, { status: "allowed", installed: true })).toBe("missing")
  })

  test("a refused shape hides even a cached issue or pull", () => {
    expect(pageOf(undefined, undefined, false, false, { status: "sign_in" })).toBe("sign_in")
    expect(pageOf(undefined, undefined, false, false, { status: "forbidden" })).toBe("missing")
    expect(pageOf({ number: 1, body: "private content" }, undefined, true, true, { status: "sign_in" })).toBe("sign_in")
    expect(pageOf({ number: 1, body: "private content" }, undefined, true, true, { status: "forbidden" })).toBe("missing")
    expect(pageOf({ number: 1 }, undefined, true, true, { status: "unknown" })).toBe("shown")
  })
})
