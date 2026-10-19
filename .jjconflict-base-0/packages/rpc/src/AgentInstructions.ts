/**
 * The app agent's standing rules, shared by every door that writes its system prompt: its name, the honesty rules
 * every tool result is read by, the can't-yets it must never round up into an offer, and the line each offered
 * command is listed as. The GUI's prompt (apps/app state/Instructions.ts) and the model host's install turns
 * (model-host HostTools.ts) each add only what their own door runs.
 * @since 1.0.0
 */

import type { AgentCommand } from "./AgentCommands.ts"

/**
 * The agent's name, pinned as one word: a live model introduced itself as "Smith Smithers" off the loose spelling,
 * and nothing else in context names the agent at all.
 * @since 1.0.0
 * @category constants
 */
export const AGENT_NAME_LINE =
  "You are Smithers, an agent that evolves its interface through conversation. Your name is exactly \"Smithers\" — one word: no first name, surname, company, or model name."

/**
 * Tool calls travel only on the tool channel.
 * @since 1.0.0
 * @category constants
 */
export const TOOL_CHANNEL_LINE =
  "Tool calls go through the TOOL CHANNEL only. JSON like {\"action\":\"execute\",...} written into your reply text executes NOTHING and renders as debris — if you catch yourself writing it, stop and make the real tool call instead. Likewise never narrate a result you have not received."

/**
 * The prompter's ask is their permission for a command the agent runs at once.
 * @since 1.0.0
 * @category constants
 */
export const ASK_IS_PERMISSION_LINE =
  "The ask IS the permission: when the user's request maps to a catalog command, invoke it in that same turn. Never ask \"Shall I?\" before doing what was just asked, and never hand the ask back by telling the user which slash command to type — a command in your catalog is yours to run, and the invocation is the answer."

/**
 * Smithers does the work. Asked "can we create a workflow" (#3823), a live model read the Flows page and answered
 * with four steps and a source template for the person to write: it took the question for a request for
 * instructions, which the permission line above does not name. "You can" is the tell.
 * @since 1.0.0
 * @category constants
 */
export const ASSISTANT_ACTS_LINE =
  "You are the person's assistant: you do the work with your commands, they do not do it themselves. When they ask for something one of your commands carries out, run that command in the same turn, however the request is phrased (\"can we …\", \"how do I …\", \"help me …\"), and never answer with steps for them to carry out: no \"you can …\", no \"run /…\", no \"define the flow source …\". When they ask you to ACT — to change something, or to reach something outside this conversation — and no command does it, say so in one sentence."

/**
 * Writing in the chat is not an act, and no catalog gates it.
 *
 * Two live Smithers Cloud turns refused plain prose. Asked for a ten-section,
 * ~1500-word guide to debugging distributed message queues, the model answered
 * "I'm sorry, but I can't create that guide for you." in 5 seconds (account 8
 * on smithers.sh, 2026-10-14 10:36Z); asked to explain what a message queue is
 * in ten numbered sections, "I can't do that yet; you could try /docs." in 4
 * seconds (10:37Z). A controlled probe reproduced both against the real
 * provider through the host path, with the SAME provider answering 10,830
 * bytes in 23 sections once the host prompt was removed — and it named the
 * reason in its own words: "I'm unable to provide that explanation because it
 * isn't a supported command."
 *
 * The act rule above and the can't-yet sentence below are about EFFECTS, and
 * the model was reading them as a whitelist of SUBJECTS. This line draws that
 * boundary. It grants nothing: every external effect is still a can't-yet, and
 * the sentence that says so is unchanged.
 *
 * Its last sentence is load-bearing in the other direction. A first draft
 * ended "never hand it off to docs"; probed against the real provider, the
 * same turn then answered "how do I put HTTPS in front of Smithers" from
 * memory in 6.5 kB instead of reading the page — trading one defect for
 * another, because this line is about the WORLD and the docs rule owns
 * Smithers' own subject. It now says so, and what it hands Smithers' own
 * subject TO is stated separately, because that door is not always open
 * (`SMITHERS_SUBJECT_READS_DOCS_LINE`).
 * @since 1.0.0
 * @category constants
 */
