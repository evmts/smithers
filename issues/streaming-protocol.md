# Adopt Vercel AI SDK V3StreamPart Streaming Protocol

<metadata>
  <priority>high</priority>
  <category>architecture</category>
  <estimated-effort>2-3 days</estimated-effort>
  <dependencies>
    - src/monitor/log-writer.ts
    - src/components/Claude.tsx
    - src/components/agents/claude-cli/executor.ts
    - src/db/agents.ts
  </dependencies>
</metadata>

---

## Executive Summary

Smithers currently streams raw, untyped text from Claude CLI. By adopting the Vercel AI SDK's V3StreamPart protocol, we gain structured streaming events that enable rich observability, better debugging, and sophisticated UI integrations.

---

<section name="problem-statement">

## Problem Statement

### Current State

The Smithers streaming pipeline is simple but limited:

```
Claude CLI (Bun.spawn)
    -> stdout chunks (raw text)
    -> onProgress callback (string)
    -> LogWriter.appendLog (writes raw text)
    -> Database (only final result stored)
```

**Key Files:**
- `/Users/williamcory/smithers2/src/components/agents/claude-cli/executor.ts` - Spawns Claude CLI and reads stdout
- `/Users/williamcory/smithers2/src/monitor/log-writer.ts` - Writes raw text to log files
- `/Users/williamcory/smithers2/src/components/Claude.tsx` - React component that orchestrates execution

### Current Code Example

```typescript
// From executor.ts - lines 59-68
const readStream = async () => {
  while (true) {
    const { done, value } = await stdoutReader.read()
    if (done) break

    const chunk = decoder.decode(value)
    stdout += chunk

    // Report progress - just raw text!
    options.onProgress?.(chunk)
```

```typescript
// From Claude.tsx - lines 137-144
onProgress: (chunk) => {
  // Stream to log file - just raw text!
  if (logFilename) {
    logWriter.appendLog(logFilename, chunk)
  }
  // Call original onProgress
  props.onProgress?.(chunk)
},
```

### What We're Missing

1. **No semantic structure** - Can't distinguish text output from tool calls from reasoning
2. **No progress granularity** - Tool inputs stream as opaque text, not incrementally
3. **No real-time metrics** - Token usage only available at completion
4. **Weak observability** - Log files are raw text dumps, hard to query
5. **Limited UI potential** - Can't show reasoning separately, can't show tool call progress

</section>

---

<section name="proposed-solution">

## Proposed Solution: V3StreamPart Protocol

Adopt the Vercel AI SDK's streaming protocol as defined in:
`/Users/williamcory/smithers2/reference/vercel-ai-sdk/packages/provider/src/language-model/v3/language-model-v3-stream-part.ts`

### Why V3StreamPart?

1. **Industry Standard** - Widely adopted by Vercel, used across their AI ecosystem
2. **Comprehensive Types** - Covers text, reasoning, tools, files, metadata, errors
3. **Streaming-First** - Designed for incremental delivery with start/delta/end patterns
4. **Provider Agnostic** - Works with any AI backend, not just Vercel's
5. **Already Available** - Reference implementation in our repo for guidance

### Core Stream Part Types

```typescript
// From reference/vercel-ai-sdk/packages/provider/src/language-model/v3/language-model-v3-stream-part.ts

export type LanguageModelV3StreamPart =
  // Text blocks - for main response content
  | { type: 'text-start'; id: string }
  | { type: 'text-delta'; id: string; delta: string }
  | { type: 'text-end'; id: string }

  // Reasoning blocks - for thinking/chain-of-thought (Claude's extended thinking)
  | { type: 'reasoning-start'; id: string }
  | { type: 'reasoning-delta'; id: string; delta: string }
  | { type: 'reasoning-end'; id: string }

  // Tool invocation lifecycle
  | { type: 'tool-input-start'; id: string; toolName: string }
  | { type: 'tool-input-delta'; id: string; delta: string }
  | { type: 'tool-input-end'; id: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: string }
  | { type: 'tool-result'; toolCallId: string; toolName: string; result: JSONValue }

  // Stream lifecycle
  | { type: 'stream-start'; warnings: Warning[] }
  | { type: 'response-metadata'; /* request/response IDs, model info */ }
  | { type: 'finish'; usage: Usage; finishReason: FinishReason }

  // Files and sources
  | { type: 'file'; mediaType: string; data: string | Uint8Array }
  | { type: 'source'; sourceType: 'url' | 'document'; /* ... */ }

  // Errors
  | { type: 'error'; error: unknown }
```

