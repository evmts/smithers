import { describe, expect, test } from "vitest"
import { devReload } from "./devReload"

describe("devReload", () => {
  test("names the file whose change reloads an app page", () => {
    expect(devReload(JSON.stringify({ type: "full-reload", path: "*", triggeredBy: "/repo/src/device/identity.ts" }))).toBe(
      "/repo/src/device/identity.ts",
    )
    expect(devReload(JSON.stringify({ type: "full-reload", path: "/src/main.tsx" }))).toBe("/src/main.tsx")
    expect(devReload(JSON.stringify({ type: "full-reload" }))).toBe("*")
    expect(devReload(JSON.stringify({ type: "full-reload", path: "/index.html" }))).toBe("/index.html")
  })

  test("reads nothing from a reload of another HTML page, another message or a frame that isn't one", () => {
    expect(devReload(JSON.stringify({ type: "full-reload", path: "/docs/design/review-queue/review-queue.html" }))).toBeUndefined()
    expect(devReload(JSON.stringify({ type: "update", updates: [] }))).toBeUndefined()
    expect(devReload(JSON.stringify({ type: "custom", event: "full-reload" }))).toBeUndefined()
    expect(devReload("full-reload, but not JSON")).toBeUndefined()
    expect(devReload(Buffer.from(JSON.stringify({ type: "full-reload" })))).toBeUndefined()
    expect(devReload("ping")).toBeUndefined()
  })
})