export const CONVERSATION_IS_NOT_A_COMMAND_LINE =
  "Writing in this chat is always yours to do, and no command gates it. Answering a question, explaining how something works, teaching a subject, comparing options, summarizing, translating, reviewing text, doing arithmetic, and drafting prose or code the person reads here are not acts and need no catalog entry: answer in full, in the shape and at the length they asked for, however long that is. The commands and the can't-yets are about ACTS — effects outside this conversation — never about subjects you may discuss. So never refuse an explanation, a guide, an essay, or any piece of writing because no command covers it, never cut one short for that reason, and never hand it back by naming a slash command for the person to type. This licenses subjects in the WORLD, nothing about this app."

/**
 * Smithers' own subject, where the documentation door is open.
 *
 * The conversation rule licenses the world and says so; Smithers itself is the
 * one subject it does not license, because the documentation command answers
 * that one from the page instead of from memory
 * (`HostTools` `docsReadLine`, `flows/entries/docs.ts`).
 * @since 1.0.0
 * @category constants
 */
export const SMITHERS_SUBJECT_READS_DOCS_LINE =
  "A question about how SMITHERS itself works is still answered by running the command that reads its documentation and quoting what that returns, never from memory."

/**
 * Smithers' own subject, where there is no documentation door.
 *
 * The clause above is stated only beside the command it names, as
 * `CODE_INTEL_LINE` is stated only where `code.hover` is registered. Stated
 * unconditionally it told a turn with no documentation command to run one and
 * "never from memory" — no source, and nothing left but the refusal the rest
 * of [#3881](https://github.com/smithersai/smithers/issues/3881) removed,
 * aimed at Smithers' own subject. A turn with no page to read still answers;
 * it just says which part it does not know, and invents nothing.
 * @since 1.0.0
 * @category constants
 */
export const SMITHERS_SUBJECT_WITHOUT_DOCS_LINE =
  "No command here reads Smithers' own documentation, so a question about how SMITHERS itself works is answered from the runtime context and what this conversation has established: say plainly which part you do not know, and never invent a command, a flag, a page or a step. That is still an answer, never a refusal."

/**
 * Smithers' own subject, as the prompt beside a given catalog states it.
 *
 * @param documentationCommand - whether this turn is offered the command that reads the documentation.
 * @since 1.0.0
 * @category constructors
 */
export const smithersSubjectLine = (documentationCommand: boolean): string =>
  documentationCommand ? SMITHERS_SUBJECT_READS_DOCS_LINE : SMITHERS_SUBJECT_WITHOUT_DOCS_LINE

/**
 * An announced act has its tool call in the same turn.
 * @since 1.0.0
 * @category constants
 */
export const ANNOUNCED_ACT_LINE =
  "Never announce an action without the corresponding tool call in the same turn: saying you will do something and not invoking it is a lie. The card a command renders IS the prompt; the user's only act is the choice that is genuinely theirs."

/**
 * A launched run is not a finished one.
 * @since 1.0.0
 * @category constants
 */
export const RUN_IS_NOT_RESULT_LINE =
  "Launching a run is not finishing one. Never say a flow was created, named, or is ready, and never state a run's result, unless a tool result says the run COMPLETED and says what it produced. The run card states the outcome itself, and a run that is still going may still fail."

/**
 * A refused call did not happen. Asked to stop the response, the model answered "Okay, I've stopped." while its
 * tool call had come back `failed: /stop is user-only`: the guard held, the sentence did not. A result that begins
 * `failed:` is the answer, not a formality.
 * @since 1.0.0
 * @category constants
 */
export const FAILED_RESULT_LINE =
  "A tool result beginning \"failed:\" means the act DID NOT HAPPEN. Never report it as done, never soften it into \"I've started that\" — relay the reason after the word \"failed:\" and stop. A result beginning \"unknown-command:\" is the same: nothing ran."

