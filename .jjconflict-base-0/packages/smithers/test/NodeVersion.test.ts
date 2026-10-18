import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import * as NodeVersion from "../src/internal/NodeVersion.ts"

describe("NodeVersion", () => {
  it("accepts the engines floor and anything newer", () => {
    for (const version of ["26.4.0", "26.4.1", "26.5.0", "v27.0.0", "30.1.2"]) {
      expect(NodeVersion.satisfies(version)).toBe(true)
    }
  })

  it("refuses anything older, by minor and by major", () => {
    for (const version of ["26.3.9", "26.0.0", "24.4.1", "v22.12.0"]) {
      expect(NodeVersion.satisfies(version)).toBe(false)
    }
  })

  it("names both versions and the node binary when it refuses", () => {
    expect(NodeVersion.refusal("24.4.1", "/opt/homebrew/bin/node")).toBe(
      "smthrs needs Node 26.4.0 or later; /opt/homebrew/bin/node is Node 24.4.1. Put a newer node first on PATH."
    )
    expect(NodeVersion.refusal("26.5.0", "/usr/bin/node")).toBeUndefined()
  })

  it("matches the floor package.json declares", () => {
    const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    expect(manifest.engines.node).toBe(`>=${NodeVersion.minimum}`)
  })
})
