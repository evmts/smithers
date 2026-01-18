# Tool Standardization: Adopting AI SDK Tool Format

## Overview

This issue proposes standardizing Smithers' tool definitions on the Vercel AI SDK tool format while maintaining backward compatibility with existing MCP (Model Context Protocol) tools.

---

<context>

## Current State

### How Smithers Handles Tools Today

Smithers currently supports tools via MCP servers:

1. **MCP Tool Components** - Tools are defined as React children of `<Claude>`:
   ```tsx
   <Claude>
     <Sqlite path={dbPath}>
       Database schema instructions here
     </Sqlite>
     <Task>Do something with the database</Task>
   </Claude>
   ```

2. **Extraction Pipeline** - `extractMCPConfigs()` in `/Users/williamcory/smithers2/src/utils/mcp-config.ts` parses `<mcp-tool>` elements from serialized children

3. **MCP Server Config Generation** - `generateMCPServerConfig()` creates CLI-compatible configuration

4. **Claude CLI Integration** - Tools get passed via `--mcp-config` flag to Claude CLI

### Current Tool Type Definitions

From `/Users/williamcory/smithers2/src/tools/registry.ts`:
```typescript
export interface Tool {
  name: string
  description: string
  inputSchema: JSONSchema
  execute: (input: any, context: ToolContext) => Promise<any>
}

export interface MCPServer {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
}
```

### Existing Zod Usage

Smithers already uses Zod extensively:
- `ClaudeProps<TSchema extends z.ZodType>` accepts Zod schemas for structured output
- `/Users/williamcory/smithers2/src/utils/structured-output/zod-converter.ts` converts Zod to JSON Schema
- Schema validation and retry logic built into Claude execution

</context>

---

<ai-sdk-tool-format>

## AI SDK Tool Format Reference

From `/Users/williamcory/smithers2/reference/vercel-ai-sdk/packages/provider-utils/src/types/tool.ts`:

### Core Tool Definition
```typescript
import { tool } from 'ai'
import { z } from 'zod'

const weatherTool = tool({
  description: 'Get weather for a city',
  inputSchema: z.object({
    city: z.string().describe('The city name'),
    unit: z.enum(['celsius', 'fahrenheit']).optional()
  }),
  execute: async ({ city, unit }) => {
    const data = await fetchWeather(city)
    return { temperature: data.temp, unit: unit ?? 'celsius' }
  }
})
```

### Key Features

1. **Zod-First Parameters** - Uses `inputSchema` with Zod types directly
2. **Type-Safe Execute** - Input is inferred from schema
3. **Optional Output Schema** - `outputSchema` for typed results
4. **Execution Options** - Rich context via `ToolExecutionOptions`:
   ```typescript
   interface ToolExecutionOptions {
     toolCallId: string
     messages: ModelMessage[]
     abortSignal?: AbortSignal
     experimental_context?: unknown
   }
   ```
5. **Approval Flow** - `needsApproval` for human-in-the-loop
6. **Generator Support** - Execute can yield intermediate states:
   ```typescript
   async *execute({ city }) {
     yield { state: 'loading' }
     const data = await fetchWeather(city)
     yield { state: 'ready', ...data }
   }
   ```

### MCP Integration in AI SDK

The AI SDK's `@ai-sdk/mcp` package converts MCP tools to AI SDK tools:
- `createMCPClient()` connects to MCP servers
- `client.tools()` returns AI SDK-compatible tool objects
- Handles JSON Schema to Zod conversion automatically

</ai-sdk-tool-format>

---

<benefits>

## Benefits of Standardization

### 1. Ecosystem Compatibility
- Tools work with Vercel AI SDK's `generateText`, `streamText`
- Portable across different LLM providers
- Community tools become compatible

### 2. Better Type Safety
- Zod schemas provide compile-time type checking
- Execute function input is fully typed
- Output schema validates return values

### 3. Unified Mental Model
- One tool format for all agents
- Consistent API whether using MCP or custom tools
- Easier onboarding for developers familiar with AI SDK

### 4. Advanced Features
- Generator-based execution for streaming results
- Approval workflows for sensitive operations
- Abort signal support for cancellation

### 5. Simplified Testing
- Tools are pure functions with typed inputs
- Easy to mock and test in isolation
- No MCP server required for unit tests

</benefits>

---

<implementation>

## Implementation Plan

### Phase 1: Create `createSmithersTool()` Helper

Create a wrapper that extends AI SDK's `tool()` with Smithers-specific context:

```typescript
// /src/tools/createSmithersTool.ts
import { tool as aiSdkTool, type Tool } from 'ai'
import { z } from 'zod'

interface SmithersToolContext {
  db: SmithersDB
  agentId: string
  executionId: string
  log: (message: string) => void
}

interface SmithersToolOptions<TInput extends z.ZodType, TOutput> {
  name: string
  description: string
  inputSchema: TInput
  outputSchema?: z.ZodType<TOutput>
  execute: (
    input: z.infer<TInput>,
    context: SmithersToolContext & { abortSignal?: AbortSignal }
  ) => Promise<TOutput> | AsyncGenerator<TOutput>
  needsApproval?: boolean | ((input: z.infer<TInput>) => boolean)
}

export function createSmithersTool<TInput extends z.ZodType, TOutput>(
  options: SmithersToolOptions<TInput, TOutput>
): Tool<z.infer<TInput>, TOutput> {
  const { name, ...toolOptions } = options

  return aiSdkTool({
    description: options.description,
    inputSchema: options.inputSchema,
    outputSchema: options.outputSchema,
    needsApproval: options.needsApproval,
    execute: async (input, executionOptions) => {
      // Extract Smithers context from experimental_context
      const smithersContext = executionOptions.experimental_context as SmithersToolContext

      return options.execute(input, {
        ...smithersContext,
        abortSignal: executionOptions.abortSignal
      })
    }
  })
}
```

### Phase 2: Tool Registry Update

Update `/src/tools/registry.ts` to support both formats:

```typescript
import type { Tool as AISDKTool } from 'ai'

// New type alias for AI SDK tools
export type SmithersTool<TInput = any, TOutput = any> = AISDKTool<TInput, TOutput> & {
  name: string  // AI SDK tools don't have names, we add them
}

// Union type supporting both old and new formats
export type ToolSpec =
  | string                    // Built-in tool name
  | SmithersTool              // AI SDK format tool
  | MCPServer                 // MCP server config
  | LegacyTool               // Deprecated: old format

// Type guard for AI SDK tools
export function isSmithersTool(spec: ToolSpec): spec is SmithersTool {
  return typeof spec === 'object' && 'inputSchema' in spec && 'execute' in spec
}
```

### Phase 3: Conversion Layer for Claude CLI

Since Claude CLI uses MCP, we need to convert AI SDK tools to MCP-compatible format:

```typescript
// /src/tools/tool-to-mcp.ts
import { zodToJsonSchema } from '../utils/structured-output/zod-converter'
import type { SmithersTool } from './registry'

interface MCPToolDefinition {
  name: string
  description?: string
  inputSchema: {
    type: 'object'
    properties: Record<string, any>
    required?: string[]
  }
}

export function toolToMCPDefinition(name: string, tool: SmithersTool): MCPToolDefinition {
  // Convert Zod schema to JSON Schema
  const jsonSchema = zodToJsonSchema(tool.inputSchema)

  return {
    name,
    description: tool.description,
    inputSchema: {
      type: 'object',
      properties: jsonSchema.properties ?? {},
      required: jsonSchema.required
    }
  }
}

// Generate a custom MCP server that exposes Smithers tools
export function createSmithersToolServer(tools: Record<string, SmithersTool>): MCPServer {
  return {
    name: 'smithers-tools',
    command: 'bun',
    args: ['run', '/path/to/smithers-mcp-server.ts'],
    env: {
      SMITHERS_TOOLS: JSON.stringify(Object.keys(tools))
    }
  }
}
```

### Phase 4: Dual-Mode Support in Claude Component

Update `/src/components/Claude.tsx` to handle both tool types:

```typescript
// In Claude component
const { configs: mcpConfigs, cleanPrompt, toolInstructions } = extractMCPConfigs(childrenString)

// Also extract AI SDK tools from props
const aiSdkTools = props.tools?.filter(isSmithersTool) ?? []

// Convert AI SDK tools to MCP format for CLI
if (aiSdkTools.length > 0) {
  const smithersToolServer = createSmithersToolServer(
    Object.fromEntries(aiSdkTools.map(t => [t.name, t]))
  )
  mcpConfigs.push({
    type: 'custom',
    config: smithersToolServer,
    instructions: aiSdkTools.map(t => `${t.name}: ${t.description}`).join('\n')
  })
}
```

</implementation>

---

<migration-examples>

## Migration Examples

### Example 1: Simple Tool Migration

