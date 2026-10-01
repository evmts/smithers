/**
 * Provider-neutral chat leg execution for every trusted Smithers host.
 *
 * @since 1.0.0-rc.0
 */

import type * as Model from "@smthrs/model/Model"
import { ModelError } from "@smthrs/model/ModelError"
import type * as ModelEvent from "@smthrs/model/ModelEvent"
import {
  Message,
  ModelRequest,
  SystemPart,
  ToolCallPart,
  ToolDefinition,
  ToolResultPart
} from "@smthrs/model/ModelRequest"
import type { JsonObject, Message as ModelMessage, ModelRequest as Request } from "@smthrs/model/ModelRequest"
import { composeAgentInstructions } from "@smthrs/rpc/AgentContext"
import type { AgentChatMessage, AgentTurnFrame, AgentTurnUsage, StartAgentTurnRequest } from "@smthrs/rpc/NativeAgent"
import { Effect, Stream } from "effect"
import { MAX_MODEL_OUTPUT_BYTES, StreamTooLarge } from "./ModelHostError.ts"

/**
 * Provider route and output controls for one model turn.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export interface ModelTurnOptions {
  readonly modelId: string
  readonly maxTokens?: number
  readonly credential?: string
}
/**
 * Commits one renderer-compatible frame.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export type FrameWriter<E> = (frame: AgentTurnFrame) => Effect.Effect<void, E>

const appendWireMessage = (messages: Array<ModelMessage>, item: AgentChatMessage): void => {
  if ("role" in item) {
    messages.push(item.role === "user" ? Message.user(item.content) : Message.assistant(item.content))
    return
  }
  if (item.type === "function_call") {
    const call = ToolCallPart.make({ id: item.call_id, name: item.name, arguments: item.arguments })
    const prior = messages.at(-1)
    if (prior?.role === "assistant" && prior.stopReason === "tool-calls") {
      messages[messages.length - 1] = Message.assistant([...prior.content, call], { stopReason: "tool-calls" })
    } else messages.push(Message.assistant(call, { stopReason: "tool-calls" }))
    return
  }
  const result = ToolResultPart.make({ toolCallId: item.call_id, content: item.output })
  const prior = messages.at(-1)
  if (prior?.role === "tool") messages[messages.length - 1] = Message.tool([...prior.content, result])
  else messages.push(Message.tool(result))
}

/**
 * Projects the renderer request into the canonical provider model request.
 *
 * @category conversions
 * @since 1.0.0-rc.0
 */
export const providerRequest = (turn: StartAgentTurnRequest, options: ModelTurnOptions): Request => {
  const messages: Array<ModelMessage> = []
  for (const item of turn.messages) appendWireMessage(messages, item)
  return ModelRequest.make({
    modelId: options.modelId,
    system: [SystemPart.make({ text: composeAgentInstructions(turn.instructions, turn.context) })],
    messages,
    tools: (turn.tools ?? []).map((tool) =>
      ToolDefinition.make({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as JsonObject
      })
    ),
    params: { ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }) }
  })
}

/** The shared cap applies before provider output is retained or emitted. */
class OutputBudget {
  private bytes = 0
  consume(value: string): void {
    this.bytes += Buffer.byteLength(value, "utf8")
    if (this.bytes > MAX_MODEL_OUTPUT_BYTES) throw new StreamTooLarge({ limitBytes: MAX_MODEL_OUTPUT_BYTES })
  }
}

const CUTTER_BLOCK_SIZE = 4096
interface CutterBlock {
  readonly chars: Uint16Array
  readonly matches: Uint32Array
  readonly starts: Uint32Array
}

/**
 * Removes a configured credential, including nested echoes split across chunks.
 *
 * @category utilities
 * @since 1.0.0-rc.0
 */
