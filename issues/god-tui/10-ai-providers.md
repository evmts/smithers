# AI Provider Abstraction Layer

Comprehensive specification for unified multi-provider LLM streaming interface.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Application Layer                               │
│   streamSimple(model, context, options) -> AssistantMessageEventStream  │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼─────────────────────────────────────┐
│                       Unified Stream Interface                          │
│  stream(model, context, options) -> AssistantMessageEventStream         │
│  complete(model, context, options) -> Promise<AssistantMessage>         │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
┌───────▼───────┐   ┌───────────────▼───────────────┐   ┌───────▼───────┐
│   Anthropic   │   │       OpenAI (2 APIs)         │   │    Google     │
│   Messages    │   │  Completions │ Responses      │   │  (3 backends) │
└───────────────┘   └───────────────────────────────┘   └───────────────┘
        │                           │                           │
┌───────▼───────┐   ┌───────────────▼───────────────┐   ┌───────▼───────┐
│    Bedrock    │   │   OpenAI-Compatible Proxies   │   │    Vertex     │
│   Converse    │   │  xAI, Groq, Mistral, etc.     │   │   Gemini CLI  │
└───────────────┘   └───────────────────────────────┘   └───────────────┘
```

---

## Type Definitions

### Core Message Types

```typescript
// Base content blocks
interface TextContent {
  type: "text"
  text: string
  textSignature?: string  // Provider-specific ID for replay
}

interface ThinkingContent {
  type: "thinking"
  thinking: string
  thinkingSignature?: string  // Encrypted reasoning for replay (Anthropic/Google)
}

interface ImageContent {
  type: "image"
  data: string      // Base64 encoded
  mimeType: string  // "image/jpeg" | "image/png" | "image/gif" | "image/webp"
}

interface ToolCall {
  type: "toolCall"
  id: string                      // Provider-specific, normalized per API
  name: string
  arguments: Record<string, any>
  thoughtSignature?: string       // Google: opaque signature for thought context
}

// Message types
interface UserMessage {
  role: "user"
  content: string | (TextContent | ImageContent)[]
  timestamp: number  // Unix ms
}

interface AssistantMessage {
  role: "assistant"
  content: (TextContent | ThinkingContent | ToolCall)[]
  api: Api
  provider: Provider
  model: string
  usage: Usage
  stopReason: StopReason
  errorMessage?: string
  timestamp: number
}

interface ToolResultMessage<TDetails = any> {
  role: "toolResult"
  toolCallId: string
  toolName: string
  content: (TextContent | ImageContent)[]
  details?: TDetails
  isError: boolean
  timestamp: number
}

type Message = UserMessage | AssistantMessage | ToolResultMessage
```

### Usage and Cost Tracking

```typescript
interface Usage {
  input: number       // Non-cached input tokens
  output: number      // Output tokens (includes reasoning for some providers)
  cacheRead: number   // Tokens read from prompt cache
  cacheWrite: number  // Tokens written to prompt cache
  totalTokens: number
  cost: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    total: number
  }
}

type StopReason = "stop" | "length" | "toolUse" | "error" | "aborted"
```

### Tool Definition

```typescript
interface Tool<TParameters extends JSONSchema = JSONSchema> {
  name: string
  description: string
  parameters: TParameters  // JSON Schema (TypeBox compatible)
}

interface Context {
  systemPrompt?: string
  messages: Message[]
  tools?: Tool[]
}
```

---

## Streaming Event System

### Event Types

```typescript
type AssistantMessageEvent =
  | { type: "start"; partial: AssistantMessage }
  // Text content events
  | { type: "text_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "text_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "text_end"; contentIndex: number; content: string; partial: AssistantMessage }
  // Thinking/reasoning events
  | { type: "thinking_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "thinking_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "thinking_end"; contentIndex: number; content: string; partial: AssistantMessage }
  // Tool call events
  | { type: "toolcall_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "toolcall_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "toolcall_end"; contentIndex: number; toolCall: ToolCall; partial: AssistantMessage }
  // Completion events
  | { type: "done"; reason: "stop" | "length" | "toolUse"; message: AssistantMessage }
  | { type: "error"; reason: "aborted" | "error"; error: AssistantMessage }