**Before (Custom Tool):**
```typescript
const reportTool: Tool = {
  name: 'report',
  description: 'Report progress to the orchestrator',
  inputSchema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Progress message' },
      severity: { type: 'string', enum: ['info', 'warning', 'error'] }
    },
    required: ['message']
  },
  execute: async (input, context) => {
    await context.db.vcs.addReport({
      type: 'progress',
      title: 'Agent Report',
      content: input.message,
      severity: input.severity ?? 'info'
    })
    return { success: true }
  }
}
```

**After (AI SDK Format):**
```typescript
import { z } from 'zod'
import { createSmithersTool } from '../tools/createSmithersTool'

const reportTool = createSmithersTool({
  name: 'report',
  description: 'Report progress to the orchestrator',
  inputSchema: z.object({
    message: z.string().describe('Progress message'),
    severity: z.enum(['info', 'warning', 'error']).optional()
  }),
  outputSchema: z.object({
    success: z.boolean()
  }),
  execute: async ({ message, severity }, { db }) => {
    await db.vcs.addReport({
      type: 'progress',
      title: 'Agent Report',
      content: message,
      severity: severity ?? 'info'
    })
    return { success: true }
  }
})
```

### Example 2: MCP Component to Dual Support

**Current MCP Component:**
```tsx
<Claude>
  <Sqlite path="./data.db">
    Users table has id, name, email columns
  </Sqlite>
  Query all users
</Claude>
```

**With AI SDK Tool Alternative:**
```tsx
// Can still use MCP components
<Claude>
  <Sqlite path="./data.db" />
  Query all users
</Claude>

// OR use AI SDK tool directly
const sqliteTool = createSmithersTool({
  name: 'sqlite_query',
  description: 'Execute SQL query on database',
  inputSchema: z.object({
    query: z.string().describe('SQL query to execute')
  }),
  execute: async ({ query }, { db }) => {
    // Use Bun's SQLite
    const sqlite = new Database('./data.db')
    return sqlite.query(query).all()
  }
})

<Claude tools={[sqliteTool]}>
  Query all users
</Claude>
```

### Example 3: Tool with Streaming Results

```typescript
const longRunningTool = createSmithersTool({
  name: 'analyze',
  description: 'Perform long-running analysis',
  inputSchema: z.object({
    data: z.array(z.string())
  }),
  async *execute({ data }, { log }) {
    yield { state: 'starting', progress: 0 }

    for (let i = 0; i < data.length; i++) {
      await processItem(data[i])
      log(`Processed ${i + 1}/${data.length}`)
      yield { state: 'processing', progress: (i + 1) / data.length }
    }

    yield { state: 'complete', progress: 1, results: [] }
  }
})
```

</migration-examples>

---

<type-definitions>

## Required Type Definitions

```typescript
// /src/tools/types.ts

import { z } from 'zod'
import { Tool as AISDKTool, ToolExecutionOptions } from 'ai'
import type { SmithersDB } from '../db'

/**
 * Smithers-specific execution context passed to tools
 */
export interface SmithersToolContext {
  /** Smithers database instance */
  db: SmithersDB
  /** Current agent ID */
  agentId: string
  /** Current execution ID */
  executionId: string
  /** Current working directory */
  cwd: string
  /** Environment variables */
  env: Record<string, string>
  /** Log function for progress messages */
  log: (message: string) => void
}

/**
 * Combined execution options for Smithers tools
 */
export interface SmithersToolExecutionOptions extends ToolExecutionOptions {
  smithers: SmithersToolContext
}

/**
 * A Smithers tool built on AI SDK format with name
 */
export interface SmithersTool<
  TInput extends z.ZodType = z.ZodType,
  TOutput = unknown
> extends AISDKTool<z.infer<TInput>, TOutput> {
  /** Tool name (required for Smithers registry) */
  name: string
}

/**
 * Options for creating a Smithers tool
 */
export interface CreateSmithersToolOptions<
  TInput extends z.ZodType,
  TOutput
> {
  name: string
  description: string
  inputSchema: TInput
  outputSchema?: z.ZodType<TOutput>
  execute: (
    input: z.infer<TInput>,
    context: SmithersToolContext & { abortSignal?: AbortSignal }
  ) => Promise<TOutput> | AsyncIterable<TOutput>
  needsApproval?: boolean | ((input: z.infer<TInput>) => boolean | Promise<boolean>)
}

/**
 * MCP server definition (unchanged from current)
 */
export interface MCPServer {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
}

/**
 * Union of all tool specification types
 */
export type ToolSpec =
  | string          // Built-in tool name (e.g., 'Read', 'Write', 'Bash')
  | SmithersTool    // AI SDK format tool
  | MCPServer       // MCP server configuration
```

