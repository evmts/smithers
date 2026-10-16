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
import { cutModelCredential, modelCredentialParts } from "@smthrs/rpc/ConfiguredModel"
import type { AgentChatMessage, AgentTurnFrame, AgentTurnUsage, StartAgentTurnRequest } from "@smthrs/rpc/NativeAgent"
import { Effect, Stream } from "effect"
import { createHostDiagnostics } from "./HostDiagnostics.ts"
import type { HostDiagnostics } from "./HostDiagnostics.ts"

/**
 * Provider route and output controls for one model turn.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export interface ModelTurnOptions {
  readonly modelId: string
  readonly outputTokenLimitSupported?: boolean
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
    system: [
      SystemPart.make({ text: composeAgentInstructions(turn.instructions, turn.context, turn.selectedContext) })
    ],
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

/**
 * Removes a configured credential even when provider chunks split it. The
 * concatenation of everything `push` and `finish` return never contains the
 * credential: when cutting one echo joins text already returned with text
 * still to come, the joining text is dropped too.
 *
 * @category utilities
 * @since 1.0.0-rc.0
 */
export class StreamingCredentialCutter {
  private pending = ""
  /** The end of the returned text, one character shorter than the longest secret part. */
  private returned = ""
  private readonly secret: string | undefined
  constructor(secret: string | undefined) {
    this.secret = secret
  }
  push(value: string): string {
    if (this.secret === undefined || this.secret === "") return value
    this.pending = cutModelCredential(this.pending + value, this.secret)
    let held = 0
    for (const part of modelCredentialParts(this.secret)) {
      for (let size = Math.min(this.pending.length, part.length - 1); size > held; size -= 1) {
        if (this.pending.endsWith(part.slice(0, size))) {
          held = size
          break
        }
      }
    }
    const emitted = this.pending.slice(0, this.pending.length - held)
    this.pending = this.pending.slice(this.pending.length - held)
    return this.release(emitted, this.secret)
  }
  finish(): string {
    if (this.secret === undefined) return this.pending
    const emitted = cutModelCredential(this.pending, this.secret)
    this.pending = ""
    return this.release(emitted, this.secret)
  }
  /**
   * Drops the start of `text` while it completes a secret part begun in the
   * returned text. Both sides are already free of whole parts, so any part
   * found from one part-length before the seam straddles it.
   */
  private release(text: string, secret: string): string {
    const parts = modelCredentialParts(secret)
    let kept = text
    for (let joined = true; joined;) {
      joined = false
      const seam = this.returned.length
      const combined = this.returned + kept
      for (const part of parts) {
        const index = combined.indexOf(part, Math.max(0, seam - part.length + 1))
        if (index !== -1) {
          kept = combined.slice(index + part.length)
          joined = true
          break
        }
      }
    }
    const longest = Math.max(0, ...parts.map((part) => part.length))
    const combined = this.returned + kept
    this.returned = combined.slice(Math.max(0, combined.length - (longest - 1)))
    return kept
  }
}

interface PendingToolCall {
  name: string
  arguments: string
}

