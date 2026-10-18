import { expect, test } from "bun:test"
import { parseJjPin } from "./jj-pin"

const revision = "1d7ce38af52f676c5190172773f9b9081816d985"
const entry = (fields: string) => `version = 4\n\n[[package]]\nname = "jj-core"\nversion = "0.46.0"\n\n[[package]]\n${fields}\n`

test("reads the pinned fork revision and the CLI version it builds", () => {
  expect(parseJjPin(entry(
    `name = "jj-lib"\nversion = "0.46.0"\nsource = "git+https://github.com/smithersai/jj?rev=${revision}#${revision}"`
  ))).toEqual({ repository: "https://github.com/smithersai/jj", revision, version: `jj 0.46.0-${revision}` })
})

test("refuses a path, branch, short, foreign or mismatched pin", () => {
  for (
    const source of [
      "",
      `source = "git+https://github.com/smithersai/jj?branch=smithers#${revision}"`,
      `source = "git+https://github.com/smithersai/jj?rev=1d7ce38#1d7ce38"`,
      `source = "git+https://github.com/jj-vcs/jj?rev=${revision}#${revision}"`,
      `source = "git+https://github.com/smithersai/jj?rev=${revision}#${"0".repeat(40)}"`
    ]
  ) {
    expect(() => parseJjPin(entry(`name = "jj-lib"\nversion = "0.46.0"\n${source}`))).toThrow("full smithersai/jj")
  }
  expect(() => parseJjPin(entry(`name = "jj-core"\nversion = "0.46.0"`))).toThrow("full smithersai/jj")
})