</section>

---

<section name="implementation-plan">

## Implementation Plan

### Phase 1: Define Smithers Stream Types

Create a new module at `src/streaming/types.ts`:

```typescript
// Smithers-specific stream part types, inspired by V3StreamPart
// We extend the protocol with Claude Code specific fields

import type { LanguageModelV3StreamPart } from './v3-compat'

// Re-export compatible types
export type StreamPart = LanguageModelV3StreamPart

// Smithers-specific extensions for Claude Code CLI
export type SmithersStreamPart = StreamPart | {
  type: 'cli-output';
  stream: 'stdout' | 'stderr';
  raw: string;
} | {
  type: 'session-info';
  sessionId: string;
  model: string;
}
```

### Phase 2: Create Stream Parser

Claude CLI outputs need to be parsed into stream parts. Create `src/streaming/claude-parser.ts`:

```typescript
// BEFORE: Raw text chunks
onProgress: (chunk: string) => void

// AFTER: Typed stream events
onStreamPart: (part: SmithersStreamPart) => void
```

**Parsing Strategy for Claude CLI:**

The Claude CLI outputs structured JSON in `--output-format json` mode. We need to:

1. Buffer incoming chunks until we have complete JSON objects
2. Parse the JSON structure to identify content types
3. Emit appropriate stream parts

```typescript
export class ClaudeStreamParser {
  private buffer = ''
  private currentBlockId: string | null = null
  private currentBlockType: 'text' | 'reasoning' | 'tool' | null = null

  parse(chunk: string): SmithersStreamPart[] {
    this.buffer += chunk
    const parts: SmithersStreamPart[] = []

    // Try to extract complete JSON blocks or text segments
    // Claude CLI with --output-format stream-json outputs newline-delimited JSON

    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? '' // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue

      try {
        const event = JSON.parse(line)
        parts.push(...this.mapClaudeEventToStreamPart(event))
      } catch {
        // Raw text - emit as text-delta
        if (this.currentBlockType !== 'text') {
          if (this.currentBlockId) {
            parts.push({ type: `${this.currentBlockType}-end`, id: this.currentBlockId })
          }
          this.currentBlockId = crypto.randomUUID()
          this.currentBlockType = 'text'
          parts.push({ type: 'text-start', id: this.currentBlockId })
        }
        parts.push({ type: 'text-delta', id: this.currentBlockId!, delta: line })
      }
    }

    return parts
  }

  private mapClaudeEventToStreamPart(event: any): SmithersStreamPart[] {
    // Map Claude's JSON event format to V3StreamPart
    // This will need to be adapted based on actual Claude CLI output format
    const parts: SmithersStreamPart[] = []

    if (event.type === 'thinking' || event.type === 'reasoning') {
      // Extended thinking content
      const id = event.id ?? crypto.randomUUID()
      parts.push({ type: 'reasoning-start', id })
      parts.push({ type: 'reasoning-delta', id, delta: event.content })
      parts.push({ type: 'reasoning-end', id })
    }

    if (event.type === 'tool_use') {
      // Tool invocation
      const id = event.id ?? crypto.randomUUID()
      parts.push({
        type: 'tool-input-start',
        id,
        toolName: event.name,
      })
      parts.push({
        type: 'tool-input-delta',
        id,
        delta: JSON.stringify(event.input),
      })
      parts.push({ type: 'tool-input-end', id })
      parts.push({
        type: 'tool-call',
        toolCallId: id,
        toolName: event.name,
        input: JSON.stringify(event.input),
      })
    }

    if (event.type === 'tool_result') {
      parts.push({
        type: 'tool-result',
        toolCallId: event.tool_use_id,
        toolName: event.name ?? 'unknown',
        result: event.content,
      })
    }

    return parts
  }
}
```