</type-definitions>

---

<testing-strategy>

## Testing Strategy

### Unit Tests for Tool Conversion

```typescript
// /src/tools/createSmithersTool.test.ts
import { describe, test, expect } from 'bun:test'
import { z } from 'zod'
import { createSmithersTool } from './createSmithersTool'
import { toolToMCPDefinition } from './tool-to-mcp'

describe('createSmithersTool', () => {
  test('creates valid AI SDK tool', () => {
    const tool = createSmithersTool({
      name: 'test',
      description: 'Test tool',
      inputSchema: z.object({ value: z.string() }),
      execute: async ({ value }) => ({ result: value })
    })

    expect(tool.description).toBe('Test tool')
    expect(tool.inputSchema).toBeDefined()
  })

  test('converts to MCP definition', () => {
    const tool = createSmithersTool({
      name: 'test',
      description: 'Test tool',
      inputSchema: z.object({
        name: z.string(),
        count: z.number().optional()
      }),
      execute: async () => ({})
    })

    const mcpDef = toolToMCPDefinition('test', tool)

    expect(mcpDef.name).toBe('test')
    expect(mcpDef.inputSchema.properties.name).toEqual({ type: 'string' })
    expect(mcpDef.inputSchema.required).toContain('name')
  })
})
```

### Integration Tests

```typescript
// Test that both MCP and AI SDK tools work in Claude component
describe('Claude with mixed tools', () => {
  test('accepts MCP components and AI SDK tools', async () => {
    const customTool = createSmithersTool({
      name: 'greet',
      description: 'Greet someone',
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }) => `Hello, ${name}!`
    })

    const tree = (
      <Smithers>
        <Claude tools={[customTool]}>
          <Sqlite path="./test.db" />
          Greet the user named "Alice"
        </Claude>
      </Smithers>
    )

    // Verify both tool types are extracted
    const rendered = await render(tree)
    expect(rendered.mcpConfigs).toHaveLength(2)
  })
})
```

</testing-strategy>

---

<rollout-plan>

## Rollout Plan

### Phase 1: Foundation (Week 1)
- [ ] Implement `createSmithersTool()` helper
- [ ] Add type definitions
- [ ] Write unit tests
- [ ] Update documentation

### Phase 2: Conversion Layer (Week 2)
- [ ] Implement `toolToMCPDefinition()`
- [ ] Create Smithers MCP tool server
- [ ] Test with Claude CLI

### Phase 3: Integration (Week 3)
- [ ] Update Claude component for dual support
- [ ] Migrate `ReportTool` as proof of concept
- [ ] Integration testing

### Phase 4: Migration (Week 4+)
- [ ] Deprecate old `Tool` interface
- [ ] Migrate remaining custom tools
- [ ] Update examples and documentation
- [ ] Announce breaking change for next major version

</rollout-plan>

---

<open-questions>

## Open Questions

1. **Tool Naming**: AI SDK tools don't have built-in names. Should we require names via wrapper or use a registry pattern?

2. **Context Passing**: Using `experimental_context` is marked experimental in AI SDK. Should we vendor our own tool function?

3. **MCP Bridge Performance**: Running a separate MCP server for AI SDK tools adds overhead. Worth it for type safety?

4. **Generator Execution**: Claude CLI doesn't support streaming tool results. Should we buffer or drop intermediate yields?

5. **Approval UI**: Where should approval prompts appear in Smithers' CLI/TUI interface?

</open-questions>

---

## Related Files

- `/Users/williamcory/smithers2/src/components/Claude.tsx` - Main Claude component
- `/Users/williamcory/smithers2/src/utils/mcp-config.ts` - MCP configuration utilities
- `/Users/williamcory/smithers2/src/tools/registry.ts` - Current tool registry
- `/Users/williamcory/smithers2/src/components/agents/types/tools.ts` - Current tool types
- `/Users/williamcory/smithers2/src/utils/structured-output/zod-converter.ts` - Zod to JSON Schema
- `/Users/williamcory/smithers2/reference/vercel-ai-sdk/packages/provider-utils/src/types/tool.ts` - AI SDK tool definition
- `/Users/williamcory/smithers2/reference/vercel-ai-sdk/packages/mcp/src/tool/mcp-client.ts` - AI SDK MCP integration