export class StreamingCredentialCutter {
  private readonly fallback: Uint32Array
  private readonly blocks = new Map<number, CutterBlock>()
  private base = 0
  private end = 0
  private readonly secret: string | undefined
  private readonly budget: OutputBudget
  constructor(secret: string | undefined, budget = new OutputBudget()) {
    this.secret = secret
    this.budget = budget
    if (secret !== undefined && Buffer.byteLength(secret, "utf8") > MAX_MODEL_OUTPUT_BYTES) {
      throw new StreamTooLarge({ limitBytes: MAX_MODEL_OUTPUT_BYTES })
    }
    this.fallback = new Uint32Array(secret?.length ?? 0)
    if (secret !== undefined) {
      for (let i = 1, matched = 0; i < secret.length; i += 1) {
        while (matched > 0 && secret[i] !== secret[matched]) matched = this.fallback[matched - 1]!
        if (secret[i] === secret[matched]) matched += 1
        this.fallback[i] = matched
      }
    }
  }
  private block(index: number): CutterBlock {
    const key = Math.floor(index / CUTTER_BLOCK_SIZE)
    let block = this.blocks.get(key)
    if (block === undefined) {
      block = {
        chars: new Uint16Array(CUTTER_BLOCK_SIZE),
        matches: new Uint32Array(CUTTER_BLOCK_SIZE),
        starts: new Uint32Array(CUTTER_BLOCK_SIZE)
      }
      this.blocks.set(key, block)
    }
    return block
  }
  private release(until: number): string {
    const parts: Array<string> = []
    while (this.base < until) {
      const key = Math.floor(this.base / CUTTER_BLOCK_SIZE)
      const offset = this.base % CUTTER_BLOCK_SIZE
      const count = Math.min(until - this.base, CUTTER_BLOCK_SIZE - offset)
      parts.push(String.fromCharCode(...this.block(this.base).chars.subarray(offset, offset + count)))
      this.base += count
      if (this.base % CUTTER_BLOCK_SIZE === 0) this.blocks.delete(key)
    }
    if (this.base === this.end) {
      // Reuse one block across short nonmatching prefixes instead of allocating
      // three typed arrays for every ordinary word that starts like the key.
      const reusable = this.blocks.values().next().value
      this.blocks.clear()
      if (reusable !== undefined) this.blocks.set(0, reusable)
      this.base = this.end = 0
    }
    return parts.join("")
  }
  push(value: string): string {
    this.budget.consume(value)
    if (this.secret === undefined || this.secret === "") return value
    const emitted: Array<string> = []
    for (let i = 0; i < value.length; i += 1) {
      if (this.end === this.base) {
        const next = value.indexOf(this.secret[0]!, i)
        if (next === -1) {
          emitted.push(value.slice(i))
          break
        }
        if (next > i) emitted.push(value.slice(i, next))
        i = next
      }
      const code = value.charCodeAt(i)
      let matched = this.end === this.base ? 0 : this.block(this.end - 1).matches[(this.end - 1) % CUTTER_BLOCK_SIZE]!
      while (matched > 0 && code !== this.secret.charCodeAt(matched)) matched = this.fallback[matched - 1]!
      if (code === this.secret.charCodeAt(matched)) matched += 1
      if (matched === this.secret.length) {
        // Roll back the deleted echo, restoring the prefix state before it.
        // An outer echo can now finish without rescanning the retained prefix.
        this.end -= this.secret.length - 1
        continue
      }
      const block = this.block(this.end)
      const offset = this.end % CUTTER_BLOCK_SIZE
      block.chars[offset] = code
      block.matches[offset] = matched
      this.end += 1
      const before = this.end - matched
      // The longest prefix suffix is enough: proper prefixes are prefix-closed.
      // Its saved start includes every earlier prefix a future deletion can join.
      block.starts[offset] = matched === 0 ? this.end : before === this.base ?
        this.base
        : this.block(before - 1).starts[(before - 1) % CUTTER_BLOCK_SIZE]!
      if (matched === 0) emitted.push(this.release(this.end))
    }
    const safe = this.end === this.base
      ? this.base
      : this.block(this.end - 1).starts[(this.end - 1) % CUTTER_BLOCK_SIZE]!
    emitted.push(this.release(safe))
    return emitted.join("")
  }
  finish(): string {
    // An overflow on either channel must never flush a retained credential prefix.
    this.budget.consume("")
    return this.release(this.end)
  }
}

