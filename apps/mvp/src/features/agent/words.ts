import { Schema } from "effect"
import { names } from "../../flows/registry"

// Product words (docs/features/agent.md#product-words): what a person reads from the agent names things as the person
// sees them, never the machinery behind them. `chat/Respond` declares its answer as `ProductWords`, so an answer that
// names a flow, a cell, a failure's code or an id is handed back to the agent once to say it plainly, by the agent
// library's own output check (`@smthrs/agent`'s structured output), before the person reads it.

/** The cell contract's names and the codes a failed call reads, which mean nothing to a person. */
const MACHINERY = [
  "ctx.call",
  "ctx.done",
  "ctx.flows",
  "ctx.park",
  "flow_failed",
  "invalid_input",
  "unknown_flow",
  "run_completed",
  "rate_limited",
  "model_error",
  "quota_exceeded",
  "viewId",
  "draftId",
  "flowId",
  "runId",
  "answerId",
  "executionId",
  "invocationId",
]

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")

/**
 * A registered flow's name, or a machinery name, standing alone: not inside a path, a URL or a longer word, so
 * `octocat/Spoon-Knife` and `https://example.com/app/navigate` pass.
 */
const NAMED = new RegExp(
  `(?<![\\w./:-])(?:${[...names, ...MACHINERY].map(escape).join("|")})(?![\\w/-])`,
  "g",
)

/** A failure's kind as the agent's calls read it (`WebPageRefused`, `FlowNotFound`): a typed failure's tag. */
const FAILURE_TAG = /\b(?:[A-Z][a-z]+)+(?:Refused|Forbidden|Unavailable|NotFound|Denied|Taken|NotReady|OutOfTime)\b/g

/** An execution's, a view's or a draft's id. */
const ID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi

/** The internal names `text` shows a person, each once, in the order they first appear. */
export const internalNames = (text: string): ReadonlyArray<string> => {
  const found = [...text.matchAll(NAMED), ...text.matchAll(FAILURE_TAG), ...text.matchAll(ID)]
    .sort((a, b) => a.index - b.index)
    .map((match) => match[0])
  return [...new Set(found)]
}

/** What the agent is told when its answer named machinery: the names, and to say it in the person's words. */
export const plainly = (found: ReadonlyArray<string>): string =>
  `The person can't read ${found.map((name) => `"${name}"`).join(", ")}. Say the same thing in their words: what ` +
  `you did or couldn't do, with no flow names, codes or ids.`

/** An answer in product words: text that names no flow, cell, failure code or id. */
export const ProductWords = Schema.String.check(
  Schema.makeFilter((text: string) => {
    const found = internalNames(text)
    return found.length === 0 || plainly(found)
  }),
)
