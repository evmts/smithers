# Telemetry Integration: AI SDK Usage Tracking in Smithers

> **STATUS**: Ready for implementation
> **PRIORITY**: High - Enables better cost tracking and model analytics

---

<overview>

## Problem Statement

Smithers currently tracks basic token usage (`tokens_input`, `tokens_output`) but modern AI models report richer usage data:

- **Reasoning tokens**: Models like Claude with extended thinking and o1-style reasoning report separate reasoning token counts
- **Cached input tokens**: Prompt caching reduces costs; tracking this enables accurate cost analysis
- **Cache write tokens**: Understanding cache population vs cache hits
- **Raw usage data**: Provider-specific fields that may be useful for debugging

The Vercel AI SDK has comprehensive usage tracking that we should align with.

</overview>

---

<current-state>

## Smithers Database Schema (Current)

### agents table

```sql
-- Current token tracking in agents table
tokens_input INTEGER,
tokens_output INTEGER,
```

### agents.ts module

```typescript
complete: (id: string, result: string, structuredResult?: Record<string, any>, tokens?: { input: number; output: number }) => void
```

### executions table

```sql
total_tokens_used INTEGER DEFAULT 0  -- Simple aggregate
```

### Agent TypeScript interface

```typescript
interface Agent {
  // ... other fields
  tokens_input?: number
  tokens_output?: number
}
```

</current-state>

---

<ai-sdk-reference>

## AI SDK Usage Types

### LanguageModelUsage (packages/ai/src/types/usage.ts)

```typescript
type LanguageModelUsage = {
  // Core counts
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;

  // Detailed input breakdown
  inputTokenDetails: {
    noCacheTokens: number | undefined;    // Non-cached input tokens
    cacheReadTokens: number | undefined;   // Tokens read from cache
    cacheWriteTokens: number | undefined;  // Tokens written to cache
  };

  // Detailed output breakdown
  outputTokenDetails: {
    textTokens: number | undefined;       // Regular output tokens
    reasoningTokens: number | undefined;  // Thinking/reasoning tokens
  };

  // Legacy (deprecated but still present)
  reasoningTokens?: number | undefined;
  cachedInputTokens?: number | undefined;

  // Provider-specific raw data
  raw?: JSONObject;
};
```

### Stream Protocol - Finish Events

Usage data is delivered via stream events:

```typescript
// finish-step event (per step)
{
  type: 'finish-step';
  response: LanguageModelResponseMetadata;
  usage: LanguageModelUsage;
  finishReason: FinishReason;
}

// finish event (aggregate)
{
  type: 'finish';
  finishReason: FinishReason;
  totalUsage: LanguageModelUsage;
}
```

### TelemetrySettings (packages/ai/src/telemetry/telemetry-settings.ts)

```typescript
type TelemetrySettings = {
  isEnabled?: boolean;
  recordInputs?: boolean;     // Control input logging (privacy)
  recordOutputs?: boolean;    // Control output logging (privacy)
  functionId?: string;        // Group by function
  metadata?: Record<string, AttributeValue>;  // Custom attributes
  tracer?: Tracer;            // OpenTelemetry tracer
};
```

### OpenTelemetry Attributes (get-base-telemetry-attributes.ts)

```typescript
// Attributes recorded on spans
'ai.model.provider': string;
'ai.model.id': string;
'ai.settings.*': AttributeValue;
'ai.telemetry.metadata.*': AttributeValue;
'ai.request.headers.*': string;
```

</ai-sdk-reference>

---

<schema-changes>

## Proposed Schema Changes

### 1. Extend agents table

```sql
-- Migration: Add detailed token tracking to agents table
ALTER TABLE agents ADD COLUMN tokens_reasoning INTEGER;
ALTER TABLE agents ADD COLUMN tokens_cache_read INTEGER;
ALTER TABLE agents ADD COLUMN tokens_cache_write INTEGER;
ALTER TABLE agents ADD COLUMN tokens_no_cache INTEGER;
ALTER TABLE agents ADD COLUMN tokens_text INTEGER;
ALTER TABLE agents ADD COLUMN usage_raw TEXT;  -- JSON: provider-specific raw usage

-- Create indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_agents_model_tokens ON agents(model, tokens_input, tokens_output);
```

### 2. Full schema for new agents table

