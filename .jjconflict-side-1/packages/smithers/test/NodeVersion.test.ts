import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import * as NodeVersion from "../src/internal/NodeVersion.ts"

describe("NodeVersion", () => {
  it("accepts the engines floor and anything newer", () => {
    for (const version of ["22.19.0", "22.19.1", "22.20.0", "24.19.0", "26.4.0", "v27.0.0", "30.1.2"]) {
      expect(NodeVersion.satisfies(version)).toBe(true)
    }
  })

  it("refuses anything older, by minor and by major", () => {
    for (const version of ["22.18.9", "22.15.0", "22.4.1", "v20.19.0"]) {
      expect(NodeVersion.satisfies(version)).toBe(false)
    }
  })

  it("names both versions and the node binary when it refuses", () => {
    expect(NodeVersion.refusal("22.4.1", "/opt/homebrew/bin/node")).toBe(
      "smthrs needs Node 22.19.0 or later; /opt/homebrew/bin/node is Node 22.4.1. Put a newer node first on PATH."
    )
    expect(NodeVersion.refusal("26.5.0", "/usr/bin/node")).toBeUndefined()
  })

  it("matches the floor package.json declares", () => {
    const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    expect(manifest.engines.node).toBe(`>=${NodeVersion.minimum}`)
  })
})
