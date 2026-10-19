// A-2/E-4/E-7 (EK1003, EK4402): the Claude Code session machinery is async
// (AsyncGenerator input, awaited SDK iterators), uses timers and the Claude
// Agent SDK's Promise API, so it stays TypeScript. ClaudeCode.vibe keeps the
// Effect half (the Model's stream and the route's prepare) and calls
// `answer` through a `try` boundary, as ClaudeCode.ts's Effect.tryPromise did.
// Every line below is ClaudeCode.ts's own; only `make`'s Effect wrapper moved.
import * as Sdk from "@anthropic-ai/claude-agent-sdk"
import * as CanonicalJson from "@smthrs/model/CanonicalJson"
import { ModelError, type ModelErrorCode } from "@smthrs/model/ModelError"
import type { ModelEvent, Usage } from "@smthrs/model/ModelEvent"
import * as ModelRequest from "@smthrs/model/ModelRequest"
import { Schema } from "effect"
import { tmpdir } from "node:os"
import { codexEnvironment } from "../Agents.ts"
import type { Options, Query, Start } from "./ClaudeCode.vibe"

const effort: Readonly<Record<ModelRequest.ReasoningEffort, Sdk.EffortLevel>> = {
  none: "low",
  minimal: "low",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max"
}

const errorCodes: Readonly<Record<Sdk.SDKAssistantMessageError, ModelErrorCode>> = {
  authentication_failed: "authentication",
  oauth_org_not_allowed: "authentication",
  account_on_hold: "authentication",
  verification_required: "authentication",
  cloud_credential_error: "authentication",
  billing_error: "quota_exceeded",
  rate_limit: "rate_limited",
  overloaded: "provider_internal",
  server_error: "provider_internal",
  invalid_request: "invalid_request",
  model_not_found: "invalid_request",
  max_output_tokens: "invalid_provider_output",
  unknown: "unknown"
}

const statusCode = (status: number | undefined): ModelErrorCode =>
  status === 401 || status === 403
    ? "authentication"
    : status === 429
    ? "rate_limited"
    : status === 400
    ? "invalid_request"
    : "provider_internal"

interface Session {
  readonly messages: AsyncIterator<Sdk.SDKMessage>
  /** The model, system prompt and parameters the session was started with. */
  readonly identity: string
  /** The last request's messages, canonical, and the whole request. */
  seen: ReadonlyArray<string>
  last: string
  answer: ReadonlyArray<ModelEvent>
  /** Claude Code's running cost estimate for the session, in USD, as of the last turn. */
  spentUsd: number
  /** Sends Claude the next user turn. */
  readonly send: (text: string) => void
  /** Stops the idle clock while a turn runs, and restarts it once the session waits. */
  readonly rest: (idle: boolean) => void
  readonly close: () => void
}

type Encoded = typeof ModelRequest.ModelRequest.Encoded

/**
 * The request as plain JSON: decoded first, so a plain object is accepted,
 * and with absent optional fields dropped rather than kept as `undefined`.
 */
export const encode = (request: ModelRequest.ModelRequest): Encoded => {
  try {
    const decoded = Schema.decodeUnknownSync(ModelRequest.ModelRequest)(request)
    return JSON.parse(JSON.stringify(Schema.encodeSync(ModelRequest.ModelRequest)(decoded)))
  } catch {
    throw new ModelError({ code: "invalid_request", message: "Model request failed Schema validation" })
  }
}

const textOf = (message: ModelRequest.Message): string =>
  message.role === "tool"
    ? message.content.map((part) => part.content).join("\n\n")
    : message.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n\n")

/** One prompt from a history: plain when it is only the user's, labeled by role otherwise. */
const flatten = (messages: ReadonlyArray<ModelRequest.Message>): string =>
  messages.every((message) => message.role === "user")
    ? messages.map(textOf).join("\n\n")
    : messages.map((message) => `<${message.role}>\n${textOf(message)}\n</${message.role}>`).join("\n\n")

/** The messages a request adds after the last one and its reply, when it extends it. */
const extension = (
  seen: ReadonlyArray<string>,
  messages: ReadonlyArray<string>,
  request: ModelRequest.ModelRequest
): ReadonlyArray<ModelRequest.Message> | undefined => {
  if (messages.length < seen.length + 2 || seen.some((message, index) => message !== messages[index])) return undefined
  if (request.messages[seen.length]!.role !== "assistant") return undefined
  const added = request.messages.slice(seen.length + 1)
  return added.some((message) => message.role === "assistant") ? undefined : added
}

