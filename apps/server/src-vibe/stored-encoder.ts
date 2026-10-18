// A-1: plain synchronous encoder intentionally throws, including on recursive inputs.
import { SnapshotFailure, base64 } from "./SealedSnapshot.vibe"
const failed = (code: string) => new SnapshotFailure({ code })
export const encodeStoredImpl = (value: unknown, seen = new Set<object>()): unknown => {
  if (value === null) return ["null"]
  if (value === undefined) return ["undefined"]
  if (typeof value === "string" || typeof value === "boolean") return [typeof value, value]
  if (typeof value === "number") return ["number", Object.is(value, -0) ? "-0" : String(value)]
  if (typeof value === "bigint") return ["bigint", String(value)]
  if (typeof value !== "object") throw failed("unsupported_storage_value")
  if (seen.has(value)) throw failed("cyclic_storage_value")
  seen.add(value)
  try {
    if (value instanceof Date) return ["date", value.toISOString()]
    if (value instanceof ArrayBuffer) return ["ArrayBuffer", base64(new Uint8Array(value))]
    if (ArrayBuffer.isView(value)) return [value.constructor.name, base64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))]
    if (Array.isArray(value)) return ["array", value.map(item => encodeStoredImpl(item, seen))]
    if (value instanceof Map) return ["map", [...value].map(([key, item]) => [encodeStoredImpl(key, seen), encodeStoredImpl(item, seen)])]
    if (value instanceof Set) return ["set", [...value].map(item => encodeStoredImpl(item, seen))]
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw failed("unsupported_storage_value")
    return ["object", Object.entries(value).map(([key, item]) => [key, encodeStoredImpl(item, seen)])]
  } finally { seen.delete(value) }
}

