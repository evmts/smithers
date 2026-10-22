import { readFileSync, rmSync, statSync } from "node:fs"
import { dirname } from "node:path"
import { describe, expect, it } from "vitest"
import * as Diagnostic from "../src/Diagnostic.ts"

describe("Diagnostic", () => {
  it("renders data without invoking accessors, proxies, or object conversion", () => {
    let calls = 0
    const getter = Object.defineProperty({}, "message", {
      get: () => {
        calls += 1
        return "getter message"
      }
    })
    const converted = {
      toString: () => {
        calls += 1
        return "converted message"
      }
    }
    const proxy = new Proxy(new Error("proxy message"), {
      getOwnPropertyDescriptor: (target, property) => {
        calls += 1
        return Reflect.getOwnPropertyDescriptor(target, property)
      }
    })

    expect(Diagnostic.message(getter, "fallback")).toBe("fallback")
    expect(Diagnostic.message(converted, "fallback")).toBe("fallback")
    expect(Diagnostic.message(proxy, "fallback")).toBe("fallback")
    expect(calls).toBe(0)
  })

  it("preserves a safe native Error and wraps every other rejection", () => {
    const native = new Error("native")
    expect(Diagnostic.error(native)).toBe(native)
    expect(Diagnostic.error("text").message).toBe("text")
    expect(Diagnostic.error({}).message).toBe("operation failed")
  })

  it("renders primitives through String and empty text through the fallback", () => {
    expect(Diagnostic.message(42)).toBe("42")
    expect(Diagnostic.message(10n)).toBe("10")
    expect(Diagnostic.message(false)).toBe("false")
    expect(Diagnostic.message(Symbol("tag"))).toBe("Symbol(tag)")
    expect(Diagnostic.message(undefined, "fallback")).toBe("fallback")
    expect(Diagnostic.message(null, "fallback")).toBe("fallback")
    expect(Diagnostic.message("", "fallback")).toBe("fallback")
  })

  it("reads an own data message from objects and functions only", () => {
    expect(Diagnostic.message({ message: "plain" })).toBe("plain")
    expect(Diagnostic.message(Object.assign(() => undefined, { message: "callable" }))).toBe("callable")
    expect(Diagnostic.message({ message: 42 }, "fallback")).toBe("fallback")
    expect(Diagnostic.message({}, "fallback")).toBe("fallback")
    expect(Diagnostic.message(Object.create({ message: "inherited" }), "fallback")).toBe("fallback")
  })

  it("wraps native Errors whose message is empty, malformed, oversized, or accessor-backed", () => {
    const empty = new Error("")
    const wrapped = Diagnostic.error(empty)
    expect(wrapped).not.toBe(empty)
    expect(wrapped.message).toBe("operation failed")
    expect(wrapped.cause).toBe(empty)
    expect(Diagnostic.error(new Error("bad\ud800text")).message).toBe("bad\ufffdtext")
    expect(Diagnostic.error(new Error("x".repeat(Diagnostic.maximumMessageCodeUnits + 1))).message).toHaveLength(
      Diagnostic.maximumMessageCodeUnits
    )
    const getter = Object.defineProperty(new Error("own"), "message", { get: () => "getter" })
    expect(Diagnostic.error(getter, "fallback").message).toBe("fallback")
    expect(Diagnostic.error({ message: "plain" }).message).toBe("plain")
    expect(Diagnostic.error(new Proxy(new Error("proxied"), {}), "fallback").message).toBe("fallback")
    expect(Diagnostic.error(7).message).toBe("7")
    expect(Diagnostic.error(null, "fallback").message).toBe("fallback")
  })

  it("bounds and well-forms messages", () => {
    expect(Diagnostic.message("bad\ud800text")).toBe("bad\ufffdtext")
    expect(Diagnostic.message("x".repeat(Diagnostic.maximumMessageCodeUnits + 1))).toHaveLength(
      Diagnostic.maximumMessageCodeUnits
    )
  })

  it("never splits a surrogate pair when it truncates", () => {
    // The cut lands between the halves of an astral character.
    const oversized = `${"x".repeat(Diagnostic.maximumMessageCodeUnits - 4)}${"\u{1F600}".repeat(4)}`
    const rendered = Diagnostic.message(oversized)
    expect(rendered.isWellFormed()).toBe(true)
    expect(rendered.length).toBeLessThanOrEqual(Diagnostic.maximumMessageCodeUnits)
    expect(rendered.endsWith("x...")).toBe(true)
    const error = Diagnostic.error(new Error(oversized))
    expect(error.message.isWellFormed()).toBe(true)
  })
})

describe("unexpected failure diagnostics", () => {
  it("prints the tag, redacted message and a private log receipt without error payloads", () => {
    const failure = Object.assign(new TypeError("Cannot load module; token=fixture-secret"), {
      _tag: "ModuleLoadError",
      payload: "private user content"
    })
    const rendered = Diagnostic.unexpected(failure)
    const path = rendered.split("Diagnostics: ")[1]!
    try {
      expect(rendered).toContain("ModuleLoadError: Cannot load module")
      expect(path).toMatch(/failure\.log$/)
      expect(statSync(path).mode & 0o777).toBe(0o600)
      expect(statSync(dirname(path)).mode & 0o777).toBe(0o700)
      const log = readFileSync(path, "utf8")
      expect(log).toContain("ModuleLoadError: Cannot load module")
      expect(log).not.toContain("fixture-secret")
      expect(log).not.toContain("private user content")
      expect(rendered).not.toContain("fixture-secret")
    } finally {
      rmSync(dirname(path), { recursive: true, force: true })
    }
  })
})

it("reports unexpected runtime bugs without verbose and retains designed refusals", () => {
  const rendered = Diagnostic.report(new TypeError("Cannot load declaration"), { verbose: false })
  const path = rendered.split("Diagnostics: ")[1]!
  try {
    expect(rendered).toContain("TypeError: Cannot load declaration")
    expect(readFileSync(path, "utf8")).toContain("TypeError: Cannot load declaration")
    expect(Diagnostic.report(new Error("No targets selected"), { verbose: false })).toBe("No targets selected")
  } finally {
    rmSync(dirname(path), { recursive: true, force: true })
  }
})

it("retains diagnostics when the log directory is unavailable and never invokes error accessors", () => {
  let reads = 0
  const failure = Object.defineProperties(new TypeError("Declaration failed"), {
    name: {
      get: () => {
        reads += 1
        return "private user content"
      }
    },
    _tag: {
      get: () => {
        reads += 1
        return "private user content"
      }
    }
  })
  const rendered = Diagnostic.unexpected(failure, "/dev/null/unavailable")
  expect(rendered).toContain("TypeError: Declaration failed")
  expect(rendered).toContain("Diagnostics: unavailable (could not write log)")
  expect(reads).toBe(0)
})

it("bounds a Unicode diagnostic without splitting an astral character", () => {
  const rendered = Diagnostic.unexpected(new TypeError("🙂".repeat(5000)))
  const path = rendered.split("Diagnostics: ")[1]!
  try {
    const log = readFileSync(path, "utf8").trimEnd()
    expect([...log]).toHaveLength(4096)
    expect(log.isWellFormed()).toBe(true)
    expect(rendered.isWellFormed()).toBe(true)
  } finally {
    rmSync(dirname(path), { recursive: true, force: true })
  }
})