### Phase 3: Update LogWriter for Typed Events

Modify `/Users/williamcory/smithers2/src/monitor/log-writer.ts`:

```typescript
// BEFORE
appendLog(filename: string, content: string): string

// AFTER
appendStreamPart(filename: string, part: SmithersStreamPart): string {
  const filepath = path.join(this.logDir, filename)

  // Write as newline-delimited JSON for easy parsing
  const line = JSON.stringify({
    timestamp: Date.now(),
    ...part
  }) + '\n'

  let stream = this.streams.get(filename)
  if (!stream) {
    stream = fs.createWriteStream(filepath, { flags: 'a', encoding: 'utf-8' })
    this.streams.set(filename, stream)
  }

  stream.write(line)
  return filepath
}

// Also add a summary writer for key events
writeStreamSummary(filename: string, parts: SmithersStreamPart[]): void {
  const summary = {
    textBlocks: parts.filter(p => p.type === 'text-end').length,
    reasoningBlocks: parts.filter(p => p.type === 'reasoning-end').length,
    toolCalls: parts.filter(p => p.type === 'tool-call').length,
    toolResults: parts.filter(p => p.type === 'tool-result').length,
    errors: parts.filter(p => p.type === 'error').length,
  }

  const summaryPath = filepath.replace('.log', '.summary.json')
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2))
}
```

### Phase 4: Update Claude Component

Modify `/Users/williamcory/smithers2/src/components/Claude.tsx`:

```typescript
// Create parser instance
const parser = new ClaudeStreamParser()

// In executeClaudeCLI call:
onProgress: (chunk) => {
  // Parse raw chunk into typed stream parts
  const parts = parser.parse(chunk)

  for (const part of parts) {
    // Write typed event to log
    logWriter.appendStreamPart(logFilename, part)

    // Emit to any listeners (for UI integration)
    streamEvents.emit('part', part)

    // Handle specific events
    if (part.type === 'tool-call') {
      props.onToolCall?.(part.toolName, JSON.parse(part.input))
    }

    // Still call original onProgress with text content
    if (part.type === 'text-delta') {
      props.onProgress?.(part.delta)
    }
  }
}
```

### Phase 5: Database Integration

Update `/Users/williamcory/smithers2/src/db/agents.ts` to store stream metadata:

```typescript
// Add new table for stream events (optional, for queryable history)
CREATE TABLE agent_stream_events (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  event_type TEXT NOT NULL,
  event_id TEXT,
  tool_name TEXT,
  content TEXT,
  timestamp INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

// Add summary columns to agents table
ALTER TABLE agents ADD COLUMN stream_summary JSON;
-- Contains: { textBlocks, reasoningBlocks, toolCalls, toolResults, errors }
```

Update agents module:

```typescript
export interface AgentsModule {
  // ... existing methods

  // New: Record individual stream events (for detailed debugging)
  recordStreamEvent: (agentId: string, part: SmithersStreamPart) => void

  // New: Get stream events for an agent
  getStreamEvents: (agentId: string, options?: {
    types?: string[]
    limit?: number
  }) => StreamEvent[]
}
```

</section>

---

<section name="benefits">

## Benefits

### 1. Rich Observability

**Before:**
```
[2024-01-18 12:34:56] Raw text dump of everything Claude said...
```

