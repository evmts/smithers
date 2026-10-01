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
  // A status or an upstream message alone cannot establish an input fault.
  const input = WORKER_FAILURES.request_invalid
  if (refusal?.code === "request_invalid" && refusal.status === input.status && refusal.fault === input.fault &&
      (refusal.origin === "local" || refusal.origin === "worker")) {
    const failure = refusalUserFailure(refusalFromStored(refusal))
    return { ...failure, actions: [], detail: "" }
  }
  return { tag: "BrowserReadFailed", ...BROWSER_READ_FAILURE, detail: error }
}
