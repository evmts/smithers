import type { DispatchFailed } from "../../flows/dispatch"

/** A terminal engine receipt that leaves an answer unable to finish. Transport loss and a tab closing are not one. */
export const answerCannotFinish = (error: Pick<DispatchFailed, "reason" | "refusal">): boolean =>
  error.reason === "interrupted" || error.refusal === "plan_changed" || error.refusal === "payload_changed"