```sql
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  phase_id TEXT REFERENCES phases(id) ON DELETE SET NULL,

  -- Configuration
  model TEXT NOT NULL DEFAULT 'sonnet',
  system_prompt TEXT,

  -- Input
  prompt TEXT NOT NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',

  -- Output
  result TEXT,
  result_structured TEXT,
  log_path TEXT,
  error TEXT,

  -- Timing
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),

  -- Core token metrics
  duration_ms INTEGER,
  tokens_input INTEGER,          -- Total input tokens
  tokens_output INTEGER,         -- Total output tokens

  -- Detailed input breakdown
  tokens_no_cache INTEGER,       -- Non-cached input tokens
  tokens_cache_read INTEGER,     -- Tokens read from cache (cost savings!)
  tokens_cache_write INTEGER,    -- Tokens written to cache

  -- Detailed output breakdown
  tokens_text INTEGER,           -- Regular text output tokens
  tokens_reasoning INTEGER,      -- Thinking/reasoning tokens (Claude, o1)

  -- Raw provider data
  usage_raw TEXT,                -- JSON: Full provider usage response

  tool_calls_count INTEGER DEFAULT 0
);
```

</schema-changes>

---

<typescript-changes>

## TypeScript Interface Updates

### 1. Agent interface (src/db/types.ts)

```typescript
export interface Agent {
  id: string
  execution_id: string
  phase_id?: string
  model: string
  system_prompt?: string
  prompt: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  result?: string
  result_structured?: Record<string, any>
  log_path?: string
  error?: string
  started_at?: Date
  completed_at?: Date
  created_at: Date
  duration_ms?: number

  // Core token counts
  tokens_input?: number
  tokens_output?: number

  // Detailed input breakdown
  tokens_no_cache?: number
  tokens_cache_read?: number
  tokens_cache_write?: number

  // Detailed output breakdown
  tokens_text?: number
  tokens_reasoning?: number

  // Raw provider data
  usage_raw?: Record<string, any>

  tool_calls_count: number
}
```

### 2. Usage input type for agents module

```typescript
// New comprehensive usage type matching AI SDK
export interface AgentUsage {
  input: number
  output: number

  // Optional detailed breakdown
  inputDetails?: {
    noCache?: number
    cacheRead?: number
    cacheWrite?: number
  }

  outputDetails?: {
    text?: number
    reasoning?: number
  }

  raw?: Record<string, any>
}
```

### 3. Updated AgentsModule interface (src/db/agents.ts)

```typescript
export interface AgentsModule {
  start: (prompt: string, model?: string, systemPrompt?: string, logPath?: string) => string
  complete: (id: string, result: string, structuredResult?: Record<string, any>, usage?: AgentUsage) => void
  fail: (id: string, error: string) => void
  current: () => Agent | null
  list: (executionId: string) => Agent[]
}
```

### 4. Updated complete function implementation

```typescript
complete: (id: string, result: string, structuredResult?: Record<string, any>, usage?: AgentUsage) => {
  const startRow = rdb.queryOne<{ started_at: string; execution_id: string }>(
    'SELECT started_at, execution_id FROM agents WHERE id = ?', [id]
  )
  const durationMs = startRow ? Date.now() - new Date(startRow.started_at).getTime() : null

  rdb.run(
    `UPDATE agents SET
      status = 'completed',
      result = ?,
      result_structured = ?,
      tokens_input = ?,
      tokens_output = ?,
      tokens_no_cache = ?,
      tokens_cache_read = ?,
      tokens_cache_write = ?,
      tokens_text = ?,
      tokens_reasoning = ?,
      usage_raw = ?,
      completed_at = ?,
      duration_ms = ?
    WHERE id = ?`,
    [
      result,
      structuredResult ? JSON.stringify(structuredResult) : null,
      usage?.input ?? null,
      usage?.output ?? null,
      usage?.inputDetails?.noCache ?? null,
      usage?.inputDetails?.cacheRead ?? null,
      usage?.inputDetails?.cacheWrite ?? null,
      usage?.outputDetails?.text ?? null,
      usage?.outputDetails?.reasoning ?? null,
      usage?.raw ? JSON.stringify(usage.raw) : null,
      now(),
      durationMs,
      id
    ]
  )

  if (usage && startRow) {
    const totalTokens = (usage.input ?? 0) + (usage.output ?? 0)
    rdb.run(
      'UPDATE executions SET total_tokens_used = total_tokens_used + ? WHERE id = ?',
      [totalTokens, startRow.execution_id]
    )
  }

  if (getCurrentAgentId() === id) setCurrentAgentId(null)
}
```