**After:**
```jsonl
{"timestamp":1705584896000,"type":"stream-start","warnings":[]}
{"timestamp":1705584896100,"type":"reasoning-start","id":"r1"}
{"timestamp":1705584896150,"type":"reasoning-delta","id":"r1","delta":"Let me analyze this..."}
{"timestamp":1705584897000,"type":"reasoning-end","id":"r1"}
{"timestamp":1705584897100,"type":"tool-input-start","id":"t1","toolName":"Read"}
{"timestamp":1705584897200,"type":"tool-call","toolCallId":"t1","toolName":"Read","input":"{\"file\":\"/src/main.ts\"}"}
{"timestamp":1705584898000,"type":"tool-result","toolCallId":"t1","toolName":"Read","result":"...file contents..."}
{"timestamp":1705584899000,"type":"text-start","id":"x1"}
{"timestamp":1705584899100,"type":"text-delta","id":"x1","delta":"Based on the code..."}
{"timestamp":1705584900000,"type":"finish","usage":{"inputTokens":{"total":1500},"outputTokens":{"total":800}},"finishReason":{"unified":"stop"}}
```

### 2. Real-time Metrics

Track token usage incrementally, not just at completion:
- Show cost accumulation in real-time
- Enable early termination based on token budgets
- Break down tokens by reasoning vs output

### 3. Better Debugging

Query stream events to understand agent behavior:
```sql
-- Find all tool calls that took > 5 seconds
SELECT * FROM agent_stream_events
WHERE event_type = 'tool-call'
AND agent_id IN (
  SELECT agent_id FROM agent_stream_events
  WHERE event_type = 'tool-result'
  AND timestamp - (
    SELECT timestamp FROM agent_stream_events e2
    WHERE e2.event_type = 'tool-call'
    AND e2.event_id = agent_stream_events.event_id
  ) > 5000
);
```

### 4. Richer UIs

Enable sophisticated monitoring interfaces:

```tsx
function AgentMonitor({ agentId }) {
  const [parts, setParts] = useState<SmithersStreamPart[]>([])

  useEffect(() => {
    const unsubscribe = streamEvents.subscribe(agentId, (part) => {
      setParts(prev => [...prev, part])
    })
    return unsubscribe
  }, [agentId])

  return (
    <div className="agent-monitor">
      {/* Show reasoning in collapsible section */}
      <ReasoningPanel
        parts={parts.filter(p => p.type.startsWith('reasoning-'))}
      />

      {/* Show tool calls with progress */}
      <ToolCallsPanel
        parts={parts.filter(p =>
          p.type.startsWith('tool-') || p.type === 'tool-call'
        )}
      />

      {/* Show main text output */}
      <OutputPanel
        parts={parts.filter(p => p.type.startsWith('text-'))}
      />

      {/* Real-time token usage */}
      <TokenUsage
        finish={parts.find(p => p.type === 'finish')}
      />
    </div>
  )
}
```

### 5. Structured Tool Call Tracking

Currently, the `onToolCall` callback receives parsed data, but there's no lifecycle tracking. With stream parts:

```typescript
// Track tool call lifecycle
const toolCalls = new Map<string, {
  startTime: number
  toolName: string
  input?: string
  result?: any
  endTime?: number
}>()

streamEvents.on('part', (part) => {
  if (part.type === 'tool-input-start') {
    toolCalls.set(part.id, {
      startTime: Date.now(),
      toolName: part.toolName,
    })
  }
  if (part.type === 'tool-call') {
    const call = toolCalls.get(part.toolCallId)
    if (call) call.input = part.input
  }
  if (part.type === 'tool-result') {
    const call = toolCalls.get(part.toolCallId)
    if (call) {
      call.result = part.result
      call.endTime = Date.now()
      // Now we have complete timing and data for the tool call
    }
  }
})
```

</section>

---

<section name="migration-strategy">

## Migration Strategy

### Backward Compatibility

1. Keep `onProgress: (chunk: string)` working - extract text deltas and emit them
2. Add new `onStreamPart: (part: SmithersStreamPart)` for typed events
3. Log files continue to work but switch to NDJSON format
4. Add `.log.legacy.txt` fallback for raw text (configurable)

### Feature Flags

```typescript
interface ClaudeProps {
  // ... existing props

  /** Enable V3StreamPart protocol (default: true in next major version) */
  experimentalTypedStreaming?: boolean

  /** Write legacy raw text logs alongside NDJSON (default: false) */
  legacyLogFormat?: boolean
}
```

