// C-1/A-1: total hostile-value inspection catches synchronous defects.
const maxJsonSize = 8 * 1024 * 1024
const maxJsonDepth = 128
const refused = { _tag: "Refused" } as const
export const jsonBoundaryImpl = (
  value: unknown
): { readonly _tag: "Ok"; readonly value: unknown } | { readonly _tag: "Refused" } => {
  const seen = new Set<object>()
  let budget = maxJsonSize
  const spend = (units: number): void => {
    budget = budget - units
    if (budget < 0) throw refused
  }
  const copy = (candidate: unknown, depth: number): unknown => {
    if (depth > maxJsonDepth) throw refused
    spend(1)
    if (candidate === null || typeof candidate === "boolean") return candidate
    if (typeof candidate === "string") {
      spend(candidate.length)
      return candidate
    }
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) throw refused
      // `-0` is the one value normalized rather than refused. JSON has no
      // negative zero, so it would survive here and become `0` the moment
      // the event was serialized — and the QuickJS binding, which encodes
      // in-realm, already hands `0` to the host. Normalizing keeps the two
      // bindings byte-identical and keeps a replayed payload comparable to
      // the journaled one.
      return candidate === 0 ? 0 : candidate
    }
    if (typeof candidate !== "object") throw refused
    if (seen.has(candidate)) throw refused
    seen.add(candidate)
    if (Array.isArray(candidate)) {
      // Read once: the doc promise is that no property is read twice, and a
      // proxy over an array can answer `length` differently each time.
      const length = candidate.length
      const copied: Array<unknown> = []
      for (let index = 0; index < length; index = index + 1) {
        copied.push(copy(candidate[index], depth + 1))
      }
      seen.delete(candidate)
      return copied
    }
    const prototype = Object.getPrototypeOf(candidate)
    if (prototype !== Object.prototype && prototype !== null) throw refused
    const copied: Record<string, unknown> = {}
    for (const key of Object.keys(candidate)) {
      spend(key.length)
      // Defined, never assigned. `copied.__proto__ = x` invokes the setter
      // Object.prototype inherits: the key would silently vanish from the
      // copy and the copy's PROTOTYPE would become an object this walk
      // validated as data. An own `__proto__` reaches here from any value
      // built with `Object.create(null)`, which the prototype check above
      // admits by design.
      Object.defineProperty(copied, key, {
        configurable: true,
        enumerable: true,
        value: copy((candidate as Record<string, unknown>)[key], depth + 1),
        writable: true
      })
    }
    seen.delete(candidate)
    return copied
  }
  try {
    return { _tag: "Ok", value: copy(value === undefined ? null : value, 0) }
  } catch {
    return refused
  }
}

