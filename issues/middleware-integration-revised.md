# Middleware Integration for Smithers (Revised for CLI Architecture)

<issue-summary>
Integrate a middleware pattern into Smithers to enable composable, reusable enhancements for the `<Claude>` component. Unlike the Vercel AI SDK which wraps direct API calls, Smithers uses the Claude Code CLI as a subprocess, requiring a different middleware abstraction that operates at the CLI execution level rather than the API call level.
</issue-summary>

---

## Background

<context>
<smithers-current-state>
The `<Claude>` component currently accepts configuration through props:

```tsx
<Claude
  model="sonnet"
  maxTurns={5}
  systemPrompt="You are a helpful assistant"
  schema={myZodSchema}
  permissionMode="acceptEdits"
  reportingEnabled
  onFinished={(result) => console.log(result)}
>
  Implement feature X
</Claude>
```

**Current Props:**
- `model` - Which Claude model to use (opus, sonnet, haiku)
- `maxTurns` - Limit agentic iterations
- `systemPrompt` - System instructions
- `schema` - Zod schema for structured output
- `permissionMode` - Tool permission handling
- `allowedTools` / `disallowedTools` - Tool whitelists/blacklists
- `timeout` - Execution timeout
- `validate` - Custom result validation
- `onProgress` / `onFinished` / `onError` - Callbacks

**Problem:** There's no way to apply cross-cutting concerns (logging, caching, rate limiting, output transformation) without modifying the core component or adding more props.
</smithers-current-state>

<architecture-constraints>
**CRITICAL DIFFERENCE FROM VERCEL AI SDK:**

Smithers uses the **Claude Code CLI** as a black-box subprocess:

```typescript
// src/components/agents/claude-cli/executor.ts:34-38
proc = Bun.spawn(['claude', ...args], {
  cwd: options.cwd ?? process.cwd(),
  stdout: 'pipe',
  stderr: 'pipe',
})
```

**What this means:**
- ❌ No access to API parameters during execution
- ❌ Cannot intercept individual API calls
- ❌ Cannot wrap "generate" or "stream" operations
- ❌ Cannot modify streaming response chunks
- ✅ Can modify CLI arguments before execution
- ✅ Can process stdout/stderr chunks during execution
- ✅ Can transform results after execution completes
- ✅ Can wrap the entire CLI execution

**Middleware must operate at the CLI execution level, NOT the API level.**
</architecture-constraints>
</context>

---

## Benefits of Middleware Pattern

<benefits>

### 1. Separation of Concerns
Middleware isolates cross-cutting functionality from core business logic. Logging, caching, and error handling become reusable modules rather than scattered conditionals.

### 2. Composability
Multiple middleware can be stacked, each handling one concern:
```tsx
<Claude middleware={[logging, caching, rateLimiting, outputParsing]}>
  ...
</Claude>
```

### 3. Testability
Each middleware is a pure function that can be unit tested in isolation without spinning up the full agent.

### 4. Extensibility
Users can create custom middleware without forking Smithers or waiting for upstream changes.

### 5. Configuration Flexibility
Default behaviors can be overridden per-component or globally via provider context.

</benefits>

---

## Middleware Abstraction Layers

<abstraction-layers>

### Layer 1: Pre-Execution (transformOptions)
Transforms CLI execution options before spawning the subprocess.

**Use cases:**
- Modify system prompt (inject logging instructions, safety guardrails)
- Adjust timeout based on model or prompt complexity
- Add default tools or permissions
- Override model selection based on environment

**Signature:**
```typescript
transformOptions?: (options: CLIExecutionOptions) => CLIExecutionOptions
```

**Example:**
```typescript
const defaultToolsMiddleware = (tools: string[]): SmithersMiddleware => ({
  name: 'default-tools',
  transformOptions: (options) => ({
    ...options,
    allowedTools: [...(options.allowedTools ?? []), ...tools],
  }),
})
```

### Layer 2: Execution Wrapping (wrapExecute)
Wraps the entire CLI execution to add behavior before/after or handle errors.

