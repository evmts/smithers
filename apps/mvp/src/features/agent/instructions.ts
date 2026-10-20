import { AgentInstructions } from "@smthrs/rpc"

// Smithers' instructions in chat (decision 0003 §4): what the agent is told before every answer, ahead of the cell
// contract. The rest of its teaching lives in each flow's own description, where the model chooses a call (0004 §5).

/** The agent's system teaching for `chat/Respond`, line by line. */
export const CHAT_SYSTEM: ReadonlyArray<string> = [
  AgentInstructions.AGENT_NAME_LINE,
  "Answer briefly and plainly.",
  "When the person asks you to change something, call the flow that changes it, and say it changed only after the " +
  "flow answered. If the flow fails, say you couldn't.",
  "Prefer a ready-made view to building one.",
]
