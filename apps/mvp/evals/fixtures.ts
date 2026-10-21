// Hand-built trials for the evals' unit tests: what the agent might have done, without running it.
import type { Call, Trial } from "./checks"

/** A trial that answered "Done." in one model call and did nothing else, with `overrides`. */
export const trial = (overrides: Partial<Trial> = {}): Trial => ({
  status: "done",
  failure: null,
  text: "Done.",
  calls: [],
  painted: [],
  navigated: [],
  views: [],
  asked: [],
  drafts: [],
  usage: [{ role: "agent", modelId: "qwen-3.8-27b", inputTokens: 6_000, outputTokens: 100, chargedTokens: 6_100 }],
  pending: [],
  ms: 1_000,
  ...overrides,
})

/** A call to `flow` with `input`, completed unless `status` says otherwise. */
export const call = (flow: string, input: unknown = {}, status = "completed"): Call => ({ flow, input, status })