```

### EventStream Implementation

```typescript
class EventStream<T, R> implements AsyncIterable<T> {
  private queue: T[] = []
  private waiting: ((value: IteratorResult<T>) => void)[] = []
  private done = false
  private finalResultPromise: Promise<R>

  constructor(
    isComplete: (event: T) => boolean,
    extractResult: (event: T) => R
  )

  push(event: T): void {
    if (this.done) return

    if (this.isComplete(event)) {
      this.done = true
      this.resolveFinalResult(this.extractResult(event))
    }

    // Deliver to waiting consumer or queue
    const waiter = this.waiting.shift()
    if (waiter) {
      waiter({ value: event, done: false })
    } else {
      this.queue.push(event)
    }
  }

  end(result?: R): void

  async *[Symbol.asyncIterator](): AsyncIterator<T>

  result(): Promise<R>  // Returns final AssistantMessage
}

class AssistantMessageEventStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
  constructor() {
    super(
      (event) => event.type === "done" || event.type === "error",
      (event) => event.type === "done" ? event.message : event.error
    )
  }
}
```

---

## Model Definition Structure

```typescript
type Api =
  | "anthropic-messages"
  | "openai-completions"
  | "openai-responses"
  | "openai-codex-responses"
  | "bedrock-converse-stream"
  | "google-generative-ai"
  | "google-gemini-cli"
  | "google-vertex"

type KnownProvider =
  | "anthropic"
  | "openai" | "openai-codex"
  | "google" | "google-vertex" | "google-gemini-cli" | "google-antigravity"
  | "amazon-bedrock"
  | "github-copilot"
  | "xai" | "groq" | "cerebras" | "mistral"
  | "openrouter" | "vercel-ai-gateway"
  | "zai" | "minimax" | "minimax-cn" | "opencode"

interface Model<TApi extends Api> {
  id: string           // API model identifier
  name: string         // Display name
  api: TApi
  provider: Provider
  baseUrl: string
  reasoning: boolean   // Supports extended thinking
  input: ("text" | "image")[]
  cost: {
    input: number      // $/million tokens
    output: number
    cacheRead: number
    cacheWrite: number
  }
  contextWindow: number
  maxTokens: number
  headers?: Record<string, string>
  compat?: OpenAICompletionsCompat | OpenAIResponsesCompat  // API-specific overrides
}
```

### Model Registry

```typescript
// Auto-generated from model definitions
const MODELS: Record<KnownProvider, Record<string, Model<Api>>>

function getModel<TProvider, TModelId>(
  provider: TProvider,
  modelId: TModelId
): Model<Api>

function getProviders(): KnownProvider[]

function getModels(provider: KnownProvider): Model<Api>[]

function calculateCost(model: Model<Api>, usage: Usage): Usage["cost"]

function supportsXhigh(model: Model<Api>): boolean  // Only certain OpenAI Codex models

function modelsAreEqual(a: Model<Api>, b: Model<Api>): boolean
```

---

## API Key Resolution

```typescript
function getEnvApiKey(provider: KnownProvider): string | undefined {
  // Provider-specific environment variable mapping
  const envMap = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_OAUTH_TOKEN" ?? "ANTHROPIC_API_KEY",
    "google": "GEMINI_API_KEY",
    "groq": "GROQ_API_KEY",
    "cerebras": "CEREBRAS_API_KEY",
    "xai": "XAI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "vercel-ai-gateway": "AI_GATEWAY_API_KEY",
    "zai": "ZAI_API_KEY",
    "mistral": "MISTRAL_API_KEY",
    "minimax": "MINIMAX_API_KEY",
    "minimax-cn": "MINIMAX_CN_API_KEY",
    "opencode": "OPENCODE_API_KEY",
    "github-copilot": "COPILOT_GITHUB_TOKEN" ?? "GH_TOKEN" ?? "GITHUB_TOKEN",
  }

  // Special cases:
  // - google-vertex: ADC credentials + GOOGLE_CLOUD_PROJECT + GOOGLE_CLOUD_LOCATION
  // - amazon-bedrock: AWS_PROFILE | (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY) |
  //                   AWS_BEARER_TOKEN_BEDROCK | container/IRSA credentials

  return process.env[envMap[provider]]
}
```

---

## Thinking/Reasoning Level Mapping

```typescript
type ThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh"

