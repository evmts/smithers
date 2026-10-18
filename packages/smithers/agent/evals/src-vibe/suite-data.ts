// VibeLang native throw lifts synchronous validation into Effect, changing the guarded clone boundary (findings A-1/B-4).
import { EvalError } from "./EvalError.vibe"
const cloneMessage = "Suite data must be structured-cloneable so the suite cannot change after it is validated"
const invalid = (message: string, path: string, cause?: unknown): EvalError => new EvalError({ code: "invalid_suite", message, path, ...(cause === undefined ? {} : { cause }) })
export const validateData = (value: unknown, path: string, seen = new WeakSet<object>()): void => {
  if (typeof value === "function" || typeof value === "symbol") throw invalid(cloneMessage, path)
  if (value === null || typeof value !== "object") return
  if (seen.has(value)) return
  seen.add(value)
  const array = Array.isArray(value)
  const prototype = Object.getPrototypeOf(value)
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
    throw invalid("Suite data must contain only plain objects, arrays, and structured-cloneable primitives", path)
  }
  for (const key of Reflect.ownKeys(value)) {
    if (array && key === "length") continue
    const childPath = typeof key === "string" && array && /^(0|[1-9]\d*)$/.test(key)
      ? `${path}[${key}]`
      : `${path}.${String(key)}`
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!
    if (typeof key === "symbol" || !descriptor.enumerable || !("value" in descriptor)) {
      throw invalid("Suite data properties must be enumerable string-keyed data fields", childPath)
    }
    validateData(descriptor.value, childPath, seen)
  }
}

