import { Effect, Exit, Redacted } from "effect"
import { describe, expect, test } from "vitest"
import { Placeholder } from "../src/index.ts"

const KEY = Redacted.make("k".repeat(32))

const derive = (key: Redacted.Redacted<string>, scope: string, name: string) =>
  Effect.runPromise(Effect.flatMap(Placeholder.minter(key), (minter) => minter.derive(scope, name)))

describe("Placeholder", () => {
  test("a derived placeholder is the prefix and 64 lowercase hexadecimal characters", async () => {
    const placeholder = await derive(KEY, "repo:branch:1", "API_KEY")
    expect(placeholder).toMatch(/^smthrs-secret-[0-9a-f]{64}$/)
    expect(Placeholder.is(placeholder)).toBe(true)
  })

  test("the same key, scope and name derive the same placeholder; any other differs", async () => {
    const base = await derive(KEY, "repo:branch:1", "API_KEY")
    expect(await derive(KEY, "repo:branch:1", "API_KEY")).toBe(base)
    const others = await Promise.all([
      derive(KEY, "repo:branch:2", "API_KEY"),
      derive(KEY, "repo:branch:1", "API_KEY2"),
      derive(Redacted.make("j".repeat(32)), "repo:branch:1", "API_KEY"),
      // The scope and name are encoded unambiguously: moving a separator changes the placeholder.
      derive(KEY, "repo:branch:1A", "PI_KEY")
    ])
    expect(new Set([base, ...others]).size).toBe(5)
  })

  test("a key under 32 characters is refused", async () => {
    const exit = await Effect.runPromiseExit(Placeholder.minter(Redacted.make("short")))
    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("KeyTooShort")
  })

  test("find answers every placeholder in order; is answers only for exactly one", () => {
    const one = `smthrs-secret-${"1".repeat(64)}`
    const two = `smthrs-secret-${"f".repeat(64)}`
    expect(Placeholder.find(`Bearer ${one}, x=${two};${one}`)).toEqual([one, two, one])
    expect(Placeholder.find("nothing here")).toEqual([])
    expect(Placeholder.find(`smthrs-secret-${"F".repeat(64)}`)).toEqual([])
    expect(Placeholder.is(one)).toBe(true)
    expect(Placeholder.is(` ${one}`)).toBe(false)
    expect(Placeholder.is(`smthrs-secret-${"1".repeat(63)}`)).toBe(false)
  })
})
