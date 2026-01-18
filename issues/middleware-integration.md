# Middleware Integration for Smithers

<issue-summary>
Integrate the Vercel AI SDK's middleware pattern into Smithers to enable composable, reusable enhancements for the `<Claude>` component. This will allow cross-cutting concerns like logging, caching, reasoning extraction, and error recovery to be applied declaratively.
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

<vercel-ai-sdk-middleware>
The Vercel AI SDK provides a middleware pattern via `wrapLanguageModel`:

```typescript
const enhanced = wrapLanguageModel({
  model: anthropic('claude-3-sonnet'),
  middleware: [
    extractReasoningMiddleware({ tagName: 'think' }),
    defaultSettingsMiddleware({ settings: { maxOutputTokens: 4096 } }),
    loggingMiddleware(),
  ],
});
```

**Middleware Interface:**
```typescript
type LanguageModelMiddleware = {
  specificationVersion: 'v3';

  // Transform request parameters before calling model
  transformParams?: (options: {
    type: 'generate' | 'stream';
    params: CallOptions;
    model: LanguageModel;
  }) => Promise<CallOptions>;

  // Wrap the generate operation
  wrapGenerate?: (options: {
    doGenerate: () => Promise<GenerateResult>;
    doStream: () => Promise<StreamResult>;
    params: CallOptions;
    model: LanguageModel;
  }) => Promise<GenerateResult>;

  // Wrap the stream operation
  wrapStream?: (options: {
    doGenerate: () => Promise<GenerateResult>;
    doStream: () => Promise<StreamResult>;
    params: CallOptions;
    model: LanguageModel;
  }) => Promise<StreamResult>;
};
```
</vercel-ai-sdk-middleware>
</context>

---

## Benefits of Middleware Pattern

<benefits>

### 1. Separation of Concerns
Middleware isolates cross-cutting functionality from core business logic. Logging, caching, and error handling become reusable modules rather than scattered conditionals.

### 2. Composability
Multiple middleware can be stacked, each handling one concern:
```tsx
<Claude middleware={[logging, caching, rateLimiting, reasoning]}>
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

## Built-in Middleware from Vercel AI SDK

<reference path="reference/vercel-ai-sdk/packages/ai/src/middleware/">

### extractReasoningMiddleware

**Purpose:** Extracts XML-tagged reasoning sections (like `<think>` tags) from model output into a separate `reasoning` field.

**Relevance to Smithers:** Claude's extended thinking feature uses `<thinking>` tags. This middleware could cleanly separate reasoning from final output.

```typescript
// From: reference/vercel-ai-sdk/packages/ai/src/middleware/extract-reasoning-middleware.ts
export function extractReasoningMiddleware({
  tagName,
  separator = '\n',
  startWithReasoning = false,
}: {
  tagName: string;
  separator?: string;
  startWithReasoning?: boolean;
}): LanguageModelMiddleware
```

**Smithers Usage:**
```tsx
import { extractReasoningMiddleware } from 'smithers/middleware'

<Claude
  middleware={[
    extractReasoningMiddleware({ tagName: 'antml:thinking' })
  ]}
  onFinished={(result) => {
    console.log('Reasoning:', result.reasoning)
    console.log('Output:', result.output)
  }}
>
  Solve this complex problem step by step
</Claude>
```

### extractJsonMiddleware

**Purpose:** Strips markdown code fences from JSON responses. Models sometimes wrap JSON in ` ```json ` blocks.

**Relevance to Smithers:** When using `schema` prop for structured output, this ensures clean JSON parsing.

```typescript
// From: reference/vercel-ai-sdk/packages/ai/src/middleware/extract-json-middleware.ts
export function extractJsonMiddleware(options?: {
  transform?: (text: string) => string;
}): LanguageModelMiddleware
```

**Smithers Usage:**
```tsx
<Claude
  schema={myZodSchema}
  middleware={[extractJsonMiddleware()]}
>
  Return the analysis as JSON
</Claude>
```

### defaultSettingsMiddleware

**Purpose:** Applies default model settings that can be overridden per-request.

**Relevance to Smithers:** Establish organization-wide defaults for token limits, temperature, etc.

```typescript
// From: reference/vercel-ai-sdk/packages/ai/src/middleware/default-settings-middleware.ts
export function defaultSettingsMiddleware({
  settings,
}: {
  settings: Partial<{
    maxOutputTokens?: number;
    temperature?: number;
    stopSequences?: string[];
    topP?: number;
    // ... more settings
  }>;
}): LanguageModelMiddleware
```