### Rollout Plan

1. **v0.x**: Add behind `experimentalTypedStreaming` flag
2. **v1.0**: Enable by default, `legacyLogFormat` available
3. **v2.0**: Remove legacy format, typed streaming only

</section>

---

<section name="reference-files">

## Reference Files

### Vercel AI SDK (in `reference/vercel-ai-sdk/`)

| File | Purpose |
|------|---------|
| `packages/provider/src/language-model/v3/language-model-v3-stream-part.ts` | Core stream part type definition |
| `packages/provider/src/language-model/v3/language-model-v3-usage.ts` | Token usage with cache breakdown |
| `packages/provider/src/language-model/v3/language-model-v3-finish-reason.ts` | Unified finish reasons |
| `packages/provider/src/language-model/v3/language-model-v3-tool-call.ts` | Tool call structure |
| `packages/provider/src/language-model/v3/language-model-v3-tool-result.ts` | Tool result structure |
| `packages/provider/src/language-model/v3/language-model-v3-file.ts` | File attachment structure |
| `packages/provider/src/language-model/v3/language-model-v3-source.ts` | Source citation structure |

### Smithers Files to Modify

| File | Changes Needed |
|------|----------------|
| `src/streaming/types.ts` | NEW: Define SmithersStreamPart types |
| `src/streaming/claude-parser.ts` | NEW: Parse Claude CLI output to stream parts |
| `src/monitor/log-writer.ts` | Add `appendStreamPart()` method |
| `src/components/Claude.tsx` | Integrate parser, emit typed events |
| `src/components/agents/claude-cli/executor.ts` | Pass through structured events |
| `src/db/agents.ts` | Add stream event recording |
| `src/db/schema.ts` | Add agent_stream_events table |

</section>

---

<section name="acceptance-criteria">

## Acceptance Criteria

- [ ] `SmithersStreamPart` type defined matching V3StreamPart semantics
- [ ] `ClaudeStreamParser` correctly parses Claude CLI output into stream parts
- [ ] `LogWriter.appendStreamPart()` writes NDJSON format
- [ ] Claude component emits `onStreamPart` events
- [ ] Stream events recorded to database (optional, configurable)
- [ ] Backward compatible `onProgress` still works
- [ ] Log files are valid NDJSON, parseable by tools like `jq`
- [ ] Token usage available incrementally via `finish` event
- [ ] Tool calls have complete lifecycle: start -> delta -> end -> call -> result
- [ ] Reasoning content separated from main text output
- [ ] Documentation updated with streaming protocol guide

</section>

---

<section name="future-considerations">

## Future Considerations

### WebSocket Streaming to Monitor UI

Once stream parts are typed, we can easily forward them over WebSocket:

```typescript
// In monitor server
wss.on('connection', (ws) => {
  streamEvents.on('part', (agentId, part) => {
    ws.send(JSON.stringify({ agentId, part }))
  })
})
```

### Multi-Agent Correlation

With typed events, we can correlate activity across agents in a workflow:

```typescript
// Timeline view of all agents in an execution
const timeline = db.query(`
  SELECT
    a.id as agent_id,
    a.model,
    e.event_type,
    e.timestamp
  FROM agents a
  JOIN agent_stream_events e ON e.agent_id = a.id
  WHERE a.execution_id = ?
  ORDER BY e.timestamp
`, [executionId])
```

### Provider-Specific Metadata

The `providerMetadata` field in V3StreamPart allows for Claude-specific extensions:

```typescript
type ClaudeProviderMetadata = {
  claude?: {
    cacheCreationInputTokens?: number
    cacheReadInputTokens?: number
    thinkingTokens?: number
  }
}
```

</section>

---

## Summary

Adopting the V3StreamPart protocol transforms Smithers from a raw-text-streaming system to a semantically-rich event stream. This enables better observability, debugging, and UI integration while maintaining backward compatibility. The implementation leverages the reference code in our repository and follows industry standards established by the Vercel AI SDK.
