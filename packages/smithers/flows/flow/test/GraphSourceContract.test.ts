import { readFileSync } from "node:fs"
import { expect, it } from "vitest"

const source = readFileSync(new URL("../src/Graph.ts", import.meta.url), "utf8")

it("Graph consumes Smithers packages through their public roots", () => {
  expect(
    [...source.matchAll(/from ["'](@smthrs\/[^"']+)["']/g)].map((match) => match[1])
      .filter((name) => name!.split("/").length > 2)
  ).toEqual([])
})

it("diagnostics documentation allows retained fatal refusals", () => {
  const docs = source.slice(
    source.lastIndexOf("/**", source.indexOf("export const diagnostics")),
    source.indexOf("export const diagnostics")
  )
  expect(docs).not.toContain("never appear here")
  expect(docs).toContain("Fatal diagnostics remain inspectable")
})