interface ThinkingBudgets {
  minimal?: number
  low?: number
  medium?: number
  high?: number
}

// Default token budgets (Anthropic/Bedrock)
const DEFAULT_BUDGETS: ThinkingBudgets = {
  minimal: 1024,
  low: 2048,
  medium: 8192,
  high: 16384
}

// Google Gemini 2.5 specific budgets
const GEMINI_25_PRO_BUDGETS = { minimal: 128, low: 2048, medium: 8192, high: 32768 }
const GEMINI_25_FLASH_BUDGETS = { minimal: 128, low: 2048, medium: 8192, high: 24576 }

// Gemini 3 uses ThinkingLevel enum instead of budgets
type GoogleThinkingLevel = "THINKING_LEVEL_UNSPECIFIED" | "MINIMAL" | "LOW" | "MEDIUM" | "HIGH"
```

### Provider-Specific Mapping

| Provider | Parameter | Format |
|----------|-----------|--------|
| Anthropic | `thinking.budget_tokens` | Token budget |
| OpenAI Completions | `reasoning_effort` | "minimal"/"low"/"medium"/"high" |
| OpenAI Responses | `reasoning.effort` + `reasoning.summary` | Effort + summary mode |
| Google Generative AI | `thinkingConfig.thinkingBudget` or `thinkingConfig.thinkingLevel` | Budget or enum |
| Google Vertex | Same as Generative AI | |
| Bedrock (Claude) | `additionalModelRequestFields.thinking.budget_tokens` | Token budget |
| Z.ai | `thinking.type` | "enabled" or "disabled" |

---

## Provider Implementations

### Anthropic Messages API

```typescript
interface AnthropicOptions extends StreamOptions {
  thinkingEnabled?: boolean
  thinkingBudgetTokens?: number
  interleavedThinking?: boolean  // Claude 4.x interleaved thinking
  toolChoice?: "auto" | "any" | "none" | { type: "tool"; name: string }
}

function streamAnthropic(
  model: Model<"anthropic-messages">,
  context: Context,
  options?: AnthropicOptions
): AssistantMessageEventStream
```

**Request Transformation:**
```typescript
// Headers for OAuth tokens (Claude Code stealth mode)
headers = {
  "accept": "application/json",
  "anthropic-dangerous-direct-browser-access": "true",
  "anthropic-beta": "claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14",
  "user-agent": "claude-cli/2.1.2 (external, cli)",
  "x-app": "cli"
}

// System prompt with cache control
params.system = [{
  type: "text",
  text: systemPrompt,
  cache_control: { type: "ephemeral" }
}]

// Tool call ID normalization: ^[a-zA-Z0-9_-]+$ max 64 chars
normalizeToolCallId = (id) => id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64)

// Thinking signatures: preserve on replay, convert to text if missing/invalid
if (!block.thinkingSignature) {
  // Convert to plain text block (no <thinking> tags)
}
```

**Response Mapping:**
```
message_start          -> capture input token usage
content_block_start    -> text_start | thinking_start | toolcall_start
content_block_delta    -> text_delta | thinking_delta | toolcall_delta (input_json_delta)
signature_delta        -> accumulate thinking signature
content_block_stop     -> text_end | thinking_end | toolcall_end
message_delta          -> capture output usage, map stop_reason
```

**Stop Reason Mapping:**
```
end_turn       -> stop
max_tokens     -> length
tool_use       -> toolUse
refusal        -> error
pause_turn     -> stop
stop_sequence  -> stop
```

---

### OpenAI Completions API

```typescript
interface OpenAICompletionsOptions extends StreamOptions {
  toolChoice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } }
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh"
}

interface OpenAICompletionsCompat {
  supportsStore?: boolean
  supportsDeveloperRole?: boolean
  supportsReasoningEffort?: boolean
  supportsUsageInStreaming?: boolean
  maxTokensField?: "max_completion_tokens" | "max_tokens"
  requiresToolResultName?: boolean
  requiresAssistantAfterToolResult?: boolean
  requiresThinkingAsText?: boolean
  requiresMistralToolIds?: boolean  // Exactly 9 alphanumeric chars
  thinkingFormat?: "openai" | "zai"
}