const usageOf = (raw: {
  readonly input_tokens?: number | null
  readonly output_tokens?: number | null
  readonly cache_read_input_tokens?: number | null
  readonly cache_creation_input_tokens?: number | null
}): Usage => {
  const read = raw.cache_read_input_tokens ?? undefined
  const written = raw.cache_creation_input_tokens ?? undefined
  const input = raw.input_tokens ?? undefined
  const inputTokens = input === undefined && read === undefined && written === undefined
    ? undefined
    : (input ?? 0) + (read ?? 0) + (written ?? 0)
  const outputTokens = raw.output_tokens ?? undefined
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(read === undefined ? {} : { cachedInputTokens: read }),
    ...(written === undefined ? {} : { cacheWriteTokens: written }),
    ...(inputTokens === undefined && outputTokens === undefined
      ? {}
      : { totalTokens: (inputTokens ?? 0) + (outputTokens ?? 0) })
  }
}

/**
 * Reads one turn: its text, then its usage and why it stopped, from the turn's
 * result. The turn's cost is its share of the session's running total, so a
 * seat whose alias the rate card cannot price (`haiku`) still has a price; a
 * total that went backwards prices nothing.
 */
const read = async (
  messages: AsyncIterator<Sdk.SDKMessage>,
  ledger: { spentUsd: number }
): Promise<ReadonlyArray<ModelEvent>> => {
  let text = ""
  let responseId: string | undefined
  let failure: ModelError | undefined
  for (;;) {
    const next = await messages.next()
    if (next.done === true) throw new ModelError({ code: "transport", message: "Claude Code exited mid-answer" })
    const message = next.value
    if (message.type === "assistant" && message.parent_tool_use_id === null) {
      responseId = message.message.id
      if (message.error !== undefined) {
        failure = new ModelError({ code: errorCodes[message.error], message: `Claude Code: ${message.error}` })
      }
      for (const block of message.message.content) if (block.type === "text") text += block.text
    } else if (message.type === "result") {
      if (failure !== undefined) throw failure
      if (message.subtype !== "success") {
        throw new ModelError({ code: "provider_internal", message: message.errors.join("\n") })
      }
      if (message.is_error) {
        const status = message.api_error_status ?? undefined
        throw new ModelError({
          code: statusCode(status),
          message: message.result,
          ...(status === undefined ? {} : { httpStatus: status })
        })
      }
      const costUsd = message.total_cost_usd - ledger.spentUsd
      ledger.spentUsd = message.total_cost_usd
      return [
        { type: "text-start", id: "text" },
        { type: "text-delta", id: "text", text },
        { type: "text-end", id: "text" },
        { type: "usage", ...usageOf(message.usage), ...(costUsd >= 0 ? { costUsd } : {}) },
        {
          type: "settle",
          stopReason: message.stop_reason === "max_tokens" ? "length" : "stop",
          ...(responseId === undefined ? {} : { responseId }),
          sessionId: message.session_id
        }
      ]
    }
  }
}

const userTurn = (text: string): Sdk.SDKUserMessage => ({
  type: "user",
  message: { role: "user", content: text },
  parent_tool_use_id: null
})