</typescript-changes>

---

<stream-integration>

## Stream Protocol Integration

When consuming AI SDK streams, extract usage from finish events:

```typescript
// Example: Processing stream parts in a Claude component
for await (const part of stream.fullStream) {
  switch (part.type) {
    case 'finish-step':
      // Step-level usage available
      const stepUsage = part.usage
      break

    case 'finish':
      // Final aggregate usage
      const totalUsage = part.totalUsage

      // Map to Smithers AgentUsage format
      const agentUsage: AgentUsage = {
        input: totalUsage.inputTokens ?? 0,
        output: totalUsage.outputTokens ?? 0,
        inputDetails: {
          noCache: totalUsage.inputTokenDetails?.noCacheTokens,
          cacheRead: totalUsage.inputTokenDetails?.cacheReadTokens,
          cacheWrite: totalUsage.inputTokenDetails?.cacheWriteTokens,
        },
        outputDetails: {
          text: totalUsage.outputTokenDetails?.textTokens,
          reasoning: totalUsage.outputTokenDetails?.reasoningTokens,
        },
        raw: totalUsage.raw,
      }

      db.agents.complete(agentId, text, structuredResult, agentUsage)
      break
  }
}
```

</stream-integration>

---

<opentelemetry-future>

## Future: OpenTelemetry Integration (Optional)

For external observability platforms (Datadog, Honeycomb, etc.):

### Enable OpenTelemetry in AI SDK calls

```typescript
import { streamText } from 'ai'
import { trace } from '@opentelemetry/api'

const result = await streamText({
  model: anthropic('claude-sonnet-4-20250514'),
  messages,
  experimental_telemetry: {
    isEnabled: true,
    functionId: 'smithers-agent',
    metadata: {
      'smithers.execution_id': executionId,
      'smithers.agent_id': agentId,
      'smithers.phase': phaseName,
    },
    tracer: trace.getTracer('smithers'),
  },
})
```

### Span attributes recorded automatically

- `ai.model.provider` - "anthropic", "openai", etc.
- `ai.model.id` - "claude-sonnet-4-20250514", etc.
- `ai.settings.maxTokens` - configured max tokens
- `ai.telemetry.metadata.*` - custom metadata fields

### Benefits

1. Distributed tracing across multi-agent orchestrations
2. Integration with existing APM infrastructure
3. Correlation with other application telemetry
4. Alert on token usage anomalies

### Implementation notes

- Requires `@opentelemetry/api` and an exporter
- Optional - Smithers SQLite remains the primary data store
- Configure via SmithersConfig or environment variables

</opentelemetry-future>

---

<analytics-queries>

## Useful Analytics Queries

### Cost analysis with cache savings

```sql
-- Calculate effective cost savings from prompt caching
SELECT
  model,
  COUNT(*) as agent_count,
  SUM(tokens_input) as total_input,
  SUM(tokens_cache_read) as cached_input,
  SUM(tokens_no_cache) as uncached_input,
  ROUND(SUM(tokens_cache_read) * 100.0 / NULLIF(SUM(tokens_input), 0), 2) as cache_hit_rate,
  SUM(tokens_reasoning) as total_reasoning
FROM agents
WHERE status = 'completed'
GROUP BY model
ORDER BY total_input DESC;
```

### Reasoning model usage

```sql
-- Track reasoning token usage over time
SELECT
  DATE(created_at) as day,
  model,
  SUM(tokens_reasoning) as reasoning_tokens,
  SUM(tokens_output) as total_output,
  ROUND(SUM(tokens_reasoning) * 100.0 / NULLIF(SUM(tokens_output), 0), 2) as reasoning_ratio
FROM agents
WHERE tokens_reasoning IS NOT NULL
GROUP BY DATE(created_at), model
ORDER BY day DESC;
```

### Execution cost breakdown