**Smithers Usage:**
```tsx
// In SmithersProvider
<SmithersProvider
  middleware={[
    defaultSettingsMiddleware({
      settings: {
        maxOutputTokens: 8192,
        temperature: 0.7,
      }
    })
  ]}
>
  <App />
</SmithersProvider>
```

### addToolInputExamplesMiddleware

**Purpose:** Appends input examples to tool descriptions for better tool use.

**Relevance to Smithers:** Improves tool calling accuracy by providing concrete examples.

```typescript
// From: reference/vercel-ai-sdk/packages/ai/src/middleware/add-tool-input-examples-middleware.ts
export function addToolInputExamplesMiddleware({
  prefix = 'Input Examples:',
  format,
  remove = true,
}: {
  prefix?: string;
  format?: (example: { input: JSONObject }, index: number) => string;
  remove?: boolean;
}): LanguageModelMiddleware
```

### simulateStreamingMiddleware

**Purpose:** Converts non-streaming responses into simulated streams for consistent API.

**Relevance to Smithers:** Useful when integrating models that don't support native streaming.

</reference>

---

## Custom Middleware Opportunities for Smithers

<custom-middleware>

### 1. Logging Middleware

```typescript
function loggingMiddleware(options?: {
  logLevel?: 'debug' | 'info' | 'warn';
  includeTokens?: boolean;
  logFn?: (entry: LogEntry) => void;
}): SmithersMiddleware {
  return {
    transformParams: async ({ params, type }) => {
      console.log(`[${type}] Starting request`, params);
      return params;
    },
    wrapGenerate: async ({ doGenerate, params }) => {
      const start = Date.now();
      const result = await doGenerate();
      console.log(`[generate] Completed in ${Date.now() - start}ms`, {
        tokens: result.usage,
      });
      return result;
    },
  };
}
```

### 2. Caching Middleware

```typescript
function cachingMiddleware(options: {
  cache: CacheStore;
  ttl?: number;
  keyFn?: (params: CallParams) => string;
}): SmithersMiddleware {
  return {
    wrapGenerate: async ({ doGenerate, params }) => {
      const key = options.keyFn?.(params) ?? hash(params);
      const cached = await options.cache.get(key);
      if (cached) return cached;

      const result = await doGenerate();
      await options.cache.set(key, result, options.ttl);
      return result;
    },
  };
}
```

### 3. Rate Limiting Middleware

```typescript
function rateLimitingMiddleware(options: {
  requestsPerMinute: number;
  tokensPerMinute?: number;
}): SmithersMiddleware {
  const limiter = new TokenBucket(options);

  return {
    wrapGenerate: async ({ doGenerate }) => {
      await limiter.acquire();
      return doGenerate();
    },
  };
}
```

### 4. Retry Middleware

```typescript
function retryMiddleware(options?: {
  maxRetries?: number;
  retryOn?: (error: Error) => boolean;
  backoff?: 'exponential' | 'linear';
}): SmithersMiddleware {
  return {
    wrapGenerate: async ({ doGenerate }) => {
      let lastError: Error;
      for (let i = 0; i <= (options?.maxRetries ?? 3); i++) {
        try {
          return await doGenerate();
        } catch (error) {
          lastError = error as Error;
          if (!options?.retryOn?.(lastError)) throw lastError;
          await sleep(calculateBackoff(i, options?.backoff));
        }
      }
      throw lastError!;
    },
  };
}
```

### 5. Tool Call Repair Middleware

```typescript
function toolCallRepairMiddleware(options?: {
  repair?: (toolCall: ToolCall, error: Error) => ToolCall | null;
}): SmithersMiddleware {
  return {
    wrapGenerate: async ({ doGenerate, doStream, params }) => {
      const result = await doGenerate();

      // Check for malformed tool calls and attempt repair
      for (const toolCall of result.toolCalls ?? []) {
        try {
          validateToolCall(toolCall, params.tools);
        } catch (error) {
          const repaired = options?.repair?.(toolCall, error as Error);
          if (repaired) {
            Object.assign(toolCall, repaired);
          }
        }
      }

      return result;
    },
  };
}
```

### 6. Cost Tracking Middleware

