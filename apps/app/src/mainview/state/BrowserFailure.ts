import { refusalFromStored } from "@smthrs/rpc/Refusal"
import { refusalUserFailure } from "@smthrs/rpc/RefusalCopy"
import { WORKER_FAILURES } from "@smthrs/rpc/WorkerFailureCodes"
import type { UserFailure, UserFailureCopy } from "@smthrs/rpc/UserFailure"
import type { Card } from "./AppState"

/** Old cards and unrecognized failures retain the opaque browser fallback. */
export const BROWSER_READ_FAILURE: UserFailureCopy = {
  fault: "infra", sentence: "That page couldn't be read. Not your fault.", actions: []
}

export const browserReadFailure = (
  { error, refusal }: Pick<Extract<Card, { kind: "browser" }>["payload"], "error" | "refusal">
): UserFailure | null => {
  if (error === undefined) return null
  // A status or upstream prose cannot establish an input or sign-in refusal.
  const code = refusal?.code
  const entry = code === "request_invalid" || code === "sign_in_required" || code === "session_expired"
    ? WORKER_FAILURES[code] : undefined
  if (entry !== undefined && refusal !== undefined && refusal.status === entry.status && refusal.fault === entry.fault &&
      (refusal.origin === "local" || refusal.origin === "worker")) {
    const failure = refusalUserFailure(refusalFromStored(refusal))
    return { ...failure, ...(code === "request_invalid" ? { actions: [] } : {}), detail: "" }
  }
  return { tag: "BrowserReadFailed", ...BROWSER_READ_FAILURE, detail: error }
}