interface PendingToolCall {
  name: string
  arguments: string
}
const usageCount = (value: number | undefined): number | undefined =>
  value === undefined || !Number.isFinite(value) || value < 0 ? undefined : Math.round(value)

/**
 * Folds one `usage` event into the call's running counts. A provider may
 * report input and output in separate events, so a later event overrides only
 * the counters it carries.
 */
const mergeUsage = (current: AgentTurnUsage | undefined, event: ModelEvent.UsageEvent): AgentTurnUsage | undefined => {
  const next: AgentTurnUsage = { ...current }
  const inputTokens = usageCount(event.inputTokens)
  const outputTokens = usageCount(event.outputTokens)
  const cachedInputTokens = usageCount(event.cachedInputTokens)
  if (inputTokens !== undefined) next.inputTokens = inputTokens
  if (outputTokens !== undefined) next.outputTokens = outputTokens
  if (cachedInputTokens !== undefined) next.cachedInputTokens = cachedInputTokens
  return Object.keys(next).length === 0 ? undefined : next
}

const doneFrame = (runId: string, event: ModelEvent.Settle, usage: AgentTurnUsage | undefined): AgentTurnFrame => {
  const counted = usage === undefined ? {} : { usage }
  if (event.stopReason === "tool-calls") return { runId, type: "done", reason: "tool_call", ...counted }
  if (event.stopReason === "aborted") return { runId, type: "done", reason: "cancelled", ...counted }
  // A reply cut off at the output token limit is not a finished reply. The
  // error keeps the truncation visible to the reader instead of passing it
  // off as a normal stop.
  if (["error", "content-filter", "unknown", "length"].includes(event.stopReason)) {
    return { runId, type: "done", reason: "stop", error: `model stopped: ${event.stopReason}`, ...counted }
  }
  return { runId, type: "done", reason: "stop", ...counted }
}

/**
 * Runs one provider stream and emits the established renderer frame contract.
 *
 * @category runners
 * @since 1.0.0-rc.0
 */