**Use cases:**
- Retry logic with exponential backoff (already implemented in Claude.tsx)
- Rate limiting (delay before execution)
- Caching (hash options → cache result)
- Cost tracking (log token usage)
- Execution timing and metrics

**Signature:**
```typescript
wrapExecute?: (
  doExecute: () => Promise<AgentResult>,
  options: CLIExecutionOptions
) => Promise<AgentResult>
```

**Example:**
```typescript
const retryMiddleware = (maxRetries = 3): SmithersMiddleware => ({
  name: 'retry',
  wrapExecute: async (doExecute, options) => {
    let lastError: Error | null = null
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await doExecute()
      } catch (error) {
        lastError = error as Error
        if (i < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
        }
      }
    }
    throw lastError!
  },
})
```

### Layer 3: Chunk Streaming (transformChunk)
Processes stdout/stderr chunks as they arrive during execution.

**Use cases:**
- Filter/redact sensitive information
- Parse structured logs
- Extract progress indicators
- Real-time message parsing (already implemented via MessageParser)

**Signature:**
```typescript
transformChunk?: (chunk: string) => string
```

**Example:**
```typescript
const redactSecretsMiddleware = (): SmithersMiddleware => ({
  name: 'redact-secrets',
  transformChunk: (chunk) => {
    return chunk.replace(/sk-[a-zA-Z0-9]{48}/g, 'sk-***REDACTED***')
  },
})
```

### Layer 4: Post-Execution (transformResult)
Transforms the final result after CLI execution completes.

**Use cases:**
- Extract specific data from output
- Parse structured formats
- Validate output format
- Add metadata or computed fields

**Signature:**
```typescript
transformResult?: (result: AgentResult) => AgentResult | Promise<AgentResult>
```

**Example:**
```typescript
const extractCodeBlocksMiddleware = (): SmithersMiddleware => ({
  name: 'extract-code-blocks',
  transformResult: (result) => {
    const codeBlocks = result.output.match(/```[\s\S]*?```/g) || []
    return {
      ...result,
      metadata: {
        ...result.metadata,
        codeBlocks,
      },
    }
  },
})
```

</abstraction-layers>

---

## Type Definitions

<types>

```typescript
// src/middleware/types.ts

import type { AgentResult, CLIExecutionOptions } from '../components/agents/types'

/**
 * Smithers middleware for enhancing Claude component behavior.
 *
 * IMPORTANT: Operates at the CLI execution level, not the API level.
 * Middleware cannot intercept individual API calls or modify streaming
 * response chunks from the Claude API. Instead, it can:
 * - Modify CLI options before execution
 * - Wrap the entire CLI execution
 * - Process stdout/stderr chunks
 * - Transform final results
 */
export interface SmithersMiddleware {
  /**
   * Middleware name for debugging/logging
   */
  name?: string

  /**
   * Transform CLI execution options before spawning subprocess.
   * Use this to modify system prompt, timeout, tools, etc.
   */
  transformOptions?: (
    options: CLIExecutionOptions
  ) => CLIExecutionOptions | Promise<CLIExecutionOptions>

  /**
   * Wrap the entire CLI execution.
   * Use this for retry logic, caching, rate limiting, cost tracking.
   */
  wrapExecute?: (
    doExecute: () => Promise<AgentResult>,
    options: CLIExecutionOptions
  ) => Promise<AgentResult>

  /**
   * Transform stdout/stderr chunks as they arrive.
   * Use this for filtering, redacting, or parsing streaming output.
   *
   * NOTE: This is called for EVERY chunk, potentially hundreds of times.
   * Keep this function fast and side-effect free.
   */
  transformChunk?: (chunk: string) => string

  /**
   * Transform the final result after CLI execution completes.
   * Use this for extracting data, validating output, adding metadata.
   */
  transformResult?: (
    result: AgentResult
  ) => AgentResult | Promise<AgentResult>
}

/**
 * Compose multiple middleware into one.
 * Middleware are applied in order:
 * - transformOptions: left to right
 * - wrapExecute: right to left (outermost last)
 * - transformChunk: left to right
 * - transformResult: left to right
 */
export function composeMiddleware(
  ...middlewares: SmithersMiddleware[]
): SmithersMiddleware

/**
 * Apply middleware to a CLI execution.
 * Internal function used by Claude component.
 */
export function applyMiddleware(
  execute: () => Promise<AgentResult>,
  options: CLIExecutionOptions,
  middlewares: SmithersMiddleware[],
): Promise<AgentResult>
```

