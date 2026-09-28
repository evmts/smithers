import { expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as Search from "../src/search.ts"

// Public string admission contract: parse returns undefined for any other
// message. Malformed JSON values are refusal units, not claimed rg outputs.
test.each([
  "not json",
  "null",
  "true",
  "false",
  "0",
  "\"text\"",
  "[]",
  "[{\"type\":\"match\"}]",
  "{}",
  "{\"type\":\"begin\",\"data\":{\"path\":{\"text\":\"./sample.txt\"}}}",
  "{\"type\":\"end\",\"data\":{}}",
  "{\"type\":\"summary\",\"data\":{}}"
])("public parser skips non-match message %s", (line) => {
  expect(Search.parse(line)).toBeUndefined()
})

test.each([
  "{\"type\":\"match\"}",
  "{\"type\":\"match\",\"data\":null}",
  "{\"type\":\"match\",\"data\":{\"line_number\":\"1\",\"path\":{\"text\":\"x\"},\"lines\":{\"text\":\"needle\"}}}",
  "{\"type\":\"match\",\"data\":{\"line_number\":1.5,\"path\":{\"text\":\"x\"},\"lines\":{\"text\":\"needle\"}}}",
  "{\"type\":\"match\",\"data\":{\"line_number\":1,\"path\":null,\"lines\":{\"text\":\"needle\"}}}",
  "{\"type\":\"match\",\"data\":{\"line_number\":1,\"path\":[],\"lines\":{\"text\":\"needle\"}}}",
  "{\"type\":\"match\",\"data\":{\"line_number\":1,\"path\":{\"text\":1},\"lines\":{\"text\":\"needle\"}}}",
  "{\"type\":\"match\",\"data\":{\"line_number\":1,\"path\":{\"bytes\":null},\"lines\":{\"text\":\"needle\"}}}",
  "{\"type\":\"match\",\"data\":{\"line_number\":1,\"path\":{\"bytes\":1},\"lines\":{\"text\":\"needle\"}}}",
  "{\"type\":\"match\",\"data\":{\"line_number\":1,\"path\":{\"bytes\":[120]},\"lines\":{\"text\":\"needle\"}}}",
  "{\"type\":\"match\",\"data\":{\"line_number\":1,\"path\":{\"text\":\"x\"},\"lines\":null}}",
  "{\"type\":\"match\",\"data\":{\"line_number\":1,\"path\":{\"text\":\"x\"},\"lines\":{\"text\":false}}}",
  "{\"type\":\"match\",\"data\":{\"line_number\":1,\"path\":{\"text\":\"x\"},\"lines\":{\"bytes\":[110,101,101,100,108,101]}}}",
  "{\"type\":\"match\",\"data\":{\"line_number\":1,\"path\":{\"text\":\"x\"},\"lines\":{\"bytes\":{}}}}"
])("public parser refuses malformed match without an escaped exception: %s", (line) => {
  expect(Search.parse(line)).toBeUndefined()
})

test("text and base64 producer records preserve exact path and line while stripping only the terminal newline", () => {
  expect(
    Search.parse(
      "{\"type\":\"match\",\"data\":{\"line_number\":7,\"path\":{\"text\":\"./café.ts\"},\"lines\":{\"text\":\" needle\\r\\n\"}}}"
    )
  ).toEqual({ path: "café.ts", line: 7, text: " needle" })
  expect(
    Search.parse(
      "{\"type\":\"match\",\"data\":{\"line_number\":1,\"path\":{\"bytes\":\"Li9zYW1wbGUudHh0\"},\"lines\":{\"bytes\":\"bmVlZGxlCg==\"}}}"
    )
  ).toEqual({ path: "sample.txt", line: 1, text: "needle" })
})

test("unnameable non-UTF8 paths are refused and display truncation preserves the first200 characters", () => {
  expect(
    Search.parse(
      "{\"type\":\"match\",\"data\":{\"line_number\":1,\"path\":{\"bytes\":\"Yv8=\"},\"lines\":{\"text\":\"needle\"}}}"
    )
  ).toBeUndefined()
  const line = JSON.stringify({
    type: "match",
    data: { line_number: 3, path: { text: "./long.txt" }, lines: { text: `${"a".repeat(200)}b\n` } }
  })
  expect(Search.parse(line)).toEqual({ path: "long.txt", line: 3, text: "a".repeat(200) })
})

test("actual rg producer messages yield one hit and safely skip begin, end and summary records", () => {
  const cwd = mkdtempSync(join(tmpdir(), "tui-rg-producer-"))
  try {
    writeFileSync(join(cwd, "sample.txt"), "needle\nother\n")
    const child = Bun.spawnSync(["rg", "--json", "-F", "-e", "needle", "--", "."], {
      cwd,
      stdout: "pipe",
      stderr: "pipe"
    })
    expect(child.exitCode).toBe(0)
    const lines = child.stdout.toString().trim().split("\n")
    expect(lines.some((line) => line.includes("\"type\":\"begin\""))).toBe(true)
    expect(lines.some((line) => line.includes("\"type\":\"end\""))).toBe(true)
    expect(lines.some((line) => line.includes("\"type\":\"summary\""))).toBe(true)
    expect(lines.flatMap((line) => Search.parse(line) ?? [])).toEqual([{ path: "sample.txt", line: 1, text: "needle" }])
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})