```typescript
function costTrackingMiddleware(options: {
  onCost: (cost: { input: number; output: number; total: number }) => void;
  pricing?: Record<string, { input: number; output: number }>;
}): SmithersMiddleware {
  return {
    wrapGenerate: async ({ doGenerate, model }) => {
      const result = await doGenerate();
      const pricing = options.pricing?.[model.modelId] ?? DEFAULT_PRICING;

      options.onCost({
        input: result.usage.promptTokens * pricing.input,
        output: result.usage.completionTokens * pricing.output,
        total: /* calculated */,
      });

      return result;
    },
  };
}
```

</custom-middleware>

---

## Proposed API Design

<api-design>

### Option A: Middleware Prop on Claude Component

```tsx
interface ClaudeProps {
  // ... existing props
  middleware?: SmithersMiddleware[];
}

// Usage
<Claude
  model="sonnet"
  middleware={[
    loggingMiddleware(),
    cachingMiddleware({ cache: myCache }),
    extractReasoningMiddleware({ tagName: 'think' }),
  ]}
>
  Process this request
</Claude>
```

### Option B: Higher-Order Component / Wrapper

```tsx
import { withMiddleware } from 'smithers'

const EnhancedClaude = withMiddleware(Claude, [
  loggingMiddleware(),
  rateLimitingMiddleware({ requestsPerMinute: 60 }),
]);

// Usage
<EnhancedClaude model="sonnet">
  Process this request
</EnhancedClaude>
```

### Option C: Provider-Level Middleware (Global Defaults)

```tsx
<SmithersProvider
  middleware={[
    loggingMiddleware({ logLevel: 'info' }),
    costTrackingMiddleware({ onCost: trackCost }),
  ]}
>
  {/* All Claude components inherit middleware */}
  <Claude model="sonnet">Task 1</Claude>
  <Claude model="opus">Task 2</Claude>
</SmithersProvider>
```

### Option D: Composable Middleware Components (React Pattern)

```tsx
<SmithersProvider>
  <Logging level="debug">
    <RateLimiter rpm={60}>
      <Claude model="sonnet">
        Process this request
      </Claude>
    </RateLimiter>
  </Logging>
</SmithersProvider>
```

### Recommended Approach

**Combine Options A and C:**

1. **Provider-level middleware** for organization-wide defaults (logging, cost tracking)
2. **Component-level middleware** for request-specific enhancements (caching, schema extraction)
3. Component middleware **appends to** provider middleware (not replaces)

```tsx
// Global setup
<SmithersProvider
  middleware={[
    loggingMiddleware(),
    costTrackingMiddleware({ onCost: sendToAnalytics }),
  ]}
>
  <App />
</SmithersProvider>

// Component-specific
<Claude
  model="sonnet"
  middleware={[
    cachingMiddleware({ cache: promptCache, ttl: 3600 }),
    extractReasoningMiddleware({ tagName: 'think' }),
  ]}
>
  Analyze this document
</Claude>
```

</api-design>

---

## Type Definitions

<types>

```typescript
// src/middleware/types.ts

import type { AgentResult } from '../components/agents/types'

/**
 * Smithers middleware for enhancing Claude component behavior.
 * Based on Vercel AI SDK's LanguageModelMiddleware pattern.
 */
export interface SmithersMiddleware {
  /**
   * Middleware name for debugging/logging
   */
  name?: string;

  /**
   * Transform parameters before execution
   */
  transformParams?: (options: {
    type: 'execute';
    params: ClaudeExecutionParams;
  }) => Promise<ClaudeExecutionParams> | ClaudeExecutionParams;

  /**
   * Wrap the execution operation
   */
  wrapExecute?: (options: {
    doExecute: () => Promise<AgentResult>;
    params: ClaudeExecutionParams;
  }) => Promise<AgentResult>;

  /**
   * Handle streaming chunks (for onProgress)
   */
  transformChunk?: (chunk: string) => string;

  /**
   * Transform the final result
   */
  transformResult?: (result: AgentResult) => AgentResult | Promise<AgentResult>;
}

/**
 * Parameters passed to Claude CLI execution
 */
export interface ClaudeExecutionParams {
  prompt: string;
  model: string;
  systemPrompt?: string;
  maxTurns?: number;
  timeout?: number;
  tools?: string[];
  permissionMode?: string;
}

/**
 * Compose multiple middleware into one
 */
export function composeMiddleware(
  ...middlewares: SmithersMiddleware[]
): SmithersMiddleware;

/**
 * Apply middleware to execution
 */
export function applyMiddleware(
  execute: () => Promise<AgentResult>,
  params: ClaudeExecutionParams,
  middlewares: SmithersMiddleware[],
): Promise<AgentResult>;
```