/** The sessions of one claude-code seat: `make`'s state and its Promise half. */
export const makeSessions = (options: Options): {
  readonly answer: (request: ModelRequest.ModelRequest, signal: AbortSignal) => Promise<ReadonlyArray<ModelEvent>>
  readonly close: () => void
} => {
  const start: Start = options.start ?? (({ options, prompt }) => Sdk.query({ prompt, options }))
  const idleMillis = options.idleMillis ?? 60 * 60_000
  const interruptMillis = options.interruptMillis ?? 5_000
  // Interrupt the running turn, then close: closing alone can leave a turn
  // going until the process is gone. A Claude Code that never acknowledges the
  // interrupt is closed anyway once `interruptMillis` passes.
  const stop = (query: Query) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    void Promise.race([
      query.interrupt().catch(() => {}),
      new Promise((resolve) => timer = setTimeout(resolve, interruptMillis))
    ]).finally(() => {
      clearTimeout(timer)
      query.close()
    })
  }
  const sessions = new Map<string, Session>()

  const locked = (request: ModelRequest.ModelRequest): Sdk.Options => ({
    model: options.model,
    pathToClaudeCodeExecutable: options.executable,
    cwd: options.cwd ?? tmpdir(),
    env: {
      ...codexEnvironment(options.environment),
      CLAUDE_AGENT_SDK_CLIENT_APP: "smithers",
      ENABLE_CLAUDEAI_MCP_SERVERS: "false"
    },
    systemPrompt: { type: "custom", prompt: request.system.map((part) => part.text) },
    tools: [],
    mcpServers: {},
    strictMcpConfig: true,
    settingSources: [],
    plugins: [],
    skills: [],
    permissionMode: "dontAsk",
    persistSession: options.hijackable === true,
    // A session with no title is named by an extra model call over its first prompt.
    title: "Smithers",
    ...(request.params.reasoningEffort === undefined ? {} : { effort: effort[request.params.reasoningEffort] })
  })

  const open = (key: string, identity: string, request: ModelRequest.ModelRequest): Session => {
    // The streaming input: each user turn is queued until Claude Code reads it.
    const turns: Array<Sdk.SDKUserMessage> = [userTurn(flatten(request.messages))]
    let wake = () => {}
    let closed = false
    const prompt = (async function*(): AsyncGenerator<Sdk.SDKUserMessage> {
      for (;;) {
        while (turns.length > 0) yield turns.shift()!
        if (closed) return
        await new Promise<void>((resolve) => wake = resolve)
      }
    })()
    const query = start({ prompt, options: locked(request) })
    let timer: ReturnType<typeof setTimeout> | undefined
    const session: Session = {
      messages: query[Symbol.asyncIterator](),
      identity,
      seen: [],
      last: "",
      answer: [],
      spentUsd: 0,
      send: (text) => {
        turns.push(userTurn(text))
        wake()
      },
      rest: (idle) => {
        clearTimeout(timer)
        if (!idle) return
        timer = setTimeout(session.close, idleMillis)
        timer.unref?.()
      },
      close: () => {
        clearTimeout(timer)
        if (sessions.get(key) === session) sessions.delete(key)
        closed = true
        wake()
        stop(query)
      }
    }
    sessions.set(key, session)
    return session
  }

  const conversation = async (
    request: ModelRequest.ModelRequest,
    key: string,
    signal: AbortSignal
  ): Promise<ReadonlyArray<ModelEvent>> => {
    const encoded = encode(request)
    const identity = CanonicalJson.stringify({
      modelId: encoded.modelId,
      system: encoded.system,
      params: encoded.params
    })
    const messages = encoded.messages.map((message) => CanonicalJson.stringify(message))
    const last = CanonicalJson.stringify(encoded)
    const live = sessions.get(key)
    if (live !== undefined && live.last === last) return live.answer
    const added = live === undefined || live.identity !== identity ? undefined : extension(live.seen, messages, request)
    if (added === undefined) live?.close()
    const session = added === undefined ? open(key, identity, request) : live!
    signal.addEventListener("abort", session.close, { once: true })
    session.rest(false)
    try {
      if (added !== undefined) session.send(added.map(textOf).join("\n\n"))
      const answer = await read(session.messages, session)
      session.seen = messages
      session.last = last
      session.answer = answer
      session.rest(true)
      return answer
    } catch (error) {
      session.close()
      throw error
    } finally {
      signal.removeEventListener("abort", session.close)
    }
  }

  const oneShot = async (request: ModelRequest.ModelRequest, signal: AbortSignal) => {
    const query = start({ prompt: flatten(request.messages), options: { ...locked(request), maxTurns: 1 } })
    const abort = () => void query.interrupt().catch(() => {})
    signal.addEventListener("abort", abort, { once: true })
    try {
      return await read(query[Symbol.asyncIterator](), { spentUsd: 0 })
    } finally {
      signal.removeEventListener("abort", abort)
      query.close()
    }
  }

  const answer = (request: ModelRequest.ModelRequest, signal: AbortSignal) => {
    if ((request.serverTools?.length ?? 0) > 0 || request.tools.length > 0) {
      throw new ModelError({
        code: "invalid_request",
        message: "A claude-code seat offers no declared or provider-run tools"
      })
    }
    return request.cacheKey === undefined
      ? oneShot(request, signal)
      : conversation(request, request.cacheKey, signal)
  }

  return {
    answer,
    close: () => {
      for (const session of [...sessions.values()]) session.close()
    }
  }
}
