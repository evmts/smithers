import { describe, expect, it, vi } from "vitest"
import * as ReadonlyMap from "../src/ReadonlyMap.ts"

describe("the immutable map facade", () => {
  it("supports every read operation without exposing mutation", () => {
    const map = ReadonlyMap.make<string, number>([["a", 1], ["b", 2]])
    const visited: Array<readonly [string, number]> = []
    const receiver = { marker: true }
    const callback = vi.fn(function(this: typeof receiver, value: number, key: string) {
      expect(this).toBe(receiver)
      visited.push([key, value])
    })

    map.forEach(callback, receiver)

    expect(map.size).toBe(2)
    expect(map.has("a")).toBe(true)
    expect(map.has("missing")).toBe(false)
    expect(map.get("b")).toBe(2)
    expect([...map.entries()]).toEqual([["a", 1], ["b", 2]])
    expect([...map.keys()]).toEqual(["a", "b"])
    expect([...map.values()]).toEqual([1, 2])
    expect([...map]).toEqual([["a", 1], ["b", 2]])
    expect(visited).toEqual([["a", 1], ["b", 2]])
    expect(Object.isFrozen(map)).toBe(true)
    expect((map as unknown as { set?: unknown }).set).toBeUndefined()
  })

  it("detaches membership from its source while preserving key and value identity", () => {
    const key = { id: 1 }
    const value = { enabled: true }
    const source = new Map([[key, value]])
    const map = ReadonlyMap.make(source)
    source.clear()
    source.set({ id: 2 }, { enabled: false })

    expect(map.size).toBe(1)
    expect([...map.keys()]).toEqual([key])
    expect([...map.keys()][0]).toBe(key)
    expect(map.get(key)).toBe(value)
    value.enabled = false
    expect(map.get(key)?.enabled).toBe(false)
  })

  it("uses native duplicate-key equality and preserves the first insertion order", () => {
    const map = ReadonlyMap.make<number, string>([
      [NaN, "first"],
      [-0, "zero"],
      [1, "one"],
      [NaN, "last"],
      [+0, "updated"]
    ])
    expect(map.size).toBe(3)
    expect([...map]).toEqual([[NaN, "last"], [0, "updated"], [1, "one"]])
    expect(map.get(NaN)).toBe("last")
    expect(map.get(-0)).toBe("updated")
    expect(Object.is([...map.keys()][1], 0)).toBe(true)
  })

  it("passes only the facade to callbacks and propagates callback failures", () => {
    const map = ReadonlyMap.make([["a", 1], ["b", 2]])
    const failure = new Error("stop")
    const visited: Array<string> = []
    expect(() =>
      map.forEach((value, key, receiver) => {
        expect(receiver).toBe(map)
        expect(Object.isFrozen(receiver)).toBe(true)
        expect(receiver.get(key)).toBe(value)
        visited.push(key)
        throw failure
      })
    ).toThrow(failure)
    expect(visited).toEqual(["a"])
    expect([...map]).toEqual([["a", 1], ["b", 2]])
  })

  it("returns fresh iterator tuples whose mutation cannot change membership", () => {
    const map = ReadonlyMap.make([["a", 1]])
    const entry = map.entries().next().value!
    entry[0] = "changed"
    entry[1] = 2
    const iterated = map[Symbol.iterator]().next().value!
    iterated[1] = 3

    expect(map.has("changed")).toBe(false)
    expect(map.get("a")).toBe(1)
    expect([...map]).toEqual([["a", 1]])
    expect(map.entries().next().value).not.toBe(entry)
  })
})
