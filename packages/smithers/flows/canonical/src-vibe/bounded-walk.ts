// VibeLang catch bypasses native inspection defects; synchronous admission must refuse them.
// The synchronous generator trampoline must not become a VibeLang Stream producer.
import { encodedStringBytes, type Limits, type Json, type Result, type IssueCode, type StrictOptions, type StrictLimits } from "./BoundedJson.vibe"
type Segment = string | number | { readonly key: number }
type WalkResult =
  | Extract<Result, { readonly ok: true }>
  | (Omit<Extract<Result, { readonly ok: false }>, "path"> & { readonly path: ReadonlyArray<Segment> })
interface Request {
  readonly value: unknown
  readonly depth: number
  readonly path: ReadonlyArray<Segment>
}
const reservedKeys = new Set(["__proto__", "constructor", "prototype"])

const walk = (
  input: unknown,
  limits: Limits,
  preflightObjects: boolean,
  strict?: StrictOptions
): WalkResult => {
  let bytes = 0
  let nodes = 0
  let totalMembers = 0
  const active = new WeakSet<object>()
  const add = (count: number): boolean => {
    bytes += count
    return Number.isSafeInteger(bytes) && bytes <= (limits.maxBytes ?? Infinity)
  }
  const countMembers = (count: number): boolean => {
    totalMembers += count
    return count <= limits.maxMembers && totalMembers <= (limits.maxTotalMembers ?? Infinity)
  }

  function* visit({ value, depth, path }: Request): Generator<Request, WalkResult, WalkResult> {
    const refuse = (code: IssueCode, complaint: string, at = path): WalkResult => ({
      ok: false,
      code,
      complaint,
      path: at
    })
    const byteFailure = () =>
      refuse("bytes", strict ? `exceeds the ${limits.maxBytes}-byte limit` : "exceeds the JSON byte limit")
    const memberFailure = () =>
      refuse("members", strict ? `exceeds the ${limits.maxMembers}-member limit` : "exceeds the JSON members limit")
    const nodeFailure = () =>
      refuse(
        "nodes",
        strict ? `exceeds the ${limits.maxNodes}-node limit` : `contains more than ${limits.maxNodes} JSON values`
      )
    if (!strict && depth > limits.maxDepth) {
      return refuse("depth", `exceeds the maximum JSON depth of ${limits.maxDepth}`)
    }
    if (++nodes > limits.maxNodes) return nodeFailure()
    if (value === null) return add(4) ? { ok: true, value, bytes } : byteFailure()
    switch (typeof value) {
      case "boolean":
        return add(value ? 4 : 5) ? { ok: true, value, bytes } : byteFailure()
      case "number":
        if (!Number.isFinite(value)) {
          return refuse("number", strict ? "must be a finite JSON number" : "contains a non-finite number")
        }
        return add(String(value).length) ? { ok: true, value, bytes } : byteFailure()
      case "string": {
        if (strict?.boundedText && value.length > limits.maxStringBytes!) {
          return refuse("string", `exceeds the ${limits.maxStringBytes}-byte string limit`)
        }
        const size = encodedStringBytes(value, strict ? Infinity : limits.maxStringBytes)
        if (strict && size === undefined) return refuse("string", "contains an unpaired UTF-16 surrogate")
        if (size === undefined || size > (limits.maxStringBytes ?? Infinity)) {
          return refuse(
            "string",
            strict ? `exceeds the ${limits.maxStringBytes}-byte string limit` : "contains unbounded or ill-formed text"
          )
        }
        return add(size) ? { ok: true, value, bytes } : byteFailure()
      }
      case "object":
        break
      default:
        return refuse("value", strict ? "must contain only JSON values" : `contains a non-JSON ${typeof value}`)
    }
    if (strict && depth >= limits.maxDepth) return refuse("depth", `exceeds the depth limit of ${limits.maxDepth}`)
    if (active.has(value)) {
      return refuse("cycle", strict ? "contains a cycle or repeated object reference" : "contains a cycle")
    }
    active.add(value)
    const finish = (output: ReadonlyArray<Json> | { readonly [key: string]: Json }): WalkResult => {
      Object.freeze(output)
      strict?.onContainer?.(output)
      return { ok: true, value: output, bytes }
    }
    try {
      const keys = strict ? Reflect.ownKeys(value) : undefined
      const prototype = strict ? Object.getPrototypeOf(value) : undefined
      if (Array.isArray(value)) {
        if (strict && prototype !== Array.prototype) return refuse("object", "must be an ordinary array")
        // `length` is always an own, non-configurable data property of an
        // array, and a Proxy that reports it as absent or as an accessor
        // throws rather than being believed, which lands in the `inspection`
        // refusal below. A Proxy may still report a bogus numeric value, so
        // the value itself is checked; its presence needs no check.
        const length = Object.getOwnPropertyDescriptor(value, "length")!.value
        if (!Number.isSafeInteger(length) || length < 0 || length > 0xffffffff) {
          return refuse("arrayLength", "has an invalid array length")
        }
        if (!countMembers(length)) return memberFailure()
        if (strict && (keys!.length !== length + 1 || !keys!.includes("length"))) {
          return refuse("arrayExtra", "must be dense and have no extra properties")
        }
        if (!add(2 + Math.max(0, length - 1))) return byteFailure()
        const output: Array<Json> = []
        const inspected: Array<unknown> = []
        if (strict) {
          for (let index = length - 1; index >= 0; index--) {
            const member = Object.getOwnPropertyDescriptor(value, String(index))
            if (member === undefined || !("value" in member) || !member.enumerable) {
              return refuse("arrayMember", "must be an enumerable data property", [...path, index])
            }
            inspected[index] = member.value
          }
        }
        for (let index = 0; index < length; index++) {
          const member = strict ? { value: inspected[index] } : Object.getOwnPropertyDescriptor(value, String(index))
          if (member === undefined || !("value" in member)) {
            return refuse("arrayMember", "contains a sparse or accessor array member", [...path, index])
          }
          const admitted = yield { value: member.value, depth: depth + 1, path: [...path, index] }
          if (!admitted.ok) return admitted
          output.push(admitted.value)
        }
        if (!strict) {
          for (const key of Reflect.ownKeys(value)) {
            if (key === "length") continue
            if (typeof key === "string" && /^(0|[1-9][0-9]*)$/.test(key)) {
              const index = Number(key)
              if (index < length && String(index) === key) continue
            }
            if (Object.getOwnPropertyDescriptor(value, key)?.enumerable) {
              return refuse("arrayExtra", "has an enumerable non-index array member")
            }
          }
        }
        return finish(output)
      }
      const recordPrototype = strict ? prototype : Object.getPrototypeOf(value)
      if (recordPrototype !== Object.prototype && recordPrototype !== null) {
        const native = strict?.native?.(value)
        if (native !== undefined) {
          if (!Number.isSafeInteger(native.bytes) || native.bytes < 0) {
            return refuse("bytes", "has an invalid native size")
          }
          return add(native.bytes) ? { ok: true, value: native.value as Json, bytes } : byteFailure()
        }
        return refuse("object", strict ? "must be an ordinary record" : "contains a non-plain object")
      }
      const ownKeys = keys ?? Reflect.ownKeys(value)
      if (strict && ownKeys.some((key) => typeof key === "symbol")) {
        return refuse("symbol", "must not contain symbol keys")
      }
      if (strict && !countMembers(ownKeys.length)) return memberFailure()
      const members: Array<readonly [string, unknown]> = []
      let structuralBytes = 2 + Math.max(0, ownKeys.length - 1)
      for (let index = 0; index < ownKeys.length; index++) {
        const key = ownKeys[index]!
        if (strict && typeof key === "string") {
          const at = [...path, strict.boundedText ? { key: index } : key]
          if (strict.boundedText && key.length > limits.maxKeyBytes!) {
            return refuse("key", `exceeds the ${limits.maxKeyBytes}-byte key limit`, at)
          }
          const keyBytes = encodedStringBytes(key)
          if (keyBytes === undefined) return refuse("key", "has an ill-formed property name", at)
          if (!strict.boundedText && reservedKeys.has(key)) {
            return refuse("key", "uses a reserved property name", [...path, key])
          }
          if (keyBytes > limits.maxKeyBytes!) {
            return refuse("key", `exceeds the ${limits.maxKeyBytes}-byte key limit`, at)
          }
          if (reservedKeys.has(key)) return refuse("key", "uses a reserved property name", [...path, key])
          structuralBytes += keyBytes + 1
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        if (strict && (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable)) {
          return refuse("accessor", "must be an enumerable data property", [...path, String(key)])
        }
        if (descriptor === undefined || !descriptor.enumerable) continue
        if (typeof key !== "string") return refuse("symbol", "contains an enumerable symbol")
        if (!("value" in descriptor)) return refuse("accessor", "contains an accessor", [...path, key])
        const count = members.length + 1
        if (!strict && (count > limits.maxMembers || totalMembers + count > (limits.maxTotalMembers ?? Infinity))) {
          return memberFailure()
        }
        if (!strict && preflightObjects) {
          if (nodes + count > limits.maxNodes) return nodeFailure()
          // Braces, commas, and a minimum empty key, colon, and one-byte value.
          if (bytes + 2 + (count - 1) + 4 * count > (limits.maxBytes ?? Infinity)) return byteFailure()
        }
        members.push([key, descriptor.value])
      }
      if (!strict && !countMembers(members.length)) return memberFailure()
      if (!add(strict ? structuralBytes : 2 + Math.max(0, members.length - 1))) return byteFailure()
      const output: Record<string, Json> = strict?.ordinaryRecords ? {} : Object.create(null)
      for (const [key, member] of members) {
        if (!strict) {
          const size = encodedStringBytes(key, limits.maxKeyBytes)
          if (size === undefined) return refuse("key", "contains an unbounded or ill-formed object key", [...path, key])
          if (!add(size + 1)) return byteFailure()
        }
        const admitted = yield { value: member, depth: depth + 1, path: [...path, key] }
        if (!admitted.ok) return admitted
        Object.defineProperty(output, key, { value: admitted.value, enumerable: true })
      }
      return finish(output)
    } catch {
      return refuse(
        "inspection",
        strict
          ? "could not be inspected without executing user code"
          : "cannot be inspected without executing object code"
      )
    } finally {
      if (!strict) active.delete(value)
    }
  }

  // Resume parents explicitly so configured depth limits do not depend on the
  // JavaScript call stack. Each generator retains only one container's work.
  const stack = [visit({ value: input, depth: 0, path: [] })]
  let result: WalkResult = { ok: true, value: null, bytes: 0 }
  while (stack.length > 0) {
    const next = stack[stack.length - 1]!.next(result)
    if (next.done) {
      result = next.value
      stack.pop()
    } else stack.push(visit(next.value))
  }
  return result
}

/**
 * Copies a JSON tree without invoking getters or `toJSON`, under explicit
 * byte, depth, node, and member limits. Proxy inspection traps still run.
 * Shared references are copied per occurrence; only ancestor cycles refuse.
 *
 * @param input - Parsed JSON or another inert candidate.
 * @param limits - Nonnegative resource bounds; root depth is zero.
 * @param options - Disable early object node/byte preflight with preflightObjects: false; final bounds still apply.
 * @returns A frozen detached copy and byte count, or a located refusal.
 *
 * @category validation
 * @since 1.0.0-rc.0
 */
export const admit = (
  input: unknown,
  limits: Limits,
  options: { readonly preflightObjects?: boolean } = {}
): Result => {
  const result = walk(input, limits, options.preflightObjects !== false)
  return result.ok ? result : { ...result, path: result.path.map(String) }
}

/**
 * Copies a strict JSON tree with cumulative bounds and stable value paths.
 * Rejects repeated object references, hidden members, reserved record keys,
 * symbols, and nonordinary arrays. Container callbacks run in postorder;
 * callbacks can observe earlier children before a later refusal. Native
 * adapters supply trusted leaves outside the JSON copy/freeze guarantee.
 *
 * @param input - Parsed JSON or another inert candidate.
 * @param limits - Required byte, node, text, container-depth, and cumulative member bounds.
 * @param options - Output prototypes, key diagnostics, container callbacks, and trusted native adapters.
 * @returns A copied tree or a JSON-style path and complaint; no byte count.
 *
 * @category validation
 * @since 1.0.0
 */
export const admitStrict = (
  input: unknown,
  limits: StrictLimits,
  options: StrictOptions = {}
): { readonly ok: true; readonly value: Json } | {
  readonly ok: false
  readonly path: string
  readonly complaint: string
} => {
  const result = walk(input, { ...limits, maxTotalMembers: limits.maxMembers }, false, options)
  if (result.ok) return { ok: true, value: result.value }
  let path = "$"
  for (const segment of result.path) {
    path += typeof segment === "number"
      ? `[${segment}]`
      : typeof segment === "object"
      ? `[key:${segment.key}]`
      : /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)
      ? `.${segment}`
      : `[${JSON.stringify(segment)}]`
  }
  return { ok: false, path, complaint: result.complaint }
}