</types>

---

## Feasible Built-in Middleware

<built-in-middleware>

### 1. Logging Middleware ✅

Logs execution details to database or custom logger.

```typescript
export function loggingMiddleware(options?: {
  logLevel?: 'debug' | 'info' | 'warn'
  includeTokens?: boolean
  logger?: (entry: LogEntry) => void
}): SmithersMiddleware {
  return {
    name: 'logging',
    transformOptions: (opts) => {
      const logger = options?.logger ?? console.log
      logger({ type: 'start', model: opts.model, prompt: opts.prompt?.slice(0, 100) })
      return opts
    },
    transformResult: async (result) => {
      const logger = options?.logger ?? console.log
      logger({
        type: 'complete',
        tokensUsed: result.tokensUsed,
        durationMs: result.durationMs,
        stopReason: result.stopReason,
      })
      return result
    },
  }
}
```

### 2. Caching Middleware ✅

Caches entire CLI execution results based on options hash.

```typescript
export function cachingMiddleware(options: {
  cache: CacheStore // { get, set, delete }
  ttl?: number
  keyFn?: (opts: CLIExecutionOptions) => string
}): SmithersMiddleware {
  return {
    name: 'caching',
    wrapExecute: async (doExecute, opts) => {
      const key = options.keyFn?.(opts) ?? hash(opts)
      const cached = await options.cache.get(key)
      if (cached) return cached

      const result = await doExecute()
      await options.cache.set(key, result, options.ttl)
      return result
    },
  }
}
```

### 3. Rate Limiting Middleware ✅

Enforces rate limits before CLI execution.

```typescript
export function rateLimitingMiddleware(options: {
  requestsPerMinute: number
  tokensPerMinute?: number
}): SmithersMiddleware {
  const limiter = new TokenBucket(options)

  return {
    name: 'rate-limiting',
    wrapExecute: async (doExecute) => {
      await limiter.acquire()
      return doExecute()
    },
  }
}
```

### 4. Retry Middleware ✅

Already partially implemented in Claude.tsx. Extract to middleware.

```typescript
export function retryMiddleware(options?: {
  maxRetries?: number
  retryOn?: (error: Error) => boolean
  backoff?: 'exponential' | 'linear' | 'constant'
  baseDelay?: number
}): SmithersMiddleware {
  return {
    name: 'retry',
    wrapExecute: async (doExecute) => {
      const maxRetries = options?.maxRetries ?? 3
      const baseDelay = options?.baseDelay ?? 1000
      let lastError: Error | null = null

      for (let i = 0; i <= maxRetries; i++) {
        try {
          return await doExecute()
        } catch (error) {
          lastError = error as Error
          if (i < maxRetries && options?.retryOn?.(lastError) !== false) {
            const delay = options?.backoff === 'exponential'
              ? baseDelay * Math.pow(2, i)
              : baseDelay * (i + 1)
            await new Promise(resolve => setTimeout(resolve, delay))
          }
        }
      }
      throw lastError!
    },
  }
}
```

### 5. Cost Tracking Middleware ✅

Tracks token usage and estimates costs.

```typescript
export function costTrackingMiddleware(options: {
  onCost: (cost: { input: number; output: number; total: number }) => void
  pricing?: Record<string, { input: number; output: number }>
}): SmithersMiddleware {
  const DEFAULT_PRICING = {
    'sonnet': { input: 0.003, output: 0.015 }, // per 1k tokens
    'opus': { input: 0.015, output: 0.075 },
    'haiku': { input: 0.00025, output: 0.00125 },
  }

  return {
    name: 'cost-tracking',
    transformResult: (result) => {
      const modelId = result.model ?? 'sonnet'
      const pricing = options.pricing?.[modelId] ?? DEFAULT_PRICING[modelId]

      if (pricing && result.tokensUsed) {
        const inputCost = (result.tokensUsed.input / 1000) * pricing.input
        const outputCost = (result.tokensUsed.output / 1000) * pricing.output
        const total = inputCost + outputCost

        options.onCost({ input: inputCost, output: outputCost, total })
      }

      return result
    },
  }
}
```