function streamOpenAICompletions(
  model: Model<"openai-completions">,
  context: Context,
  options?: OpenAICompletionsOptions
): AssistantMessageEventStream
```

**Compatibility Detection:**
```typescript
function detectCompat(model): OpenAICompletionsCompat {
  const isZai = provider === "zai" || baseUrl.includes("api.z.ai")
  const isMistral = provider === "mistral" || baseUrl.includes("mistral.ai")
  const isNonStandard = isZai || isMistral || isXai || isCerebras || isChutes

  return {
    supportsStore: !isNonStandard,
    supportsDeveloperRole: !isNonStandard,
    supportsReasoningEffort: !isXai && !isZai,
    supportsUsageInStreaming: true,
    maxTokensField: isMistral || isChutes ? "max_tokens" : "max_completion_tokens",
    requiresToolResultName: isMistral,
    requiresAssistantAfterToolResult: false,
    requiresThinkingAsText: isMistral,
    requiresMistralToolIds: isMistral,
    thinkingFormat: isZai ? "zai" : "openai"
  }
}
```

**Request Transformation:**
```typescript
// System prompt role
role = model.reasoning && compat.supportsDeveloperRole ? "developer" : "system"

// Reasoning field variants
if (compat.thinkingFormat === "zai") {
  params.thinking = { type: options.reasoningEffort ? "enabled" : "disabled" }
} else if (compat.supportsReasoningEffort) {
  params.reasoning_effort = options.reasoningEffort
}

// Mistral tool ID normalization: exactly 9 alphanumeric chars
function normalizeMistralToolId(id: string): string {
  let normalized = id.replace(/[^a-zA-Z0-9]/g, "")
  if (normalized.length < 9) {
    normalized = normalized + "ABCDEFGHI".slice(0, 9 - normalized.length)
  } else if (normalized.length > 9) {
    normalized = normalized.slice(0, 9)
  }
  return normalized
}

// OpenRouter Anthropic cache control
if (model.provider === "openrouter" && model.id.startsWith("anthropic/")) {
  // Add cache_control: { type: "ephemeral" } to last user/assistant text block
}
```

**Response Mapping:**
```
chunk.usage                      -> calculate input/output/cached tokens
choice.delta.content             -> text_delta
choice.delta.reasoning_content   -> thinking_delta (llama.cpp)
choice.delta.reasoning           -> thinking_delta (other providers)
choice.delta.reasoning_text      -> thinking_delta (fallback)
choice.delta.tool_calls          -> toolcall_delta (JSON streaming)
choice.delta.reasoning_details   -> encrypted reasoning for tool calls (OpenAI o-series)
choice.finish_reason             -> map stop reason
```

**Stop Reason Mapping:**
```
stop            -> stop
length          -> length
function_call   -> toolUse
tool_calls      -> toolUse
content_filter  -> error
```

---

### OpenAI Responses API

```typescript
interface OpenAIResponsesOptions extends StreamOptions {
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh"
  reasoningSummary?: "auto" | "detailed" | "concise" | null
  serviceTier?: "flex" | "priority" | "default"
}

function streamOpenAIResponses(
  model: Model<"openai-responses">,
  context: Context,
  options?: OpenAIResponsesOptions
): AssistantMessageEventStream
```

**Request Transformation:**
```typescript
// Tool call ID format: call_id|item_id
// item_id must start with "fc_" for Responses API
normalizeToolCallId = (id) => {
  const [callId, itemId] = id.split("|")
  let sanitizedItemId = itemId.replace(/[^a-zA-Z0-9_-]/g, "_")
  if (!sanitizedItemId.startsWith("fc")) {
    sanitizedItemId = `fc_${sanitizedItemId}`
  }
  return `${callId.slice(0,64)}|${sanitizedItemId.slice(0,64)}`
}

// Reasoning configuration
if (options.reasoningEffort) {
  params.reasoning = {
    effort: options.reasoningEffort,
    summary: options.reasoningSummary || "auto"
  }
  params.include = ["reasoning.encrypted_content"]
} else if (model.name.startsWith("gpt-5")) {
  // Disable reasoning for GPT-5 by adding developer message
  messages.push({
    role: "developer",
    content: [{ type: "input_text", text: "# Juice: 0 !important" }]
  })
}