/**
 * One tool call a host-owned leg ended with.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export interface HeldToolCall {
  readonly id: string
  readonly name: string
  readonly arguments: string
}

/**
 * How a host-owned leg ended: with tool calls the host runs before the next
 * leg, and the turn's token counts so far. No terminal frame was written.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export interface HeldToolCalls {
  readonly calls: ReadonlyArray<HeldToolCall>
  readonly usage: AgentTurnUsage | undefined
}

/**
 * A leg of a host-owned turn: its tool calls are held for the host rather
 * than written as `tool_call` frames for a renderer, and `usage` is what the
 * turn's earlier legs spent.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export interface HostLeg {
  readonly usage: AgentTurnUsage | undefined
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

/** Adds one leg's counts to the turn's: a done frame ending a host-owned turn states all of its calls. */
const addUsage = (turn: AgentTurnUsage | undefined, leg: AgentTurnUsage | undefined): AgentTurnUsage | undefined => {
  if (turn === undefined) return leg
  if (leg === undefined) return turn
  const total: AgentTurnUsage = {}
  for (const key of ["inputTokens", "outputTokens", "cachedInputTokens"] as const) {
    if (turn[key] !== undefined || leg[key] !== undefined) total[key] = (turn[key] ?? 0) + (leg[key] ?? 0)
  }
  return total
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
 * A host-owned leg (`host`) holds its tool calls and, when it ends in them,
 * returns them instead of writing the terminal frame.
 *
 * @category runners
 * @since 1.0.0-rc.0
 */
export const runModelTurn = <E>(
  model: Model.Model,
  turn: StartAgentTurnRequest,
  options: ModelTurnOptions,
  write: FrameWriter<E>,
  host?: HostLeg,
  diagnostics: HostDiagnostics = createHostDiagnostics()
): Effect.Effect<HeldToolCalls | undefined, Model.ModelFailure | ModelError | E> => {
  const text = new StreamingCredentialCutter(options.credential)
  const reasoning = new StreamingCredentialCutter(options.credential)
  const tools = new Map<string, PendingToolCall>()
  const held: Array<HeldToolCall> = []
  // The terminal is built when the stream ends, not at `settle`: a Chat
  // Completions provider (api.openai.com, Ollama) sends its counters in a
  // chunk after `finish_reason`, and the route ends the stream at that chunk.
  let settled: ModelEvent.Settle | undefined
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
        tools.set(event.id, { name: event.name, arguments: "" })
        return Effect.void
      case "tool-call-delta": {
        const pending = tools.get(event.id)
        if (pending === undefined) {
          return Effect.fail(
            new ModelError({ code: "invalid_provider_output", message: "tool delta preceded its start" })
          )
        }
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
        tools.delete(event.id)
        const call = {
          id: event.id,
          name: cutModelCredential(pending.name, options.credential ?? ""),
          arguments: cutModelCredential(event.arguments ?? pending.arguments, options.credential ?? "")
        }
        if (host !== undefined) {
          held.push(call)
          return Effect.void
        }
        return emit({
          runId: turn.runId,
          type: "tool_call",
          call_id: call.id,
          name: call.name,
          arguments: call.arguments
        })
      }
      case "settle":
        if (settled !== undefined) {
          return Effect.fail(new ModelError({ code: "invalid_provider_output", message: "model settled twice" }))
        }
        settled = event
        return Effect.gen(function*() {
          yield* emitDelta("reasoning", reasoning.finish())
          yield* emitDelta("text", text.finish())
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
  // The gap this closes: an upstream response can complete while the guest
  // consumes none of it. Counting what this process actually took off the
  // stream separates a provider that did not answer from a stream whose bytes
  // never reached the application.
  let consumed = 0
  let characters = 0
  const observe = (event: ModelEvent.ModelEvent): Effect.Effect<void, ModelError | E> => {
    consumed += 1
    if (consumed === 1) diagnostics.record("model_stream", "first_event", { kind: event.type })
    if (event.type === "text-delta" || event.type === "thinking-delta") characters += event.text.length
    return visit(event)
  }
  const endStream = diagnostics.begin("model_stream")
  // Writing a frame from inside this consumer stopped reading the provider's
  // response, and a commit the host issued in that state never answered:
  // production turn 2d851bdd attempted its first commit 1 ms after its first
  // event and was still waiting half an hour later, with the response's last
  // bytes unread, and turn 7e5fc00f spent 1 h 19 m there and committed
  // nothing. Buffering runs the provider's side in its own fiber, so the
  // response keeps draining while a frame is in flight and the host never
  // holds an unfinished response open waiting on its own journal.
  //
  // The capacity is unbounded deliberately. A finite buffer suspends its
  // producer once it fills, which is the same stall one buffer-length later,
  // and nothing bounds a turn's event count to a figure this host could pick:
  // `fastModelFallback` strips the output token limit for a route that does
  // not support one, so that provider answers at its own maximum, and
  // `SMITHERS_CHAT_MAX_TOKENS` admits a million. A journal that answers keeps
  // the queue near empty; what bounds its growth when one does not is the
  // callback deadline in `DurableChatProducer`, which ends an unanswered
  // attempt in seconds instead of accumulating a whole turn's response behind
  // it. The capacity and that deadline are one repair: neither holds alone.
  const buffered = Stream.buffer(model.stream(providerRequest(turn, options)), { capacity: "unbounded" })
  return Stream.runForEach(buffered, observe).pipe(
    Effect.flatMap((): Effect.Effect<HeldToolCalls | undefined, ModelError | E> => {
      if (settled === undefined) {
        return Effect.fail(
          new ModelError({ code: "invalid_provider_output", message: "model stream ended without settlement" })
        )
      }
      const total = addUsage(host?.usage, usage)
      if (host !== undefined && settled.stopReason === "tool-calls" && held.length > 0) {
        return Effect.succeed({ calls: held, usage: total })
      }
      return Effect.as(emit(doneFrame(turn.runId, settled, total)), undefined)
    }),
    Effect.ensuring(Effect.sync(() => endStream({ events: consumed, characters, settled: settled !== undefined })))
  )
}
