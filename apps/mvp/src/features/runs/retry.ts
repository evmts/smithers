import { entryOf, type FlowName, names } from "../../flows/registry"

// Which runs Retry runs again (decision 0014 §2, docs/features/runs.md#acts): a run of a flow the agent may run, its
// own payload again. A flow only a person or the app starts is never retried with its own payload: an answer is retried
// by asking again (decision 0002), a draft's answers by answering again, a person's flow's pinned child through its
// `flow/run`. An act on a run (`run/*`) is not work.

/** Whether a run of `flow` may be retried. */
export const retryable = (flow: string): boolean =>
  !flow.startsWith("run/") &&
  (names as ReadonlyArray<string>).includes(flow) &&
  entryOf(flow as FlowName).userOnlyReason === undefined

/** Inspection values are bounded JSON; a clipped or withheld value cannot identify a retry. */
const decoded = (value: unknown): unknown => {
  if (typeof value !== "object" || value === null || !("text" in value) ||
    typeof value.text !== "string" || !("clipped" in value) || value.clipped !== false) return undefined
  try { return JSON.parse(value.text) } catch { return undefined }
}

/** A system TODO must start a fresh attempt through the stack, never replay its attempt payload. */
export const todoRetryPayload = (input: unknown): { readonly repo: string; readonly number: number } | undefined => {
  input = decoded(input)
  if (typeof input !== "object" || input === null) return undefined
  const value = input as Record<string, unknown>
  if (typeof value.repoId !== "string" || !/^github\/[^/]+\/[^/]+$/.test(value.repoId) ||
    typeof value.number !== "number" || !Number.isSafeInteger(value.number) || value.number < 1) return undefined
  return { repo: value.repoId.slice("github/".length), number: value.number }
}
export const failedTodoRun = (run: { readonly flowName: string; readonly status: string; readonly result: unknown }): boolean => {
  const result = decoded(run.result)
  return run.flowName === "todo" && (run.status === "failed" || run.status === "cancelled" ||
    (typeof result === "object" && result !== null && "state" in result && result.state === "failed"))
}
