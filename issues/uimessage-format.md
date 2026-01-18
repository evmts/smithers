# UIMessage Format Adoption for Structured Message History

**Status**: FUTURE ENHANCEMENT
**Priority**: Medium
**Dependencies**: Requires investigation into Claude Code CLI log formats
**Related**: Streaming protocol issue, agent observability improvements

**BLOCKED** we aren't doing this feature anytime soon

---

## Overview

This issue proposes adopting the Vercel AI SDK's `UIMessage` format for storing structured message history in Smithers. Currently, agent executions store messages as plain strings (`prompt` and `result`), losing valuable structured information about tool calls, reasoning, file operations, and sources.

---

## Problem Statement

### Current State

Smithers tracks agent executions in the `agents` table with minimal structure:

```typescript
interface Agent {
  id: string
  execution_id: string
  phase_id?: string
  model: string
  system_prompt?: string
  prompt: string              // Plain text input
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  result?: string             // Plain text output
  result_structured?: Record<string, any>
  log_path?: string           // Path to raw log file
  error?: string
  started_at?: Date
  completed_at?: Date
  created_at: Date
  duration_ms?: number
  tokens_input?: number
  tokens_output?: number
  tool_calls_count: number
}
```

### Limitations

1. **No part-level granularity**: Cannot distinguish between text, reasoning, tool calls, and files in a response
2. **Tool call details lost**: Only `tool_calls_count` is tracked, not the actual invocations
3. **No reasoning visibility**: Extended thinking/reasoning blocks are not captured separately
4. **No source tracking**: Cannot trace back to sources the model cited
5. **Difficult UI rendering**: Cannot render rich message UIs with collapsible tool calls, reasoning blocks, etc.
6. **No replay capability**: Cannot reconstruct the exact conversation flow for debugging or replay

---

## Proposed Solution: UIMessage Format

Adopt the Vercel AI SDK's `UIMessage` format which provides a structured, part-based message representation.

<type_definitions>

```typescript
/**
 * AI SDK UI Messages - Core Interface
 * From: reference/vercel-ai-sdk/packages/ai/src/ui/ui-messages.ts
 */

interface UIMessage<
  METADATA = unknown,
  DATA_PARTS extends UIDataTypes = UIDataTypes,
  TOOLS extends UITools = UITools,
> {
  /**
   * A unique identifier for the message.
   */
  id: string;

  /**
   * The role of the message.
   */
  role: 'system' | 'user' | 'assistant';

  /**
   * The metadata of the message.
   */
  metadata?: METADATA;

  /**
   * The parts of the message. Use this for rendering the message in the UI.
   *
   * System messages can have text parts.
   * User messages can have text parts and file parts.
   * Assistant messages can have text, reasoning, tool invocation, and file parts.
   */
  parts: Array<UIMessagePart<DATA_PARTS, TOOLS>>;
}

/**
 * Union type of all possible message parts
 */
type UIMessagePart<DATA_TYPES, TOOLS> =
  | TextUIPart
  | ReasoningUIPart
  | ToolUIPart<TOOLS>
  | DynamicToolUIPart
  | SourceUrlUIPart
  | SourceDocumentUIPart
  | FileUIPart
  | DataUIPart<DATA_TYPES>
  | StepStartUIPart;

/**
 * A text part of a message.
 */
type TextUIPart = {
  type: 'text';
  text: string;
  state?: 'streaming' | 'done';
  providerMetadata?: ProviderMetadata;
};

/**
 * A reasoning part of a message (extended thinking).
 */
type ReasoningUIPart = {
  type: 'reasoning';
  text: string;
  state?: 'streaming' | 'done';
  providerMetadata?: ProviderMetadata;
};

/**
 * A source URL part of a message.
 */
type SourceUrlUIPart = {
  type: 'source-url';
  sourceId: string;
  url: string;
  title?: string;
  providerMetadata?: ProviderMetadata;
};

/**
 * A document source part of a message.
 */
type SourceDocumentUIPart = {
  type: 'source-document';
  sourceId: string;
  mediaType: string;
  title: string;
  filename?: string;
  providerMetadata?: ProviderMetadata;
};

/**
 * A file part of a message.
 */
type FileUIPart = {
  type: 'file';
  mediaType: string;
  filename?: string;
  url: string;  // URL or Data URL
  providerMetadata?: ProviderMetadata;
};

/**
 * A step boundary part of a message.
 */
type StepStartUIPart = {
  type: 'step-start';
};

/**
 * Dynamic tool invocation (for tools not known at compile time)
 */
type DynamicToolUIPart = {
  type: 'dynamic-tool';
  toolName: string;
  toolCallId: string;
  title?: string;
  providerExecuted?: boolean;
} & ToolInvocationState;

/**
 * Tool invocation states
 */
type ToolInvocationState =
  | { state: 'input-streaming'; input: unknown | undefined }
  | { state: 'input-available'; input: unknown }
  | { state: 'approval-requested'; input: unknown; approval: { id: string } }
  | { state: 'approval-responded'; input: unknown; approval: { id: string; approved: boolean; reason?: string } }
  | { state: 'output-available'; input: unknown; output: unknown; preliminary?: boolean }
  | { state: 'output-error'; input: unknown; errorText: string }
  | { state: 'output-denied'; input: unknown; approval: { id: string; approved: false; reason?: string } };
```