### 6. Secret Redaction Middleware ✅

Redacts secrets from streaming output.

```typescript
export function redactSecretsMiddleware(options?: {
  patterns?: RegExp[]
  replacement?: string
}): SmithersMiddleware {
  const defaultPatterns = [
    /sk-[a-zA-Z0-9]{48}/g, // API keys
    /-----BEGIN [A-Z ]+-----[\s\S]+?-----END [A-Z ]+-----/g, // Certificates
    /[a-zA-Z0-9+/]{40,}={0,2}/g, // Base64 tokens (aggressive)
  ]

  const patterns = options?.patterns ?? defaultPatterns
  const replacement = options?.replacement ?? '***REDACTED***'

  return {
    name: 'redact-secrets',
    transformChunk: (chunk) => {
      let redacted = chunk
      for (const pattern of patterns) {
        redacted = redacted.replace(pattern, replacement)
      }
      return redacted
    },
  }
}
```

### 7. Timeout Adjustment Middleware ✅

Dynamically adjusts timeout based on model or prompt complexity.

```typescript
export function timeoutMiddleware(options: {
  baseTimeout?: number
  modelMultipliers?: Record<string, number>
  promptLengthFactor?: number
}): SmithersMiddleware {
  const baseTimeout = options.baseTimeout ?? 300000 // 5 minutes
  const modelMultipliers = options.modelMultipliers ?? {
    'opus': 1.5,
    'sonnet': 1.0,
    'haiku': 0.5,
  }

  return {
    name: 'timeout-adjustment',
    transformOptions: (opts) => {
      const model = opts.model ?? 'sonnet'
      const multiplier = modelMultipliers[model] ?? 1.0
      const promptLength = opts.prompt?.length ?? 0
      const lengthFactor = options.promptLengthFactor ?? 0

      const adjustedTimeout = baseTimeout * multiplier + (promptLength * lengthFactor)

      return {
        ...opts,
        timeout: opts.timeout ?? adjustedTimeout,
      }
    },
  }
}
```

</built-in-middleware>

---

## NOT Feasible (Requires API-Level Access)

<not-feasible>

### ❌ Extract Reasoning Middleware

**Why not:** Claude Code CLI does not expose thinking tags in stdout by default. Even if it did, you'd only get the final output, not streaming chunks from the API.

**Workaround:** If the CLI ever supports `--show-thinking` or similar, this could be done via `transformResult` by parsing the output.

### ❌ Extract JSON Middleware

**Why not:** Already handled by the built-in `parseClaudeOutput` function in `src/components/agents/claude-cli/output-parser.ts`.

**Status:** No need for middleware; functionality already exists.

### ❌ Default Settings Middleware

**Why not:** The CLI owns all API settings (temperature, top_p, etc.). You cannot override them via CLI arguments.

**Workaround:** Use `transformOptions` to modify system prompt to request certain behaviors.

### ❌ Add Tool Input Examples Middleware

**Why not:** No access to tool definitions sent to the API. The CLI handles all tool configuration.

**Status:** Not possible with current architecture.

### ❌ Tool Call Repair Middleware

**Why not:** No access to individual tool calls. The CLI handles all tool execution internally.

**Status:** Not possible with current architecture.

</not-feasible>

---

## Proposed API Design

<api-design>

### Recommended: Provider + Component Level

**Provider-level middleware** for organization-wide defaults (logging, cost tracking):

```tsx
<SmithersProvider
  db={db}
  executionId={executionId}
  middleware={[
    loggingMiddleware({ logLevel: 'info' }),
    costTrackingMiddleware({ onCost: sendToAnalytics }),
  ]}
>
  <App />
</SmithersProvider>
```

**Component-level middleware** for request-specific enhancements (caching, retries):