```sql
-- Per-execution token breakdown
SELECT
  e.id,
  e.name,
  COUNT(a.id) as agent_count,
  SUM(a.tokens_input) as total_input,
  SUM(a.tokens_output) as total_output,
  SUM(a.tokens_cache_read) as cached_tokens,
  SUM(a.tokens_reasoning) as reasoning_tokens
FROM executions e
LEFT JOIN agents a ON a.execution_id = e.id
WHERE e.status = 'completed'
GROUP BY e.id
ORDER BY e.created_at DESC
LIMIT 20;
```

</analytics-queries>

---

<implementation-steps>

## Implementation Checklist

### Phase 1: Schema Updates

- [ ] Create migration script for new columns
- [ ] Update `src/db/schema.sql` with new columns
- [ ] Add indexes for analytics queries
- [ ] Test migration on existing databases

### Phase 2: TypeScript Updates

- [ ] Define `AgentUsage` interface in `src/db/types.ts`
- [ ] Update `Agent` interface with new fields
- [ ] Update `AgentsModule.complete()` signature
- [ ] Update `createAgentsModule` implementation
- [ ] Update `mapAgent` helper for JSON parsing of `usage_raw`

### Phase 3: Integration Points

- [ ] Update Claude component to extract usage from stream
- [ ] Pass usage data through component completion flow
- [ ] Handle backwards compatibility (optional fields)

### Phase 4: Testing

- [ ] Unit tests for agents module with new usage fields
- [ ] Integration test with mock AI SDK usage data
- [ ] Verify analytics queries work correctly

### Phase 5: Documentation

- [ ] Update CLAUDE.md with usage tracking notes
- [ ] Document analytics queries for operators

</implementation-steps>

---

<testing-examples>

## Test Cases

### agents.test.ts updates

```typescript
import { test, expect, beforeEach, afterEach } from 'bun:test'

test('complete() stores detailed usage data', () => {
  const agentId = agents.start('Test prompt', 'claude-sonnet-4', undefined, undefined)

  agents.complete(agentId, 'Test result', undefined, {
    input: 1000,
    output: 500,
    inputDetails: {
      noCache: 800,
      cacheRead: 200,
      cacheWrite: 50,
    },
    outputDetails: {
      text: 400,
      reasoning: 100,
    },
    raw: { custom_field: 'value' },
  })

  const agent = rdb.queryOne<any>('SELECT * FROM agents WHERE id = ?', [agentId])

  expect(agent.tokens_input).toBe(1000)
  expect(agent.tokens_output).toBe(500)
  expect(agent.tokens_cache_read).toBe(200)
  expect(agent.tokens_reasoning).toBe(100)
  expect(JSON.parse(agent.usage_raw)).toEqual({ custom_field: 'value' })
})

test('complete() handles minimal usage (backwards compatibility)', () => {
  const agentId = agents.start('Test prompt', 'claude-sonnet-4', undefined, undefined)

  // Old-style usage with just input/output
  agents.complete(agentId, 'Test result', undefined, {
    input: 100,
    output: 50,
  })

  const agent = rdb.queryOne<any>('SELECT * FROM agents WHERE id = ?', [agentId])

  expect(agent.tokens_input).toBe(100)
  expect(agent.tokens_output).toBe(50)
  expect(agent.tokens_reasoning).toBeNull()
  expect(agent.usage_raw).toBeNull()
})
```

</testing-examples>

---

<related-files>

## Files to Modify

| File | Changes |
|------|---------|
| `src/db/schema.sql` | Add new columns to agents table |
| `src/db/types.ts` | Add `AgentUsage` interface, update `Agent` |
| `src/db/agents.ts` | Update `complete()` function |
| `src/db/agents.test.ts` | Add tests for new usage fields |
| `src/components/Claude.tsx` | Extract usage from stream finish events |

</related-files>

---

<references>

## AI SDK Reference Files

- `reference/vercel-ai-sdk/packages/ai/src/types/usage.ts` - LanguageModelUsage type
- `reference/vercel-ai-sdk/packages/ai/src/telemetry/telemetry-settings.ts` - TelemetrySettings
- `reference/vercel-ai-sdk/packages/ai/src/telemetry/record-span.ts` - OpenTelemetry span recording
- `reference/vercel-ai-sdk/packages/ai/src/telemetry/get-base-telemetry-attributes.ts` - Span attributes
- `reference/vercel-ai-sdk/packages/ai/src/generate-text/stream-text-result.ts` - Stream part types with usage

</references>
