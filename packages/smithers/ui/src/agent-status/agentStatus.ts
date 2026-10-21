/**
 * The agent's status as a person reads it (apps/mvp decision 0015): five
 * states, one word and one glyph each. `working` is brand, `waiting` is
 * quiet, `needs_you` is gold, `failed` is ember and `done` shows nothing in a
 * status bar. Framework-free, so a terminal frontend reads the same words.
 */

/** The agent's states. */
export type AgentState = "working" | "waiting" | "needs_you" | "failed" | "done";

/** Every state, most urgent first: the order a status bar picks from. */
export const AGENT_STATES: ReadonlyArray<AgentState> = ["needs_you", "failed", "working", "waiting", "done"];

/** The one word each state shows. */
export const AGENT_STATUS_WORDS: Readonly<Record<AgentState, string>> = Object.freeze({
  working: "Working",
  waiting: "Waiting",
  needs_you: "Needs you",
  failed: "Failed",
  done: "Done",
});

/** The glyph each state shows beside its word. */
export const AGENT_STATUS_GLYPHS: Readonly<Record<AgentState, string>> = Object.freeze({
  working: "◌",
  waiting: "○",
  needs_you: "◆",
  failed: "✕",
  done: "✓",
});

/** Whether `value` is one of the agent's states. */
export const isAgentState = (value: unknown): value is AgentState =>
  typeof value === "string" && (AGENT_STATES as ReadonlyArray<string>).includes(value);

/**
 * The tab's title while `count` of the person's runs need them: `(2) Smithers`,
 * or `base` alone when none do. A title that already carries a count is
 * counted afresh, never prefixed twice.
 */
export const agentStatusTitle = (base: string, count: number): string => {
  const plain = base.replace(/^\(\d+\) /, "");
  return count > 0 ? `(${Math.floor(count)}) ${plain}` : plain;
};