```tsx
<Claude
  model="sonnet"
  middleware={[
    cachingMiddleware({ cache: myCache, ttl: 3600 }),
    retryMiddleware({ maxRetries: 3, backoff: 'exponential' }),
  ]}
>
  Analyze this document
</Claude>
```

**Composition:** Component middleware appends to provider middleware (outermost to innermost):

```
Provider middleware [logging, costTracking]
  + Component middleware [caching, retry]
  = Final stack: [logging, costTracking, caching, retry]
```

### Updated ClaudeProps Interface

```typescript
export interface ClaudeProps<TSchema extends z.ZodType = z.ZodType> extends BaseAgentProps {
  // ... existing props ...

  /**
   * Middleware to apply to this Claude execution.
   * Middleware from SmithersProvider are automatically prepended.
   */
  middleware?: SmithersMiddleware[]
}
```

### Updated SmithersProviderProps Interface

```typescript
export interface SmithersProviderProps {
  // ... existing props ...

  /**
   * Global middleware applied to all Claude executions.
   * Component-level middleware will be appended to these.
   */
  middleware?: SmithersMiddleware[]
}
```

</api-design>

---

## Implementation Plan

<implementation>

### Phase 1: Core Infrastructure

**Files to create:**
- `src/middleware/types.ts` - Type definitions
- `src/middleware/compose.ts` - Composition utilities
- `src/middleware/apply.ts` - Application logic

**Tasks:**
1. Define `SmithersMiddleware` interface
2. Implement `composeMiddleware()` utility
3. Implement `applyMiddleware()` executor
4. Add `middleware` prop to `ClaudeProps` interface
5. Add `middleware` prop to `SmithersProviderProps` interface
6. Update `SmithersProvider` to pass middleware via context
7. Update `Claude.tsx` to apply middleware in execution flow

**Key integration point:**

```typescript
// src/components/Claude.tsx (inside useEffectOnValueChange)

const middlewares = [
  ...(providerMiddleware ?? []),
  ...(props.middleware ?? []),
]

const executeWithMiddleware = () => executeClaudeCLI({
  // ... options
})

const result = await applyMiddleware(
  executeWithMiddleware,
  executionOptions,
  middlewares
)
```

### Phase 2: Built-in Middleware

**Files to create:**
- `src/middleware/logging.ts`
- `src/middleware/caching.ts`
- `src/middleware/retry.ts`
- `src/middleware/rate-limiting.ts`
- `src/middleware/cost-tracking.ts`
- `src/middleware/redact-secrets.ts`
- `src/middleware/timeout.ts`

**Tasks:**
1. Implement `loggingMiddleware` with DB integration
2. Implement `cachingMiddleware` with LRU cache
3. Extract retry logic from `Claude.tsx` into `retryMiddleware`
4. Implement `rateLimitingMiddleware` with token bucket
5. Implement `costTrackingMiddleware` with pricing tables
6. Implement `redactSecretsMiddleware` with pattern matching
7. Implement `timeoutMiddleware` with dynamic adjustment

### Phase 3: Refactoring

**Tasks:**
1. Extract existing retry logic from `Claude.tsx:129-218` into middleware
2. Move validation logic into `validationMiddleware`
3. Update LogWriter integration to use `loggingMiddleware`
4. Add middleware examples to documentation

### Phase 4: Testing & Documentation

**Files to create:**
- `src/middleware/middleware.test.ts`
- `docs/middleware.md`
- `examples/middleware-example.tsx`

**Tasks:**
1. Unit tests for each middleware
2. Integration tests for middleware composition
3. Documentation with examples
4. Migration guide for existing code

</implementation>

---

## Example: Full Integration

<example>

