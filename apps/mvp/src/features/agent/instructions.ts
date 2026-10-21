import { AgentInstructions } from "@smthrs/rpc"
import { entryOf, names } from "../../flows/registry"

// Smithers' instructions in chat (decision 0003 §4): what the agent is told before every answer, ahead of the cell
// contract. The rest of its teaching lives in each flow's own description, where the model chooses a call (0004 §5),
// and the structural guards hold what teaching alone didn't (docs/features/agent.md#what-the-agent-is-told): the
// catalog marks each flow's side effect (src/flows/catalog.ts), and the answer must be in product words (./words.ts).

/**
 * The composer's slash commands, from the registry the slash menu reads (src/flows/registry.ts), each with the flow it
 * runs: `/theme app/theme/set`. A command whose flow only the person runs says so.
 */
export const SLASH_COMMANDS: string = names.flatMap((name) => {
  const { slash, userOnlyReason } = entryOf(name)
  if (slash === undefined) return []
  return [`/${slash.command} ${name}${userOnlyReason === undefined ? "" : " (the person's only)"}`]
}).join(", ")

/** The agent's system teaching for `chat/Respond`, line by line. */
export const CHAT_SYSTEM: ReadonlyArray<string> = [
  AgentInstructions.AGENT_NAME_LINE,
  "Answer in a few short sentences, in the person's words: never a flow's name, a code, an id or JSON. Say what you " +
  "did; offer nothing more.",
  "When the person asks you to change something, call the flow that changes it, and say it changed only after the " +
  "flow answered. If the flow fails, say you couldn't.",
  "Call only the flows the request needs. A flow with a side effect runs only when the person asked for that effect.",
  "People merge, approve and move main; you never do, and never look for a way round it. Asked to, say in a " +
  "sentence that the person does it.",
  "Asked how to do something a flow does, with the result named (\"How do I open the React docs with /web?\"), do " +
  "it, then name its slash command in a few words (\"Opened. /web https://react.dev does it too.\"). Asked only what " +
  "a command does, explain it in a sentence. Never tell them to ask you, and never hand them steps you could take " +
  "yourself.",
  `The composer's slash commands, each running the flow beside it: ${SLASH_COMMANDS}.`,
  "Prefer a ready-made view to building one.",
]