export const runModelTurn = <E>(
  model: Model.Model,
  turn: StartAgentTurnRequest,
  options: ModelTurnOptions,
  write: FrameWriter<E>
): Effect.Effect<void, Model.ModelFailure | ModelError | StreamTooLarge | E> => {
  const budget = new OutputBudget()
  const text = new StreamingCredentialCutter(options.credential, budget)
  const reasoning = new StreamingCredentialCutter(options.credential, budget)
  const cut = (value: string): string => {
    const cutter = new StreamingCredentialCutter(options.credential)
    return cutter.push(value) + cutter.finish()
  }
  const containsCredential = (value: string): boolean =>
    options.credential !== undefined && options.credential !== "" && value.includes(options.credential)
  const safeArguments = (raw: string): string => {
    const value = cut(raw)
    if (options.credential === undefined || options.credential === "") return value
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return value
    } // Keep the existing malformed-argument handling downstream.
    const inspect = (root: unknown, strings: boolean): void => {
      const pending: Array<unknown> = [root]
      while (pending.length > 0) {
        const item = pending.pop()
        if (typeof item === "string") {
          if (strings && containsCredential(item)) {
            throw new ModelError({ code: "invalid_provider_output", message: "invalid tool call arguments" })
          }
        } else if (Array.isArray(item)) {
          for (const child of item) pending.push(child)
        } else if (item !== null && typeof item === "object") {
          for (const [key, child] of Object.entries(item)) {
            // Keys are identities too: cutting one could merge distinct inputs.
            if (containsCredential(key)) {
              throw new ModelError({ code: "invalid_provider_output", message: "invalid tool call arguments" })
            }
            pending.push(child)
          }
        }
      }
    }
    inspect(parsed, false)
    if (value !== raw) {
      try {
        parsed = JSON.parse(value)
      } catch {
        throw new ModelError({ code: "invalid_provider_output", message: "invalid tool call arguments" })
      }
    }
    // A JSON escape can hide a credential from the literal cutter and reveal it
    // to the tool's decoder. Refuse that call; reserializing unrelated numbers
    // or fields here would change the provider's ordinary arguments.
    inspect(parsed, true)
    return value
  }
  const tools = new Map<string, PendingToolCall>()
  let settled = false
  let usage: AgentTurnUsage | undefined
  const emit = (frame: AgentTurnFrame): Effect.Effect<void, E> => write(frame)
  const emitDelta = (kind: "text" | "reasoning", value: string): Effect.Effect<void, E> =>
    value === "" ? Effect.void : emit({ runId: turn.runId, type: "delta", kind, text: value })
  const visit = (event: ModelEvent.ModelEvent): Effect.Effect<void, ModelError | E> => {
    switch (event.type) {
      case "text-delta":
        return emitDelta("text", text.push(event.text))
      case "thinking-delta":
        return emitDelta("reasoning", reasoning.push(event.text))
      case "tool-call-start":
        budget.consume(event.id)
        budget.consume(event.name)
        // IDs correlate a later tool result; rewriting one would change the call.
        if (containsCredential(event.id)) {
          return Effect.fail(
            new ModelError({ code: "invalid_provider_output", message: "invalid tool call identifier" })
          )
        }
        tools.set(event.id, { name: event.name, arguments: "" })
        return Effect.void
      case "tool-call-delta": {
        const pending = tools.get(event.id)
        if (pending === undefined) {
          return Effect.fail(
            new ModelError({ code: "invalid_provider_output", message: "tool delta preceded its start" })
          )
        }
        budget.consume(event.arguments)
        pending.arguments += event.arguments
        return Effect.void
      }
      case "tool-call-end": {
        const pending = tools.get(event.id)
        if (pending === undefined) {
          return Effect.fail(
            new ModelError({ code: "invalid_provider_output", message: "tool end preceded its start" })
          )
        }
        if (event.arguments !== undefined) budget.consume(event.arguments)
        tools.delete(event.id)
        return emit({
          runId: turn.runId,
          type: "tool_call",
          call_id: event.id,
          name: cut(pending.name),
          arguments: safeArguments(event.arguments ?? pending.arguments)
        })
      }
      case "settle":
        if (settled) {
          return Effect.fail(new ModelError({ code: "invalid_provider_output", message: "model settled twice" }))
        }
        settled = true
        return Effect.gen(function*() {
          yield* emitDelta("reasoning", reasoning.finish())
          yield* emitDelta("text", text.finish())
          yield* emit(doneFrame(turn.runId, event, usage))
        })
      case "usage":
        usage = mergeUsage(usage, event)
        return Effect.void
      case "retry":
        // A retried call starts over; the abandoned attempt's counts are not this call's.
        usage = undefined
        return Effect.void
      default:
        return Effect.void
    }
  }
  return Stream.runForEach(
    model.stream(providerRequest(turn, options)),
    (event) =>
      Effect.suspend((): Effect.Effect<void, ModelError | StreamTooLarge | E> => {
        try {
          return visit(event)
        } catch (error) {
          return error instanceof StreamTooLarge || error instanceof ModelError ? Effect.fail(error) : Effect.die(error)
        }
      })
  ).pipe(
    Effect.flatMap(() =>
      settled
        ? Effect.void
        : Effect.fail(
          new ModelError({ code: "invalid_provider_output", message: "model stream ended without settlement" })
        )
    )
  )
}
