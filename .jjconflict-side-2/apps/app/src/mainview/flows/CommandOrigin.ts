/*
 * The DOOR one submission came through, fixed when the submission is made.
 *
 * A command's principal says WHO acts (state/ActorBindings.ts); it does not
 * say which of the agent's two doors acted, and the two want opposite
 * presentation:
 *
 *   - `tool` — the model's own tool call in THIS browser's agent loop
 *     (Commands.runForAgent / runAsAgent / executeForAgent). The returned
 *     value is what the model reads, and the person's screen is not painted
 *     for a read the model took (Search and Command Palette Spec §6).
 *   - `screen` — a request FOR the author's own screen: a hosted turn's UI
 *     instruction (SharedConversationSeam.applyInstructions, @smthrs/rpc
 *     UiInstruction), or a form/card control submitted as the agent. Nothing
 *     consumes the value, so a handler that only answers data has done
 *     nothing at all.
 *   - `person` — the person's own trigger: button, palette, slash.
 *
 * It is a per-invocation Effect service, not a mutable "current door": browser
 * promises have no async-local slot (ActorBindings), so ambient state would
 * race across concurrent commands. `Commands.invoke` provides it once per
 * invocation and `entries/Declare.ts` hands it to the handler, exactly as it
 * already does with the human's `CommandGesture`.
 *
 * [#3878](https://github.com/smithersai/smithers/issues/3878): without it,
 * `SearchSeam.search` could only read the principal, so every screen-only
 * `search.*` act a hosted turn offered its author ran, suppressed its card as
 * if it were the agent loop's own read, and returned a value nothing consumed.
 */
import { Context } from "effect"

/** Which door one submission came through. */
export type CommandOrigin = "person" | "tool" | "screen"

/**
 * The invoking door, when the invoker named one.
 *
 * Absent means "not stated": a handler must then fall back to the behaviour
 * its principal alone implies, so an unprovided door never adds a card or an
 * effect the agent loop's own read would not have.
 */
export const FlowOrigin = Context.Reference<CommandOrigin | undefined>("ui/flows/FlowOrigin", {
  defaultValue: () => undefined
})