</type_definitions>

---

## Key Investigation Required

<investigation>

### Claude Code CLI Log Format Analysis

Before implementing UIMessage support, we need to understand how Claude Code stores conversation logs:

#### Questions to Answer

1. **Where does Claude Code store conversation logs?**
   - Check `~/.claude/` directory structure
   - Look for session/conversation storage
   - Identify log file naming conventions

2. **What format are the logs in?**
   - JSON? JSONL? SQLite? Custom format?
   - Are they structured or plain text?
   - Do they include tool call details?

3. **What information is captured?**
   - Full message content
   - Tool invocations with inputs/outputs
   - Reasoning/thinking blocks
   - File operations
   - Timestamps and metadata

4. **Can we parse them into UIMessage format?**
   - Field mapping feasibility
   - Missing information gaps
   - Transformation complexity

#### Investigation Steps

```bash
# Explore Claude Code storage
ls -la ~/.claude/
find ~/.claude/ -type f -name "*.json" | head -20
find ~/.claude/ -type f -name "*.log" | head -20

# Check for conversation/session files
ls -la ~/.claude/projects/ 2>/dev/null
ls -la ~/.claude/sessions/ 2>/dev/null

# Examine a sample log file structure
# (adjust path based on discovery)
head -100 ~/.claude/[discovered-path]
```

#### Expected Log Locations (Hypothetical)

- `~/.claude/conversations/` - Conversation history
- `~/.claude/sessions/` - Session metadata
- `~/.claude/projects/[project-id]/` - Project-specific logs
- Log files referenced by `log_path` in agents table

</investigation>

---

## Proposed Schema Changes

<schema>

### Option A: Add messages column to agents table

```sql
-- Add JSONB column for structured messages
ALTER TABLE agents ADD COLUMN messages TEXT;  -- JSON array of UIMessage

-- Index for querying messages
CREATE INDEX idx_agents_messages ON agents(json_extract(messages, '$'));
```

### Option B: Create dedicated messages table (Recommended)

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  execution_id TEXT NOT NULL,

  -- Core UIMessage fields
  role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant')),
  sequence INTEGER NOT NULL,  -- Order within conversation

  -- Parts stored as JSON array
  parts TEXT NOT NULL,  -- JSON array of UIMessagePart

  -- Metadata
  metadata TEXT,  -- JSON object

  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),

  -- Denormalized for queries
  has_tool_calls INTEGER DEFAULT 0,
  has_reasoning INTEGER DEFAULT 0,
  has_files INTEGER DEFAULT 0,
  text_preview TEXT,  -- First 200 chars of text content

  UNIQUE(agent_id, sequence)
);

CREATE INDEX idx_messages_agent ON messages(agent_id);
CREATE INDEX idx_messages_execution ON messages(execution_id);
CREATE INDEX idx_messages_role ON messages(role);
CREATE INDEX idx_messages_has_tool_calls ON messages(has_tool_calls) WHERE has_tool_calls = 1;
```

### Option C: Separate parts into their own table (Most Normalized)

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  execution_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant')),
  sequence INTEGER NOT NULL,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(agent_id, sequence)
);

CREATE TABLE message_parts (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id),
  sequence INTEGER NOT NULL,

  -- Part type
  type TEXT NOT NULL CHECK(type IN (
    'text', 'reasoning', 'tool-invocation', 'file',
    'source-url', 'source-document', 'step-start', 'data'
  )),

  -- Content (interpretation depends on type)
  content TEXT,  -- JSON for complex parts, plain text for text parts

  -- Denormalized fields for common queries
  tool_name TEXT,           -- For tool invocations
  tool_call_id TEXT,        -- For tool invocations
  tool_state TEXT,          -- input-streaming, output-available, etc.

  UNIQUE(message_id, sequence)
);

CREATE INDEX idx_message_parts_message ON message_parts(message_id);
CREATE INDEX idx_message_parts_type ON message_parts(type);
CREATE INDEX idx_message_parts_tool_name ON message_parts(tool_name) WHERE tool_name IS NOT NULL;
```