// Service tier pricing multipliers
function getServiceTierCostMultiplier(tier): number {
  switch (tier) {
    case "flex": return 0.5
    case "priority": return 2
    default: return 1
  }
}
```

**Response Event Mapping:**
```
response.output_item.added (type: "reasoning")    -> thinking_start
response.reasoning_summary_part.added             -> accumulate summary
response.reasoning_summary_text.delta             -> thinking_delta
response.reasoning_summary_part.done              -> add newlines

response.output_item.added (type: "message")      -> text_start
response.content_part.added                       -> accumulate content
response.output_text.delta                        -> text_delta
response.refusal.delta                            -> text_delta (refusal content)

response.output_item.added (type: "function_call") -> toolcall_start
response.function_call_arguments.delta            -> toolcall_delta

response.output_item.done                         -> *_end (finalize block)
response.completed                                -> done
error                                             -> error
response.failed                                   -> error
```

**Stop Reason Mapping:**
```
completed   -> stop
incomplete  -> length
failed      -> error
cancelled   -> error
in_progress -> stop
queued      -> stop
```

---

### Google Generative AI / Vertex AI

```typescript
interface GoogleOptions extends StreamOptions {
  toolChoice?: "auto" | "none" | "any"
  thinking?: {
    enabled: boolean
    budgetTokens?: number  // -1 for dynamic, 0 to disable
    level?: GoogleThinkingLevel
  }
}

interface GoogleVertexOptions extends GoogleOptions {
  project?: string   // GOOGLE_CLOUD_PROJECT
  location?: string  // GOOGLE_CLOUD_LOCATION
}

function streamGoogle(model, context, options): AssistantMessageEventStream
function streamGoogleVertex(model, context, options): AssistantMessageEventStream
```

**Request Transformation:**
```typescript
// Thinking configuration
if (options.thinking?.enabled) {
  config.thinkingConfig = {
    includeThoughts: true,
    ...(options.thinking.level && { thinkingLevel: options.thinking.level }),
    ...(options.thinking.budgetTokens !== undefined && { thinkingBudget: options.thinking.budgetTokens })
  }
}

// Tool choice mapping
function mapToolChoice(choice): FunctionCallingConfigMode {
  switch (choice) {
    case "auto": return FunctionCallingConfigMode.AUTO
    case "none": return FunctionCallingConfigMode.NONE
    case "any": return FunctionCallingConfigMode.ANY
  }
}

// Tool call ID handling
function requiresToolCallId(modelId): boolean {
  return modelId.startsWith("claude-") || modelId.startsWith("gpt-oss-")
}

// Thought signature validation (must be valid base64)
function isValidThoughtSignature(sig): boolean {
  if (!sig || sig.length % 4 !== 0) return false
  return /^[A-Za-z0-9+/]+={0,2}$/.test(sig)
}

// Gemini 3 function call thought signature requirement
if (isGemini3 && !thoughtSignature) {
  // Convert unsigned function calls to text to avoid validation errors
  parts.push({
    text: `[Historical context: tool "${name}" called with args: ${JSON.stringify(args)}]`
  })
}
```

**Response Mapping:**
```
candidate.content.parts[].text (thought: true)     -> thinking_delta
candidate.content.parts[].text (thought: false)    -> text_delta
candidate.content.parts[].functionCall             -> toolcall (immediate start/delta/end)
candidate.finishReason                             -> map stop reason
chunk.usageMetadata                                -> usage (includes thoughtsTokenCount)
```

**Stop Reason Mapping:**
```
STOP                  -> stop
MAX_TOKENS            -> length
BLOCKLIST             -> error
PROHIBITED_CONTENT    -> error
SPII                  -> error
SAFETY                -> error
IMAGE_SAFETY          -> error
RECITATION            -> error
MALFORMED_FUNCTION_CALL -> error
UNEXPECTED_TOOL_CALL  -> error
... (many error variants)
```

---

### AWS Bedrock Converse API

```typescript
interface BedrockOptions extends StreamOptions {
  region?: string   // AWS_REGION | AWS_DEFAULT_REGION | "us-east-1"
  profile?: string  // AWS_PROFILE
  toolChoice?: "auto" | "any" | "none" | { type: "tool"; name: string }
  reasoning?: ThinkingLevel
  thinkingBudgets?: ThinkingBudgets
  interleavedThinking?: boolean  // Claude 4.x only
}

