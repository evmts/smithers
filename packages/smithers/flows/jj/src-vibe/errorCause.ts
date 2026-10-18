// C-1: diagnostic projection must catch hostile getters and coercion defects synchronously.
import { causeMessageLimit, type JjErrorCause } from "./Jj.vibe"
const truncateCauseField = (value: string): string =>
  value.length > causeMessageLimit ? `${value.slice(0, causeMessageLimit - 1)}…` : value

/**
 * Reads one string field of a failure. A getter that throws reads as absent:
 * the projection runs inside error handlers, and a throw there would turn a
 * typed `JjError` into a defect.
 */
const stringField = (record: Record<string, unknown> | undefined, key: string): string | undefined => {
  try {
    const value = record?.[key]
    return typeof value === "string" ? value : undefined
  } catch {
    return undefined
  }
}

/** `String(cause)`, or a fixed marker when the conversion throws. */
const render = (cause: unknown): string => {
  try {
    return String(cause)
  } catch {
    return "[unrenderable failure]"
  }
}

export const jjErrorCauseImpl = (cause: unknown): JjErrorCause => {
  const record = typeof cause === "object" && cause !== null ? cause as Record<string, unknown> : undefined
  const name = stringField(record, "name") ?? stringField(record, "_tag")
  const code = stringField(record, "code")
  const message = stringField(record, "message") ?? render(cause)
  return {
    ...(name === undefined ? {} : { name: truncateCauseField(name) }),
    ...(code === undefined ? {} : { code: truncateCauseField(code) }),
    message: truncateCauseField(message)
  }
}