</schema>

---

## Integration Points

<integration>

### 1. Log Parser Module

Create a module to parse Claude Code logs into UIMessage format:

```typescript
// src/parsers/claude-log-parser.ts

interface ClaudeLogParser {
  /**
   * Parse a Claude Code log file into UIMessage array
   */
  parseLogFile(logPath: string): Promise<UIMessage[]>;

  /**
   * Parse streaming log content (for real-time updates)
   */
  parseLogStream(stream: ReadableStream): AsyncIterable<UIMessage>;

  /**
   * Extract tool invocations from messages
   */
  extractToolCalls(messages: UIMessage[]): ToolInvocation[];
}
```

### 2. Agent Completion Hook

Enhance agent completion to parse and store messages:

```typescript
// In agents.ts complete() method
complete: async (id: string, result: string, ...) => {
  // Existing completion logic...

  // Parse log file if available
  const agent = getAgent(id);
  if (agent.log_path) {
    const messages = await parser.parseLogFile(agent.log_path);
    await storeMessages(id, messages);
  }
}
```

### 3. UI Rendering Components

Create React components for rendering UIMessage parts:

```typescript
// src/components/MessageParts.tsx

function MessagePart({ part }: { part: UIMessagePart }) {
  switch (part.type) {
    case 'text':
      return <TextPart text={part.text} />;
    case 'reasoning':
      return <ReasoningPart text={part.text} collapsible />;
    case 'dynamic-tool':
      return <ToolInvocationPart invocation={part} />;
    case 'file':
      return <FilePart file={part} />;
    case 'source-url':
      return <SourceLink source={part} />;
    default:
      return null;
  }
}
```

### 4. Streaming Protocol Integration

This feature connects with the streaming protocol work:

- Real-time message part updates during agent execution
- Progressive rendering of tool calls and their results
- Live reasoning block display (for extended thinking)

</integration>

---

## Benefits

<benefits>

1. **Rich UI Rendering**
   - Collapsible reasoning blocks
   - Expandable tool call cards with inputs/outputs
   - Inline file previews
   - Source citations with links

2. **Better Debugging**
   - Trace exact conversation flow
   - Inspect tool call parameters and results
   - See reasoning that led to decisions

3. **Conversation Replay**
   - Reconstruct past conversations exactly
   - Debug failed executions step-by-step
   - Create test cases from real executions

4. **Analytics & Insights**
   - Track tool usage patterns
   - Analyze reasoning quality
   - Measure conversation efficiency

5. **Standardization**
   - Aligns with industry-standard format
   - Enables interoperability with AI SDK ecosystem
   - Future-proofs for multi-provider support

</benefits>

---

## Implementation Phases

<phases>

### Phase 1: Investigation (This Issue)
- [ ] Analyze Claude Code log storage locations and formats
- [ ] Document log file structure
- [ ] Identify mapping between Claude logs and UIMessage format
- [ ] Create proof-of-concept parser

### Phase 2: Schema & Storage
- [ ] Choose schema approach (Option A, B, or C)
- [ ] Create migration scripts
- [ ] Implement message storage module
- [ ] Add backward compatibility for plain text

### Phase 3: Parser Implementation
- [ ] Build Claude Code log parser
- [ ] Handle edge cases and malformed logs
- [ ] Add streaming log support
- [ ] Write comprehensive tests

### Phase 4: UI Components
- [ ] Create MessagePart renderer components
- [ ] Build conversation view component
- [ ] Add collapsible/expandable sections
- [ ] Implement syntax highlighting for code

### Phase 5: Integration
- [ ] Hook into agent completion flow
- [ ] Add real-time streaming updates
- [ ] Create migration for existing agents
- [ ] Update API endpoints

</phases>

---

## Open Questions

<questions>

1. **Storage format**: Should parts be stored as JSON in SQLite or use a normalized schema?
2. **Backwards compatibility**: How to handle existing agents without structured messages?
3. **Log file retention**: Keep raw logs after parsing, or rely solely on structured data?
4. **Streaming granularity**: Parse messages in real-time or batch at completion?
5. **Provider abstraction**: Should this support non-Claude providers (OpenAI, etc.)?

</questions>

---

## References

- [Vercel AI SDK UIMessage Source](reference/vercel-ai-sdk/packages/ai/src/ui/ui-messages.ts)
- [AI SDK Documentation](https://ai-sdk.dev/docs)
- Current agents implementation: `src/db/agents.ts`
- Type definitions: `src/db/types.ts`

---

**Next Steps**: Begin Phase 1 investigation by exploring Claude Code's log storage structure and format.