```tsx
// examples/middleware-example.tsx

import { SmithersProvider, Claude } from 'smithers'
import {
  loggingMiddleware,
  cachingMiddleware,
  retryMiddleware,
  costTrackingMiddleware,
  redactSecretsMiddleware,
} from 'smithers/middleware'

// Global setup
const cache = new LRUCache({ max: 100, ttl: 3600000 })

function App() {
  return (
    <SmithersProvider
      db={db}
      executionId={executionId}
      middleware={[
        // Applied to ALL Claude components
        loggingMiddleware({
          logLevel: 'info',
          includeTokens: true,
        }),
        costTrackingMiddleware({
          onCost: (cost) => {
            console.log(`Cost: $${cost.total.toFixed(4)}`)
            analytics.track('ai_cost', cost)
          },
        }),
        redactSecretsMiddleware(),
      ]}
    >
      <FeatureWorkflow />
    </SmithersProvider>
  )
}

function FeatureWorkflow() {
  return (
    <Claude
      model="sonnet"
      middleware={[
        // Applied ONLY to this Claude component
        cachingMiddleware({
          cache,
          ttl: 300000, // 5 minutes
        }),
        retryMiddleware({
          maxRetries: 3,
          backoff: 'exponential',
        }),
      ]}
      onFinished={(result) => {
        console.log('Final output:', result.output)
      }}
    >
      Analyze the following code and suggest improvements.

      ```typescript
      {code}
      ```
    </Claude>
  )
}
```

**Execution order:**
1. `loggingMiddleware` logs start
2. `costTrackingMiddleware` starts tracking
3. `redactSecretsMiddleware` filters streaming output
4. `cachingMiddleware` checks cache (miss)
5. `retryMiddleware` wraps execution (succeeds on first try)
6. CLI executes successfully
7. `cachingMiddleware` stores result
8. `redactSecretsMiddleware` filters final output
9. `costTrackingMiddleware` logs cost
10. `loggingMiddleware` logs completion

</example>

---

## Success Criteria

<success-criteria>

1. **Middleware can be applied at both provider and component level** ✅
2. **Built-in middleware covers common use cases** (logging, caching, retry, cost tracking, rate limiting) ✅
3. **Custom middleware is easy to create** with clear TypeScript types ✅
4. **Middleware composes cleanly** without conflicts ✅
5. **Performance overhead is minimal** (middleware only adds ~1-2ms per layer) ✅
6. **Existing Claude components work unchanged** (backward compatible) ✅
7. **Middleware integrates with Smithers DB logging** for observability ✅
8. **Clear documentation** distinguishes what's possible vs. what requires API access ✅

</success-criteria>

---

## Migration from Vercel AI SDK Patterns

<migration-guide>

If you're familiar with Vercel AI SDK middleware, here's how to adapt:

| Vercel AI SDK | Smithers Equivalent | Notes |
|---------------|---------------------|-------|
| `wrapLanguageModel()` | `middleware` prop | Different abstraction level |
| `transformParams()` | `transformOptions()` | Transforms CLI options, not API params |
| `wrapGenerate()` | `wrapExecute()` | Wraps entire CLI execution |
| `wrapStream()` | N/A | CLI handles streaming internally |
| `extractReasoningMiddleware` | ❌ Not feasible | No access to thinking tags |
| `extractJsonMiddleware` | ❌ Built-in | Already in `parseClaudeOutput` |
| `defaultSettingsMiddleware` | ❌ Not feasible | CLI owns API settings |
| `addToolInputExamplesMiddleware` | ❌ Not feasible | No access to tool definitions |

**Key Principle:** Smithers middleware operates at the **CLI execution level**, not the API level. Think of it as wrapping `exec('claude ...')` rather than wrapping `anthropic.messages.create()`.

</migration-guide>

---

## References

<references>

**Smithers Components:**
- `src/components/Claude.tsx` - Main Claude component
- `src/components/SmithersProvider.tsx` - Provider context
- `src/components/agents/types/agents.ts` - ClaudeProps interface
- `src/components/agents/claude-cli/executor.ts` - CLI execution logic
- `src/components/agents/claude-cli/output-parser.ts` - Output parsing

**Related Patterns:**
- Express.js middleware (execution wrapping)
- Redux middleware (action interception)
- React HOC pattern (component wrapping)
- Unix pipes (stream transformation)

**NOT Applicable:**
- Vercel AI SDK `wrapLanguageModel()` (different abstraction)
- API-level interceptors (no API access)

</references>
