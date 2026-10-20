// A draft's rounds (decision 0014 §2): each round of `flow/new` runs as the execution `<draftId>:<round>`, so the tab
// that starts round 0, `flow/answer` that starts the next, and the engine that resumes one all name it the same way.
// Nothing here imports a library, so every side can.

/** `<draftId>:<round>`: the execution id a draft's round runs under. */
export const roundExecutionId = (draftId: string, round: number): string => `${draftId}:${round}`

const ROUND = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(0|[1-9][0-9]{0,5})$/i

/** The draft and round an execution id names, or none: an agent's call or a slash command starts a new draft. */
export const roundOf = (executionId: string): { readonly draftId: string; readonly round: number } | undefined => {
  const match = ROUND.exec(executionId)
  return match === null ? undefined : { draftId: match[1]!.toLowerCase(), round: Number(match[2]) }
}
