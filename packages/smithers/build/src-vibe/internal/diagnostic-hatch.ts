// VibeLang catch bypasses native proxy defects; bounded diagnostics must catch them.
import type { Diagnostic } from "./diagnostic.vibe"
const maximumLabelLength = 128
const maximumMessageLength = 2_048
const dataProperty = (value: object, name: string): unknown => {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, name) ??
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(value) ?? {}, name)
    return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined
  } catch {
    return undefined
  }
}

/** Trims one string to a bound, or reports that it was not usable text. */
const label = (value: unknown, limit: number): string | undefined =>
  typeof value === "string" && value !== "" ? value.slice(0, limit) : undefined

/**
 * Describes an arbitrary host failure as bounded JSON.
 *
 * `undefined` in, `undefined` out, so an error constructed without a cause
 * stays without one. Everything else answers with at least a name and a
 * message, because a diagnostic that can be absent for some failures is a
 * diagnostic nothing can be written against.
 *
 * One level of nesting is read and no more. Effect wraps a host `Error` in a
 * `PlatformError` whose own message names the operation and whose nested cause
 * carries the `errno` sentence, so a diagnostic that stopped at the outer
 * message would drop the `ENOENT` a reader needs. Going deeper would start
 * accumulating the whole chain, which is the unbounded retention this schema
 * exists to prevent.
 *
 * @private
 * @since 0.1.0
 */
export const diagnostic = (cause: unknown): Diagnostic | undefined => {
  if (cause === undefined) return undefined
  if (typeof cause !== "object" && typeof cause !== "function") {
    if (typeof cause === "symbol") return { name: "symbol", message: cause.toString().slice(0, maximumMessageLength) }
    return { name: typeof cause, message: String(cause).slice(0, maximumMessageLength) }
  }
  if (cause === null) return { name: "null", message: "null" }
  const name = label(dataProperty(cause, "name"), maximumLabelLength) ??
    label(dataProperty(cause, "_tag"), maximumLabelLength) ??
    "Error"
  const own = label(dataProperty(cause, "message"), maximumMessageLength)
  const nested = dataProperty(cause, "cause")
  const nestedObject = typeof nested === "object" && nested !== null ? nested : undefined
  const nestedMessage = nestedObject === undefined
    ? undefined
    : label(dataProperty(nestedObject, "message"), maximumMessageLength)
  const code = label(dataProperty(cause, "code"), maximumLabelLength) ??
    (nestedObject === undefined ? undefined : label(dataProperty(nestedObject, "code"), maximumLabelLength))
  const message = own === undefined
    ? nestedMessage ?? "unknown failure"
    : nestedMessage === undefined || own.includes(nestedMessage)
    ? own
    : `${own}: ${nestedMessage}`.slice(0, maximumMessageLength)
  return code === undefined ? { name, message } : { name, code, message }
}