function streamBedrock(
  model: Model<"bedrock-converse-stream">,
  context: Context,
  options: BedrockOptions
): AssistantMessageEventStream
```

**Request Transformation:**
```typescript
// Prompt caching (Claude 3.5 Haiku, 3.7 Sonnet, 4.x models)
function supportsPromptCaching(model): boolean {
  const id = model.id.toLowerCase()
  if (id.includes("claude") && (id.includes("-4-") || id.includes("-4."))) return true
  if (id.includes("claude-3-7-sonnet")) return true
  if (id.includes("claude-3-5-haiku")) return true
  return false
}

// System prompt with cache control
if (supportsPromptCaching(model)) {
  system = [
    { text: systemPrompt },
    { cachePoint: { type: CachePointType.DEFAULT } }
  ]
}

// Thinking signature support (Anthropic only)
function supportsThinkingSignature(model): boolean {
  return model.id.includes("anthropic.claude")
}

// Additional model request fields for thinking
if (options.reasoning && model.id.includes("anthropic.claude")) {
  additionalModelRequestFields = {
    thinking: {
      type: "enabled",
      budget_tokens: calculateBudget(options.reasoning, options.thinkingBudgets)
    },
    ...(options.interleavedThinking && {
      anthropic_beta: ["interleaved-thinking-2025-05-14"]
    })
  }
}

// Tool choice mapping
function convertToolChoice(choice): ToolChoice {
  switch (choice) {
    case "auto": return { auto: {} }
    case "any": return { any: {} }
    case toolSpec: return { tool: { name: toolSpec.name } }
  }
}
```

**Response Event Mapping:**
```
messageStart                                -> start
contentBlockStart (toolUse)                 -> toolcall_start
contentBlockDelta.delta.text                -> text_delta (create block if needed)
contentBlockDelta.delta.toolUse.input       -> toolcall_delta
contentBlockDelta.delta.reasoningContent    -> thinking_delta (create block if needed)
contentBlockStop                            -> *_end
messageStop                                 -> map stop reason
metadata.usage                              -> usage (includes cacheRead/cacheWrite)
*Exception                                  -> throw error
```

**Stop Reason Mapping:**
```
END_TURN                        -> stop
STOP_SEQUENCE                   -> stop
MAX_TOKENS                      -> length
MODEL_CONTEXT_WINDOW_EXCEEDED   -> length
TOOL_USE                        -> toolUse
*                               -> error
```

---

## Cross-Provider Message Transformation

```typescript
function transformMessages<TApi extends Api>(
  messages: Message[],
  model: Model<TApi>,
  normalizeToolCallId?: (id: string, model: Model<TApi>, source: AssistantMessage) => string
): Message[]
```

### Transformation Rules

1. **Thinking Block Handling:**
   - Same model: Keep thinking blocks with signatures
   - Different model, same provider: Keep signatures if valid
   - Different provider: Convert thinking to plain text (no `<thinking>` tags)

2. **Tool Call ID Normalization:**
   - Map original IDs to normalized IDs
   - Apply normalization to both `toolCall.id` and `toolResultMessage.toolCallId`
   - Provider-specific formats:
     - Anthropic: `^[a-zA-Z0-9_-]+$` max 64 chars
     - Mistral: exactly 9 alphanumeric chars
     - OpenAI: max 40 chars
     - OpenAI Responses: `call_id|fc_item_id`

3. **Orphaned Tool Call Handling:**
   - Insert synthetic error results for tool calls without responses
   - Required when user message follows assistant tool calls

4. **Error/Abort Filtering:**
   - Skip assistant messages with `stopReason === "error" | "aborted"`
   - Prevents replaying incomplete/broken turns

```typescript
// Synthetic tool result for orphaned calls
{
  role: "toolResult",
  toolCallId: toolCall.id,
  toolName: toolCall.name,
  content: [{ type: "text", text: "No result provided" }],
  isError: true,
  timestamp: Date.now()
}
```

---

## Streaming JSON Parsing

```typescript
import { parse as partialParse } from "partial-json"

function parseStreamingJson<T>(partialJson: string | undefined): T {
  if (!partialJson || partialJson.trim() === "") {
    return {} as T
  }

  // Try standard parsing first (fastest for complete JSON)
  try {
    return JSON.parse(partialJson)
  } catch {
    // Try partial-json for incomplete JSON
    try {
      return partialParse(partialJson) ?? {}
    } catch {
      return {} as T
    }
  }
}
```

**Usage in Tool Call Streaming:**
```typescript
// Accumulate partial JSON as deltas arrive
block.partialJson += delta.partial_json
block.arguments = parseStreamingJson(block.partialJson)