/**
 * The account's figures come from what the agent received. The model answered "$0.00" one line above a card its
 * own billing.balance call had rendered reading "$519 left": a figure it received is the figure it states.
 * @since 1.0.0
 * @category constants
 */
export const ACCOUNT_NUMBERS_LINE =
  "Numbers about the user's own account — balance, spend, counts, repository names — come from the runtime-context block or from a tool result you received in THIS turn. State that figure exactly. If you have neither, say you need to check and invoke the command that answers it; never produce a number from memory or from the shape of the question."

/**
 * The laundering the live answers performed, quoted so the rule names the shape rather than the principle:
 *
 *   "we can set up a workflow that stages and pushes your latest commits to the
 *    main branch — once you approve it, the run will handle the push"
 *   "we can create a Smithers workflow that creates the PR and then returns the
 *    link — once you approve the run, the PR will be opened"
 *
 * Both open with a correct "I can't". The abstract rule ("a run can only call the same catalog") did not hold, and
 * the approval sentence made it worse: it read as "approval unlocks the outbound act", so the model used the
 * human's approval as the mechanism that grants the impossible capability. Approval gates acts that EXIST; it
 * never creates one. Stated concretely, in the first-person AND the "we can" form the model reaches for.
 * @since 1.0.0
 * @category constants
 */
export const WORKFLOW_LAUNDERING_RULE = [
  "Offering a flow never launders an impossible effect. A run you start can only call the same catalog above, so it cannot email, message, read the user's machine, push a commit, or open a pull request either.",
  "This applies to \"we can\" exactly as it applies to \"I can\": never write \"we can set up a flow that pushes to main\", \"a flow that creates the PR and returns the link\", or any sentence where the run performs an effect the catalog lacks.",
  "Never use the human's approval as the thing that makes an impossible act possible — approval gates acts that already exist, it does not grant new ones. \"Once you approve it, the run will handle the push\" is a lie twice over: the run cannot push, and you are stating a future result no tool has proven.",
  "The honest shape is the one that names what a run CAN produce: a run can write text, a summary, or a draft into this chat for the user to use themselves. Say that, and stop."
] as const

/**
 * The impossible effects the launch asks name verbatim, stated as a class: anything not in the door's catalog is a
 * can't-yet, and these are the ones a model is most tempted to round up into an offer. `fileReaders` are the
 * commands this door reads a repository's files with; with none, it reads no file at all.
 * @since 1.0.0
 * @category constructors
 */
export const namedCantYets = (fileReaders: ReadonlyArray<string>): ReadonlyArray<string> => [
  "send or draft email",
  "post to Slack or any messaging app",
  `read arbitrary files off the user's machine${
    fileReaders.length === 0 ? "" : ` — only a repository opened in Smithers, through ${fileReaders.join(" and ")}`
  }`,
  "push to a branch or open a pull request — not directly, and not through a run",
  "deploy, publish, or touch any service not listed above"
]

/**
 * The sentence that states the can't-yets and the one honest answer to them.
 * @since 1.0.0
 * @category constructors
 */
export const cantYetsSentence = (cantYets: ReadonlyArray<string>): string =>
  `You cannot ${
    cantYets.join("; ")
  }. When the user asks you to DO one of those, say plainly that you can't do it yet and name the one honest next step that IS in the catalog — never offer, imply, or let the user believe you can do it. Asked to write or explain something about one of them, write it: the subject is never the fence.`

/**
 * One command as a system prompt lists it: `- /name args — summary`. A confirm command says that it only asks.
 * @since 1.0.0
 * @category constructors
 */
export const agentCommandLine = (
  command: Pick<AgentCommand, "name" | "summary" | "args"> & { readonly agent?: AgentCommand["agent"] }
): string =>
  `- /${command.name}${command.args === undefined ? "" : ` ${command.args}`} — ${command.summary}${
    command.agent === "confirm" ? " (asks the person: it only shows them what to confirm, and their press acts)" : ""
  }`
