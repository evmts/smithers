import { afterEach, expect, test } from "bun:test"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openNativeRendererState } from "./NativeRendererState"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "smithers-native-state-"))
  roots.push(root)
  return { root, directory: join(root, "renderer"), file: join(root, "renderer", "state.json") }
}
const account = "a".repeat(64)
const sessions = {
  [account]: [{ name: "smithers_session", value: "private-test", path: "/", expiresAt: 4_000_000_000_000 }]
}

test("private renderer state publishes and replaces complete snapshots across reopen", () => {
  const fixtureState = fixture()
  const state = openNativeRendererState(fixtureState.root)
  expect(state.port).toBe(0)
  expect(state.sessions).toEqual({})
  state.save(4321, sessions)
  expect(statSync(fixtureState.file).mode & 0o777).toBe(0o600)
  expect(statSync(fixtureState.directory).mode & 0o777).toBe(0o700)
  const restored = openNativeRendererState(fixtureState.root)
  expect(restored.port).toBe(4321)
  expect(restored.sessions).toEqual(sessions)
  restored.save(4321, {})
  expect(openNativeRendererState(fixtureState.root).sessions).toEqual({})
  expect(readFileSync(fixtureState.file, "utf8")).not.toContain("private-test")
  expect(readdirSync(fixtureState.directory)).toEqual(["state.json"])
})

test("first publication excludes a competing writer and leaves no staging credential", () => {
  const fixtureState = fixture()
  const first = openNativeRendererState(fixtureState.root)
  const competing = openNativeRendererState(fixtureState.root)
  first.save(4321, sessions)
  expect(() => competing.save(4322, {})).toThrow()
  const restored = openNativeRendererState(fixtureState.root)
  expect(restored.port).toBe(4321)
  expect(restored.sessions).toEqual(sessions)
  expect(readdirSync(fixtureState.directory)).toEqual(["state.json"])
})

test("running state refuses externally changed identity without overwriting it", () => {
  const fixtureState = fixture()
  const first = openNativeRendererState(fixtureState.root)
  first.save(4321, sessions)
  writeFileSync(fixtureState.file, JSON.stringify({ version: 1, port: 4322, sessions: {} }), { mode: 0o600 })
  expect(() => first.save(4321, sessions)).toThrow("changed while running")
  expect(openNativeRendererState(fixtureState.root).port).toBe(4322)
})

test("recovery removes private interrupted staging files and preserves unrelated files", () => {
  const fixtureState = fixture()
  const state = openNativeRendererState(fixtureState.root)
  state.save(4321, sessions)
  writeFileSync(join(fixtureState.directory, ".state-aabbcc.tmp"), "old-private-session", { mode: 0o600 })
  writeFileSync(join(fixtureState.directory, "unrelated.tmp"), "keep", { mode: 0o600 })
  state.save(4321, {})
  expect(readdirSync(fixtureState.directory).sort()).toEqual(["state.json", "unrelated.tmp"])
  expect(readFileSync(join(fixtureState.directory, "unrelated.tmp"), "utf8")).toBe("keep")
})

test.each([0, -1, 65536, 1.5, Number.NaN])("invalid renderer port %s preserves the last durable state", (port) => {
  const fixtureState = fixture()
  const state = openNativeRendererState(fixtureState.root)
  expect(() => state.save(port, sessions)).toThrow("invalid")
  expect(existsSync(fixtureState.file)).toBe(false)
  state.save(4321, sessions)
  const before = readFileSync(fixtureState.file)
  expect(() => state.save(port, sessions)).toThrow()
  expect(readFileSync(fixtureState.file)).toEqual(before)
})

test("oversized session updates fail before replacing private state", () => {
  const fixtureState = fixture()
  const state = openNativeRendererState(fixtureState.root)
  state.save(4321, {})
  const before = readFileSync(fixtureState.file)
  expect(() => state.save(4321, { [account]: [{ ...sessions[account]![0]!, value: "x".repeat(1024 * 1024) }] }))
    .toThrow("too large")
  expect(readFileSync(fixtureState.file)).toEqual(before)
  expect(readdirSync(fixtureState.directory)).toEqual(["state.json"])
})

test.each(["public-directory", "file-is-directory", "oversized-file", "invalid-schema"])(
  "opening %s refuses unsafe state",
  (kind) => {
    const fixtureState = fixture()
    mkdirSync(fixtureState.directory, { mode: 0o700 })
    if (kind === "public-directory") chmodSync(fixtureState.directory, 0o755)
    if (kind === "file-is-directory") mkdirSync(fixtureState.file)
    if (kind === "oversized-file") writeFileSync(fixtureState.file, "x".repeat(1024 * 1024 + 1), { mode: 0o600 })
    if (kind === "invalid-schema") {
      writeFileSync(
        fixtureState.file,
        JSON.stringify({ version: 2, port: 4321, sessions: {} }),
        { mode: 0o600 }
      )
    }
    expect(() => openNativeRendererState(fixtureState.root)).toThrow()
  }
)

test.each(["name", "value", "path"] as const)("stored cookie %s cannot inject control characters", (field) => {
  const fixtureState = fixture()
  mkdirSync(fixtureState.directory, { mode: 0o700 })
  const invalid = {
    ...sessions[account]![0]!,
    [field]: field === "path" ? "/private\u0000path" : "private\u0000marker"
  }
  writeFileSync(fixtureState.file, JSON.stringify({ version: 1, port: 4321, sessions: { [account]: [invalid] } }), {
    mode: 0o600
  })
  expect(() => openNativeRendererState(fixtureState.root)).toThrow("state is invalid")
  expect(() => openNativeRendererState(fixtureState.root)).not.toThrow("private")
})