</types>

---

## Implementation Plan

<implementation>

### Phase 1: Core Infrastructure

1. **Create middleware types** (`src/middleware/types.ts`)
2. **Implement `composeMiddleware`** utility
3. **Implement `applyMiddleware`** executor
4. **Add `middleware` prop to Claude component**
5. **Integrate with SmithersProvider context**

### Phase 2: Built-in Middleware

1. **Port `extractReasoningMiddleware`** for Claude's thinking tags
2. **Port `extractJsonMiddleware`** for schema parsing
3. **Create `loggingMiddleware`** integrated with Smithers DB
4. **Create `retryMiddleware`** with configurable backoff

### Phase 3: Advanced Middleware

1. **Create `cachingMiddleware`** with pluggable cache backends
2. **Create `rateLimitingMiddleware`** with token bucket
3. **Create `costTrackingMiddleware`** with pricing tables
4. **Create `toolCallRepairMiddleware`** for robust tool handling

### Phase 4: Documentation & Examples

1. **Document middleware API**
2. **Create example middleware implementations**
3. **Add middleware composition examples**
4. **Write testing guide for custom middleware**

</implementation>

---

## Example: Full Integration

<example>

```tsx
// src/middleware/index.ts
export { loggingMiddleware } from './logging'
export { cachingMiddleware } from './caching'
export { extractReasoningMiddleware } from './extract-reasoning'
export { rateLimitingMiddleware } from './rate-limiting'
export { costTrackingMiddleware } from './cost-tracking'
export { composeMiddleware, applyMiddleware } from './compose'
export type { SmithersMiddleware } from './types'

// Application code
import {
  loggingMiddleware,
  cachingMiddleware,
  extractReasoningMiddleware,
  costTrackingMiddleware,
} from 'smithers/middleware'

function App() {
  return (
    <SmithersProvider
      middleware={[
        loggingMiddleware({
          logLevel: 'info',
          includeTokens: true,
        }),
        costTrackingMiddleware({
          onCost: (cost) => analytics.track('ai_cost', cost),
        }),
      ]}
    >
      <FeatureWorkflow />
    </SmithersProvider>
  )
}

function FeatureWorkflow() {
  const [reasoning, setReasoning] = useState<string>()

  return (
    <Claude
      model="sonnet"
      middleware={[
        // Component-specific middleware
        extractReasoningMiddleware({
          tagName: 'think',
          onReasoning: setReasoning,
        }),
        cachingMiddleware({
          cache: sessionStorage,
          ttl: 300, // 5 minutes
        }),
      ]}
      onFinished={(result) => {
        console.log('Final output:', result.output)
        console.log('Reasoning:', reasoning)
      }}
    >
      Analyze the following code and suggest improvements.
      Think through your analysis step by step.

      ```typescript
      {code}
      ```
    </Claude>
  )
}
```

</example>

---

## References

<references>

**Vercel AI SDK Middleware Source:**
- `reference/vercel-ai-sdk/packages/ai/src/middleware/wrap-language-model.ts`
- `reference/vercel-ai-sdk/packages/ai/src/middleware/extract-reasoning-middleware.ts`
- `reference/vercel-ai-sdk/packages/ai/src/middleware/extract-json-middleware.ts`
- `reference/vercel-ai-sdk/packages/ai/src/middleware/default-settings-middleware.ts`
- `reference/vercel-ai-sdk/packages/ai/src/middleware/add-tool-input-examples-middleware.ts`

**Smithers Components:**
- `src/components/Claude.tsx` - Main Claude component
- `src/components/SmithersProvider.tsx` - Provider context
- `src/components/agents/types/agents.ts` - ClaudeProps interface

**Related Patterns:**
- Express.js middleware
- Redux middleware
- React HOC pattern
- Decorator pattern

</references>

---

## Success Criteria

<success-criteria>

1. **Middleware can be applied at both provider and component level**
2. **Built-in middleware covers common use cases** (logging, caching, reasoning extraction)
3. **Custom middleware is easy to create** with clear TypeScript types
4. **Middleware composes cleanly** without conflicts
5. **Performance overhead is minimal** (middleware only adds ~1ms per layer)
6. **Existing Claude components work unchanged** (backward compatible)
7. **Middleware integrates with Smithers DB logging** for observability

</success-criteria>