// On block completion, parse final JSON
block.arguments = JSON.parse(block.partialJson)
delete block.partialJson
```

---

## AbortSignal Handling

```typescript
interface StreamOptions {
  signal?: AbortSignal
  // ...
}

// Pre-request check
if (options?.signal?.aborted) {
  throw new Error("Request was aborted")
}

// Pass to provider client
const response = await client.send(command, { signal: options.signal })

// Post-stream check
if (options?.signal?.aborted) {
  throw new Error("Request was aborted")
}

// Error handling
catch (error) {
  output.stopReason = options?.signal?.aborted ? "aborted" : "error"
  output.errorMessage = error.message
  stream.push({ type: "error", reason: output.stopReason, error: output })
  stream.end()
}
```

---

## Error Handling Patterns

### Provider Error Mapping

```typescript
// Anthropic
catch (error) {
  output.stopReason = signal?.aborted ? "aborted" : "error"
  output.errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
}

// OpenAI (with OpenRouter metadata)
catch (error) {
  const rawMetadata = error?.error?.metadata?.raw
  if (rawMetadata) output.errorMessage += `\n${rawMetadata}`
}

// Bedrock (explicit error types)
if (item.internalServerException) throw new Error(`Internal server error: ${item.message}`)
if (item.modelStreamErrorException) throw new Error(`Model stream error: ${item.message}`)
if (item.validationException) throw new Error(`Validation error: ${item.message}`)
if (item.throttlingException) throw new Error(`Throttling error: ${item.message}`)
if (item.serviceUnavailableException) throw new Error(`Service unavailable: ${item.message}`)
```

### Cleanup on Error

```typescript
catch (error) {
  // Clean up internal tracking properties
  for (const block of output.content) {
    delete (block as any).index
    delete (block as any).partialJson
  }

  // Set error state
  output.stopReason = options?.signal?.aborted ? "aborted" : "error"
  output.errorMessage = error.message

  // Emit error event
  stream.push({ type: "error", reason: output.stopReason, error: output })
  stream.end()
}
```

---

## Cache Control (Anthropic Prompt Caching)

### System Prompt Caching

```typescript
// Anthropic direct API
params.system = [{
  type: "text",
  text: systemPrompt,
  cache_control: { type: "ephemeral" }
}]

// Bedrock (Claude 3.5+ models)
system = [
  { text: systemPrompt },
  { cachePoint: { type: CachePointType.DEFAULT } }
]
```

### Conversation History Caching

```typescript
// Add cache_control to last user message
if (params.length > 0) {
  const lastMessage = params[params.length - 1]
  if (lastMessage.role === "user") {
    const lastBlock = lastMessage.content[lastMessage.content.length - 1]
    if (lastBlock?.type === "text" || "image" || "tool_result") {
      lastBlock.cache_control = { type: "ephemeral" }
    }
  }
}

