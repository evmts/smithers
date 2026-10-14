/**
 * What an app-agent turn asks of its author's own screen (spec §14.1.4,
 * mvp.md Appendix B.1). The host commits each request on the call's settled
 * frame; only the author's view state serves it, and only the author's
 * browser acts on it. A UI-only flow runs there and writes no shared state.
 * Any other flow is only asked for with its form: the request never confirms
 * it and never runs it.
 * @since 1.0.0
 */

import { z } from "zod"

/**
 * The Appendix B.1 rows the app agent may run for its author, with the payload
 * fields each declares. Rows that write shared state (`form.submit`,
 * `wiki.new-note`), retry a turn, or only answer data to a model
 * (`palette.recent`) are absent.
 * @since 1.0.0
 * @category constants
 */
export const UI_INSTRUCTION_FIELDS = {
  "card.dismiss": ["cardId"],
  "card.history.back": ["cardId"],
  "card.history.forward": ["cardId"],
  "change.facet": ["changeId", "facet"],
  "chat.reload": [],
  "flow.plan.select": ["cardId", "nodeId"],
  "flow.plan.tab": ["cardId", "tab"],
  "form.set": ["cardId", "field", "value"],
  "help": [],
  "history": ["id"],
  "prs.tab": ["cardId", "tab"],
  "runs.coding.select": ["sourceCard", "runId", "changeId"],
  "runs.graph.execution": ["sourceCard", "runId", "executionId"],
  "runs.graph.follow": ["sourceCard", "runId", "follow"],
  "runs.graph.select": ["sourceCard", "runId", "nodeId"],
  "runs.graph.tab": ["sourceCard", "runId", "tab"],
  "runs.steps": ["sourceCard", "runId"],
  "runs.trace.filter": ["sourceCard", "runId", "filter"],
  "runs.trace.live": ["sourceCard", "runId"],
  "runs.trace.select": ["sourceCard", "runId", "nodeId", "seq"],
  "runs.trace.view": ["sourceCard", "runId", "view", "state"],
  "search.changes": ["query"],
  "search.files": ["query"],
  "search.flows": ["query"],
  "search.history": ["query"],
  "search.issues": ["query"],
  "search.runs": ["query"],
  "search.wiki": ["query"],
  "storage.recovery": [],
  "theme": ["mode"],
  "wiki.backlinks": ["path"],
  "wiki.graph": ["path"],
  "wiki.open": ["path"],
  "wiki.space": ["space", "repo"],
  "wiki.view": ["view"]
} as const satisfies Readonly<Record<string, ReadonlyArray<string>>>

/**
 * One UI-only flow name.
 * @since 1.0.0
 * @category models
 */
export type UiInstructionCommand = keyof typeof UI_INSTRUCTION_FIELDS

/**
 * Whether a flow name is a UI-only flow the app agent may run for its author.
 * @since 1.0.0
 * @category guards
 */
export const isUiInstructionCommand = (name: string): name is UiInstructionCommand =>
  Object.prototype.hasOwnProperty.call(UI_INSTRUCTION_FIELDS, name)

/**
 * The flows the app agent may only ask for with their form (THE FORM LAW,
 * apps/app/AGENTS.md), with the fields a request may fill in. Each has an HTTP
 * door and confirms for an agent, so it is not a UI-only flow: the request
 * opens the form on the author's screen with these fields as its draft, and
 * the person's Submit runs the flow.
 * @since 1.0.0
 * @category constants
 */
export const FORM_INSTRUCTION_FIELDS = {
  "flow.new": ["description", "repo"]
} as const satisfies Readonly<Record<string, ReadonlyArray<string>>>

/**
 * One flow asked for with its form.
 * @since 1.0.0
 * @category models
 */
export type FormInstructionCommand = keyof typeof FORM_INSTRUCTION_FIELDS

/**
 * Whether a flow name is one the app agent may only ask for with its form.
 * @since 1.0.0
 * @category guards
 */
export const isFormInstructionCommand = (name: string): name is FormInstructionCommand =>
  Object.prototype.hasOwnProperty.call(FORM_INSTRUCTION_FIELDS, name)

const INSTRUCTION_FIELDS = { ...UI_INSTRUCTION_FIELDS, ...FORM_INSTRUCTION_FIELDS }

const INSTRUCTION_COMMANDS = Object.keys(INSTRUCTION_FIELDS) as [
  keyof typeof INSTRUCTION_FIELDS,
  ...Array<keyof typeof INSTRUCTION_FIELDS>
]

/**
 * The settled frame's `ui` field: the command beside its payload fields, so
 * `{ command: "theme", mode: "dark" }` is `/theme` with `{ mode: "dark" }`.
 * Every field is one the command declares. Monitor view state is the sole
 * structured payload; all other fields are scalars, and a form's draft is
 * text.
 * @since 1.0.0
 * @category schemas
 */
const monitorState = z.strictObject({
  selected: z.string().nullable().optional(),
  at: z.number().int().nonnegative().nullable().optional(),
  tab: z.enum(["run", "journal", "custom"]).nullable().optional()
})

/**
 * One UI instruction frame: the command a model asks the author's screen to run, or to ask for with its form.
 *
 * @since 1.0.0
 * @category schemas
 */
export const UiInstructionFrameSchema = z.object({ command: z.enum(INSTRUCTION_COMMANDS) })
  .catchall(z.union([z.string(), z.number(), z.boolean(), monitorState, z.null()]))
  .superRefine((frame, context) => {
    const declared: ReadonlyArray<string> = INSTRUCTION_FIELDS[frame.command]
    for (const field of Object.keys(frame)) {
      if (field !== "command" && isFormInstructionCommand(frame.command) && typeof frame[field] !== "string") {
        context.addIssue({ code: "custom", path: [field], message: "A form's draft is text" })
      }
      if (
        field !== "command" && (frame[field] === null || typeof frame[field] === "object") &&
        !(frame.command === "runs.trace.view" && field === "state")
      ) {
        context.addIssue({ code: "custom", path: [field], message: "Only monitor state carries a structured value" })
      }
      if (
        frame.command === "runs.trace.view" && field === "state" &&
        !monitorState.nullable().safeParse(frame[field]).success
      ) {
        context.addIssue({ code: "custom", path: [field], message: "Invalid monitor state" })
      }
      if (field !== "command" && !declared.includes(field)) {
        context.addIssue({ code: "custom", path: [field], message: `/${frame.command} declares no ${field}` })
      }
    }
  })

/**
 * The settled frame's `ui` field.
 * @since 1.0.0
 * @category models
 */
export type UiInstructionFrame = z.infer<typeof UiInstructionFrameSchema>