// Bedrock: cache point on last user message
if (lastMessage.role === "USER") {
  lastMessage.content.push({ cachePoint: { type: CachePointType.DEFAULT } })
}
```

### OpenRouter Anthropic Caching

```typescript
// Add cache_control to last text content in user/assistant messages
if (model.provider === "openrouter" && model.id.startsWith("anthropic/")) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === "user" || msg.role === "assistant") {
      // Find last text part and add cache_control
      for (let j = msg.content.length - 1; j >= 0; j--) {
        if (msg.content[j]?.type === "text") {
          Object.assign(msg.content[j], { cache_control: { type: "ephemeral" } })
          return
        }
      }
    }
  }
}
```

---

## Token Counting and Cost Calculation

```typescript
function calculateCost(model: Model<Api>, usage: Usage): Usage["cost"] {
  // Costs stored as $/million tokens
  usage.cost.input = (model.cost.input / 1_000_000) * usage.input
  usage.cost.output = (model.cost.output / 1_000_000) * usage.output
  usage.cost.cacheRead = (model.cost.cacheRead / 1_000_000) * usage.cacheRead
  usage.cost.cacheWrite = (model.cost.cacheWrite / 1_000_000) * usage.cacheWrite
  usage.cost.total = usage.cost.input + usage.cost.output +
                     usage.cost.cacheRead + usage.cost.cacheWrite
  return usage.cost
}
```

### Provider-Specific Token Extraction

| Provider | Input | Output | Cached | Notes |
|----------|-------|--------|--------|-------|
| Anthropic | `usage.input_tokens` | `usage.output_tokens` | `cache_read_input_tokens`, `cache_creation_input_tokens` | Total computed |
| OpenAI Completions | `prompt_tokens - cached_tokens` | `completion_tokens + reasoning_tokens` | `prompt_tokens_details.cached_tokens` | Reasoning added to output |
| OpenAI Responses | `input_tokens - cached` | `output_tokens` | `input_tokens_details.cached_tokens` | Service tier multipliers |
| Google | `promptTokenCount` | `candidatesTokenCount + thoughtsTokenCount` | `cachedContentTokenCount` | Thoughts added to output |
| Bedrock | `inputTokens` | `outputTokens` | `cacheReadInputTokens`, `cacheWriteInputTokens` | |

---

## Unified Entry Points

```typescript
// Low-level: direct provider options
function stream<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options?: OptionsForApi<TApi>
): AssistantMessageEventStream

function complete<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options?: OptionsForApi<TApi>
): Promise<AssistantMessage>

// High-level: unified reasoning interface
function streamSimple<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options?: SimpleStreamOptions
): AssistantMessageEventStream

function completeSimple<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options?: SimpleStreamOptions
): Promise<AssistantMessage>

interface SimpleStreamOptions extends StreamOptions {
  reasoning?: ThinkingLevel
  thinkingBudgets?: ThinkingBudgets
}
```

### Options Mapping Logic

```typescript
function mapOptionsForApi<TApi extends Api>(
  model: Model<TApi>,
  options?: SimpleStreamOptions,
  apiKey?: string
): OptionsForApi<TApi> {

  const base = {
    temperature: options?.temperature,
    maxTokens: options?.maxTokens || Math.min(model.maxTokens, 32000),
    signal: options?.signal,
    apiKey,
    sessionId: options?.sessionId,
    headers: options?.headers,
    onPayload: options?.onPayload
  }

  // Clamp xhigh to high for providers that don't support it
  const clampReasoning = (level) => level === "xhigh" ? "high" : level

  // Adjust maxTokens to account for thinking budget
  // APIs require max_tokens > thinking.budget_tokens
  const adjustMaxTokensForThinking = (baseMax, modelMax, level, customBudgets) => {
    const budget = customBudgets?.[level] ?? DEFAULT_BUDGETS[level]
    const maxTokens = Math.min(baseMax + budget, modelMax)

    // Ensure room for output
    if (maxTokens <= budget) {
      budget = Math.max(0, maxTokens - 1024)
    }

    return { maxTokens, thinkingBudget: budget }
  }

  switch (model.api) {
    case "anthropic-messages":
      // Return AnthropicOptions with thinkingEnabled, thinkingBudgetTokens

    case "bedrock-converse-stream":
      // Return BedrockOptions with reasoning, thinkingBudgets

    case "openai-completions":
    case "openai-responses":
    case "openai-codex-responses":
      // Return options with reasoningEffort (clamped if needed)

    case "google-generative-ai":
    case "google-gemini-cli":
    case "google-vertex":
      // Return GoogleOptions with thinking.enabled, budgetTokens/level
  }
}
```

---

## Summary

This abstraction layer provides:

1. **Unified Message Format** - Single representation for text, thinking, images, tool calls
2. **Consistent Streaming Events** - Same event types across all providers
3. **Automatic Token/Cost Tracking** - Per-provider extraction and normalization
4. **Cross-Provider Tool Calling** - ID normalization, orphan handling
5. **Thinking/Reasoning Abstraction** - Level-based interface, provider-specific mapping
6. **Cache Control** - Prompt caching for Anthropic/Bedrock
7. **Error Resilience** - Proper cleanup, abort handling, error state propagation
8. **Model Registry** - Type-safe model definitions with cost/capability metadata

Implementations should follow the streaming event contract exactly to ensure consumers can process events uniformly regardless of underlying provider.
