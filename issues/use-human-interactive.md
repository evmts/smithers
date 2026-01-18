# useHumanInteractive Hook: Interactive Claude Sessions for Human Input

<metadata>
  <priority>medium</priority>
  <category>feature</category>
  <estimated-effort>3-4 days</estimated-effort>
  <status>design-complete</status>
  <dependencies>
    - src/hooks/useHuman.ts
    - src/db/human.ts
    - src/db/tasks.ts
    - src/components/agents/claude-cli/executor.ts
    - src/components/SmithersProvider.tsx
  </dependencies>
  <design-review-date>2026-01-18</design-review-date>
  <p0-issues-resolved>10/10</p0-issues-resolved>
</metadata>

---

## Executive Summary

Add a `useHumanInteractive` hook that requests an interactive Claude Code session where a human can collaborate with Claude to answer a question or resolve an issue. Unlike `useHuman` which presents simple prompts/options, this hook enables rich, multi-turn conversations with full Claude Code capabilities (file editing, tool use, etc.). The hook follows a `useMutation`-like API pattern—callers explicitly trigger the request and decide whether to await the result, giving full control over execution flow.

---

<section name="problem-statement">

## Problem Statement

### Current State

The existing `useHuman` hook supports simple human interactions:

```tsx
const { ask } = useHuman()

// Simple confirmation
const approved = await ask<boolean>('Deploy to production?', {
  options: ['Yes', 'No']
})

// Selection from options
const choice = await ask<string>('Which environment?', {
  options: ['staging', 'production', 'development']
})
```

### Limitations

Some situations require more than a simple prompt/response:

1. **Complex decisions requiring exploration** - The human needs to investigate code, run commands, or test scenarios before deciding
2. **Clarification through dialogue** - The question requires back-and-forth to fully understand
3. **Collaborative problem-solving** - Human and Claude need to work together to resolve an issue
4. **Expert consultation** - Domain expert needs to investigate with AI assistance before providing guidance

**Example scenarios:**

```tsx
// Current: Limited to simple prompts
const approved = await ask('Should we proceed with this refactoring?')
// Human can only say yes/no, can't explore the actual changes

// Desired: Human can interactively explore with Claude
const decision = await mutate(
  'Review the proposed refactoring and decide if we should proceed',
  { context: { files: changedFiles, diffs: proposedDiffs } }
)
// Human can ask Claude questions, view files, run tests, then decide
```

</section>

---

<section name="proposed-solution">

## Proposed Solution: `useHumanInteractive` Hook

### Hook API

The hook follows a `useMutation`-like pattern, giving callers full control over when to trigger requests and how to handle their async nature. It does **not** automatically pause or block execution—the caller decides whether to `await` the result.

```tsx
interface UseHumanInteractiveResult<T = InteractiveSessionResult> {
  /**
   * Trigger without returning a promise (fire-and-forget).
   * Use `data` and `status` to reactively track the result.
   */
  request: (prompt: string, options?: AskInteractiveOptions) => void

  /**
   * Trigger an interactive Claude session request.
   * Returns a promise that resolves when the session completes.
   * Callers decide whether to await (blocking that code path) or not.
   */
  requestAsync: (prompt: string, options?: AskInteractiveOptions) => Promise<T>

  /**
   * Current mutation status
   */
  status: 'idle' | 'pending' | 'success' | 'error'

  /**
   * The resolved data (when status === 'success')
   */
  data: T | null

  /**
   * Error if the session failed (when status === 'error')
   */
  error: Error | null

  /**
   * The current session ID (if any)
   */
  sessionId: string | null

  /**
   * Cancel the pending session (if any)
   */
  cancel: () => void

  /**
   * Reset the hook state back to idle
   */
  reset: () => void
}

interface AskInteractiveOptions {
  /**
   * System prompt to guide Claude in the interactive session.
   * Provides context about what the human is trying to decide/resolve.
   */
  systemPrompt?: string

  /**
   * Context data to include in the session.
   * Will be formatted and included in Claude's context.
   */
  context?: Record<string, unknown>

  /**
   * Model to use for the interactive session.
   * @default 'sonnet'
   */
  model?: 'opus' | 'sonnet' | 'haiku'

  /**
   * Working directory for the session.
   * @default process.cwd()
   */
  cwd?: string

  /**
   * MCP config file path for additional tools.
   */
  mcpConfig?: string

  /**
   * Maximum session duration in milliseconds.
   * Session will timeout if exceeded.
   */
  timeout?: number

  /**
   * Expected outcome type for structured responses.
   * Claude will be instructed to end with a structured response.
   */
  outcomeSchema?: {
    type: 'approval' | 'selection' | 'freeform' | 'structured'
    options?: string[]
    /** JSON Schema for structured responses (must be serializable) */
    jsonSchema?: Record<string, unknown>
  }

  /**
   * Zod schema for client-side validation (not stored in DB).
   * Used to validate the response after session completes.
   */
  zodSchema?: z.ZodType

  /**
   * Capture full session transcript.
   * @default false (opt-in for privacy and storage)
   */
  captureTranscript?: boolean

  /**
   * Keep orchestration alive until session completes.
   * Creates a task to prevent run from finishing prematurely.
   * @default true
   */
  blockOrchestration?: boolean
}

interface InteractiveSessionResult {
  /**
   * How the session ended (lifecycle status)
   */
  outcome: 'completed' | 'cancelled' | 'timeout' | 'failed'

  /**
   * The final response/decision from the session
   */
  response: unknown

  /**
   * Session transcript (if captured)
   */
  transcript?: string

  /**
   * Duration of the session in milliseconds
   */
  duration: number

  /**
   * Error message if failed
   */
  error?: string
}
```

### Usage Examples

**Basic usage (awaited):**

```tsx
const { requestAsync } = useHumanInteractive()

async function reviewChanges() {
  // Awaiting blocks THIS code path until session completes
  // Other parts of your orchestration continue running
  const result = await requestAsync(
    'Please review the proposed database schema changes and approve or reject them.'
  )

  if (result.outcome === 'completed' && result.response === 'approved') {
    // Proceed with migration
  }
}
```

**Reactive pattern (non-blocking):**

```tsx
const { request, status, data } = useHumanInteractive()

// Fire off the request without blocking
useMount(() => {
  request('Review the deployment plan')
})

// React to status changes
if (status === 'pending') {
  return <Text>Waiting for human review...</Text>
}

if (status === 'success' && data?.outcome === 'completed' && data?.response === 'approved') {
  return <DeploymentExecutor />
}
```

**With context and structured outcome:**

```tsx
const { requestAsync } = useHumanInteractive<{ approved: boolean; notes: string }>()

const DecisionSchema = z.object({
  approved: z.boolean(),
  notes: z.string(),
})

const result = await requestAsync(
  'Review the security audit findings and provide approval decision.',
  {
    context: {
      findings: auditFindings,
      severity: 'high',
      affectedFiles: fileList,
    },
    systemPrompt: `You are helping a security engineer review audit findings.
      Help them understand each finding and its implications.
      When they're ready to decide, capture their approval and any notes.`,
    outcomeSchema: {
      type: 'structured',
      jsonSchema: {
        type: 'object',
        properties: {
          approved: { type: 'boolean' },
          notes: { type: 'string' },
        },
        required: ['approved', 'notes'],
      },
    },
    zodSchema: DecisionSchema, // Client-side validation
    captureTranscript: true, // Opt-in to capture full conversation
  }
)

// Validate with Zod on the client side
if (result.outcome === 'completed') {
  const decision = DecisionSchema.parse(result.response)
  // TypeScript knows decision is { approved: boolean; notes: string }
}
```

**Expert consultation:**

```tsx
const { requestAsync, cancel } = useHumanInteractive()

// Escalate to human expert when AI is uncertain
const diagnosisPromise = requestAsync(
  'The automated analysis found an unusual pattern. Please investigate.',
  {
    context: {
      pattern: detectedPattern,
      possibleCauses: aiSuggestions,
      logs: relevantLogs,
    },
    systemPrompt: `You are assisting a senior engineer in diagnosing an issue.
      Present the findings and help them investigate by running commands,
      reading logs, and exploring the codebase as needed.`,
    model: 'opus', // Use most capable model for complex investigation
    timeout: 30 * 60 * 1000, // 30 minute max
    captureTranscript: true, // Capture for audit trail
  }
)

// Can cancel if conditions change
if (automatedFixSucceeded) {
  cancel()
}

const diagnosis = await diagnosisPromise
```

</section>

---

<section name="database-schema">

## Database Schema

### New Interaction Type

Extend the `human_interactions` table to support interactive sessions:

```sql
-- Existing table, new type values
-- type: 'confirmation' | 'select' | 'input' | 'interactive_session'

-- New columns for interactive sessions (nullable for backward compat)
ALTER TABLE human_interactions ADD COLUMN session_config TEXT;  -- JSON config
ALTER TABLE human_interactions ADD COLUMN session_transcript TEXT;  -- Captured transcript
ALTER TABLE human_interactions ADD COLUMN session_duration INTEGER;  -- Duration in ms
ALTER TABLE human_interactions ADD COLUMN error TEXT;  -- Error message if failed
```

### Status Semantics

**CRITICAL CHANGE:** The `status` field now represents **lifecycle status**, not decision:

- `pending`: Session not yet completed
- `completed`: Session finished successfully (regardless of approval/rejection)
- `cancelled`: User or system cancelled the session
- `timeout`: Session exceeded timeout
- `failed`: Session encountered an error

**For approval/rejection decisions:** These are stored in the `response` field, NOT in `status`.

This change ensures:
- Query correctness (dashboards can count completed sessions accurately)
- Backward compatibility (existing confirmation flows still use approved/rejected)
- Clear separation of concerns (lifecycle vs business logic)

### Type Definitions

```typescript
/** Raw database row (strings for JSON columns) */
interface HumanInteractionRow {
  id: string
  execution_id: string
  type: 'confirmation' | 'select' | 'input' | 'interactive_session'
  prompt: string
  options: string | null  // JSON string
  status: 'pending' | 'approved' | 'rejected' | 'timeout' | 'cancelled' | 'completed' | 'failed'
  response: string | null  // JSON string
  created_at: string
  resolved_at: string | null
  session_config: string | null  // JSON string
  session_transcript: string | null
  session_duration: number | null
  error: string | null
}

/** Parsed application type */
interface HumanInteraction {
  id: string
  execution_id: string
  type: 'confirmation' | 'select' | 'input' | 'interactive_session'
  prompt: string
  options: string[] | null
  status: 'pending' | 'approved' | 'rejected' | 'timeout' | 'cancelled' | 'completed' | 'failed'
  response: any | null
  created_at: string
  resolved_at: string | null
  // New fields for interactive sessions
  session_config?: InteractiveSessionConfig | null
  session_transcript?: string | null
  session_duration?: number | null
  error?: string | null
}

interface InteractiveSessionConfig {
  systemPrompt?: string
  context?: Record<string, unknown>
  model?: string
  cwd?: string
  mcpConfig?: string
  timeout?: number
  outcomeSchema?: {
    type: 'approval' | 'selection' | 'freeform' | 'structured'
    options?: string[]
    jsonSchema?: Record<string, unknown>
  }
  captureTranscript?: boolean
  blockOrchestration?: boolean
}

/** Parse DB row to application type */
function parseHumanInteraction(row: HumanInteractionRow): HumanInteraction {
  return {
    ...row,
    options: row.options ? JSON.parse(row.options) : null,
    response: row.response ? JSON.parse(row.response) : null,
    session_config: row.session_config ? JSON.parse(row.session_config) : null,
  }
}
```

</section>

---

<section name="implementation-design">

## Implementation Design

### Hook Implementation

```tsx
// src/hooks/useHumanInteractive.ts

import { useState, useCallback, useRef, useEffect } from 'react'
import { useSmithers } from '../components/SmithersProvider.js'
import type { HumanInteractionRow, HumanInteraction } from '../db/human.js'
import { parseHumanInteraction } from '../db/human.js'
import { useQueryOne } from '../reactive-sqlite/index.js'

export function useHumanInteractive<T = InteractiveSessionResult>(): UseHumanInteractiveResult<T> {
  const { db } = useSmithers()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const resolveRef = useRef<((value: T) => void) | null>(null)
  const rejectRef = useRef<((error: Error) => void) | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Reactive subscription to the current session (raw DB row)
  const { data: rawSession } = useQueryOne<HumanInteractionRow>(
    db.db,
    sessionId
      ? `SELECT * FROM human_interactions WHERE id = ?`
      : `SELECT 1 WHERE 0`,
    sessionId ? [sessionId] : []
  )

  // Parse the raw DB row
  const session = rawSession ? parseHumanInteraction(rawSession) : null

  // Resolve/reject when session completes
  useEffect(() => {
    if (!session || !mountedRef.current) return
    if (session.status === 'pending' || status !== 'pending') return

    const result = {
      outcome: session.status === 'completed' ? 'completed'
             : session.status === 'cancelled' ? 'cancelled'
             : session.status === 'timeout' ? 'timeout'
             : session.status === 'failed' ? 'failed'
             : 'completed', // fallback for legacy statuses
      response: session.response,
      transcript: session.session_transcript ?? undefined,
      duration: session.session_duration ?? 0,
      error: session.error ?? undefined,
    } as T

    // Complete the task if one was created
    if (taskId) {
      db.tasks.complete(taskId)
      setTaskId(null)
    }

    if (session.status === 'failed') {
      setError(new Error(session.error ?? 'Session failed'))
      setStatus('error')
      if (rejectRef.current) {
        rejectRef.current(new Error(session.error ?? 'Session failed'))
      }
    } else {
      setData(result)
      setStatus('success')
      if (resolveRef.current) {
        resolveRef.current(result)
      }
    }

    resolveRef.current = null
    rejectRef.current = null
  }, [session, status, taskId, db])

  const createSession = useCallback((
    prompt: string,
    options?: AskInteractiveOptions
  ): string => {
    // Enforce single session constraint
    if (status === 'pending') {
      throw new Error('Cannot create a new interactive session while one is already pending')
    }

    const config: InteractiveSessionConfig = {
      systemPrompt: options?.systemPrompt,
      context: options?.context,
      model: options?.model,
      cwd: options?.cwd,
      mcpConfig: options?.mcpConfig,
      timeout: options?.timeout,
      outcomeSchema: options?.outcomeSchema,
      captureTranscript: options?.captureTranscript,
      blockOrchestration: options?.blockOrchestration ?? true,
    }

    const id = db.human.requestInteractive(prompt, config)

    // Create a task to keep orchestration alive if requested
    if (config.blockOrchestration) {
      const tid = db.tasks.start('human_interactive', `Interactive session: ${prompt.slice(0, 50)}...`)
      setTaskId(tid)
    }

    return id
  }, [db, status])

  // Fire-and-forget version - use status/data reactively
  const request = useCallback((
    prompt: string,
    options?: AskInteractiveOptions
  ): void => {
    setStatus('pending')
    setData(null)
    setError(null)

    const id = createSession(prompt, options)
    setSessionId(id)
  }, [createSession])

  // Returns a promise - caller decides whether to await
  const requestAsync = useCallback((
    prompt: string,
    options?: AskInteractiveOptions
  ): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      resolveRef.current = resolve
      rejectRef.current = reject
      setStatus('pending')
      setData(null)
      setError(null)

      const id = createSession(prompt, options)
      setSessionId(id)
    })
  }, [createSession])

  const cancel = useCallback(() => {
    if (sessionId && status === 'pending') {
      db.human.cancelInteractive(sessionId)
      if (taskId) {
        db.tasks.complete(taskId)
        setTaskId(null)
      }
    }
  }, [sessionId, status, taskId, db])

  const reset = useCallback(() => {
    if (taskId) {
      db.tasks.complete(taskId)
    }
    setSessionId(null)
    setStatus('idle')
    setData(null)
    setError(null)
    setTaskId(null)
    resolveRef.current = null
    rejectRef.current = null
  }, [taskId, db])

  return {
    request,
    requestAsync,
    status,
    data,
    error,
    sessionId,
    cancel,
    reset,
  }
}
```

### Human Module Extension

```typescript
// src/db/human.ts - extend HumanModule

export interface HumanModule {
  // ... existing methods ...

  /**
   * Request an interactive Claude session
   */
  requestInteractive: (prompt: string, config: InteractiveSessionConfig) => string

  /**
   * Complete an interactive session with lifecycle status
   */
  completeInteractive: (
    id: string,
    outcome: 'completed' | 'cancelled' | 'timeout' | 'failed',
    response: unknown,
    options?: {
      transcript?: string
      duration?: number
      error?: string
    }
  ) => void

  /**
   * Cancel a pending interactive session
   */
  cancelInteractive: (id: string) => void

  /**
   * List pending interactions with optional execution scope
   * @param executionId - Optional execution ID. If not provided, uses current execution.
   *                      Pass '*' to list across all executions.
   */
  listPending: (executionId?: string) => HumanInteraction[]
}

// Implementation
requestInteractive: (prompt: string, config: InteractiveSessionConfig): string => {
  const executionId = getCurrentExecutionId()
  if (!executionId) throw new Error('No active execution')

  const id = uuid()
  rdb.run(
    `INSERT INTO human_interactions
     (id, execution_id, type, prompt, status, session_config, created_at)
     VALUES (?, ?, 'interactive_session', ?, 'pending', ?, ?)`,
    [id, executionId, prompt, JSON.stringify(config), now()]
  )
  return id
}

completeInteractive: (
  id: string,
  outcome: 'completed' | 'cancelled' | 'timeout' | 'failed',
  response: unknown,
  options?: {
    transcript?: string
    duration?: number
    error?: string
  }
) => {
  // Status is now the lifecycle status, not the decision
  rdb.run(
    `UPDATE human_interactions
     SET status = ?, response = ?, session_transcript = ?,
         session_duration = ?, error = ?, resolved_at = ?
     WHERE id = ?`,
    [
      outcome,
      JSON.stringify(response),
      options?.transcript ?? null,
      options?.duration ?? null,
      options?.error ?? null,
      now(),
      id
    ]
  )
}

cancelInteractive: (id: string) => {
  rdb.run(
    `UPDATE human_interactions
     SET status = 'cancelled', resolved_at = ?
     WHERE id = ? AND status = 'pending'`,
    [now(), id]
  )
}

// Updated listPending to support explicit execution scope
listPending: (executionId?: string): HumanInteraction[] => {
  let query = `SELECT * FROM human_interactions WHERE status = 'pending'`
  const params: string[] = []

  if (executionId === '*') {
    // List across all executions
  } else if (executionId) {
    // Specific execution
    query += ` AND execution_id = ?`
    params.push(executionId)
  } else {
    // Current execution (default behavior)
    const currentExecId = getCurrentExecutionId()
    if (!currentExecId) return []
    query += ` AND execution_id = ?`
    params.push(currentExecId)
  }

  const rows = rdb.all(query, params) as HumanInteractionRow[]
  return rows.map(parseHumanInteraction)
}
```

</section>

---

<section name="harness-integration">

## External Harness Integration

Like `useHuman`, this hook is **harness-agnostic**. It creates a database record representing the request; how that request is fulfilled is entirely up to the harness. The hook doesn't know or care whether the harness launches Claude Code CLI, opens a web UI, sends a Slack notification, or something else entirely.

The harness is responsible for:

1. **Detecting interactive session requests** - Poll `db.human.listPending()` for `type: 'interactive_session'`
2. **Fulfilling the request** - However it chooses (Claude CLI, custom UI, etc.)
3. **Providing context** - Inject the session config (system prompt, context) as appropriate
4. **Completing the interaction** - Call `db.human.completeInteractive()` when done

### Harness Pseudocode

```typescript
// Example harness implementation

async function handleInteractiveSession(request: HumanInteraction) {
  const config = request.session_config as InteractiveSessionConfig

  // Build initial prompt with context
  const initialPrompt = buildInteractivePrompt(request.prompt, config)

  // Launch interactive Claude session
  const session = await launchClaudeInteractive({
    prompt: initialPrompt,
    systemPrompt: config.systemPrompt,
    model: config.model ?? 'sonnet',
    cwd: config.cwd ?? process.cwd(),
    mcpConfig: config.mcpConfig,
  })

  // Wait for session to complete (user exits or timeout)
  const startTime = Date.now()
  const result = await session.waitForCompletion({
    timeout: config.timeout,
    captureTranscript: config.captureTranscript ?? false,
  })

  // Extract structured response if schema provided
  const response = config.outcomeSchema
    ? extractStructuredResponse(result, config.outcomeSchema)
    : result.lastResponse

  // Complete the interaction
  db.human.completeInteractive(
    request.id,
    result.exitReason, // 'completed' | 'cancelled' | 'timeout' | 'failed'
    response,
    {
      transcript: config.captureTranscript ? result.transcript : undefined,
      duration: Date.now() - startTime,
      error: result.error,
    }
  )
}

function buildInteractivePrompt(
  prompt: string,
  config: InteractiveSessionConfig
): string {
  let fullPrompt = prompt

  if (config.context) {
    fullPrompt += '\n\n## Context\n'
    fullPrompt += '```json\n'
    fullPrompt += JSON.stringify(config.context, null, 2)
    fullPrompt += '\n```'
  }

  if (config.outcomeSchema?.type === 'approval') {
    fullPrompt += '\n\nWhen ready to conclude, please state your decision: APPROVED or REJECTED'
  }

  return fullPrompt
}
```

### Launching Interactive Claude

Unlike the current `--print` mode execution, interactive sessions launch Claude Code in its normal interactive mode:

```typescript
async function launchClaudeInteractive(options: {
  prompt: string
  systemPrompt?: string
  model?: string
  cwd?: string
  mcpConfig?: string
}): Promise<InteractiveSession> {
  const args: string[] = []

  // NO --print flag (interactive mode)

  if (options.model) {
    args.push('--model', options.model)
  }

  if (options.systemPrompt) {
    args.push('--system-prompt', options.systemPrompt)
  }

  if (options.mcpConfig) {
    args.push('--mcp-config', options.mcpConfig)
  }

  // Initial prompt
  args.push(options.prompt)

  // Spawn interactive process
  const proc = spawn('claude', args, {
    cwd: options.cwd,
    stdio: ['inherit', 'inherit', 'inherit'], // Full terminal access
  })

  return new InteractiveSession(proc)
}
```

</section>

---

<section name="outcome-extraction">

## Outcome Extraction

### Approval Outcomes

For simple approval workflows, the harness looks for explicit approval/rejection:

```typescript
function extractApprovalOutcome(transcript: string): 'approved' | 'rejected' | null {
  const lastMessages = getLastNMessages(transcript, 3)

  // Look for explicit approval patterns
  const approvalPatterns = [
    /\bAPPROVED\b/i,
    /\bI approve\b/i,
    /\bproceeding\b/i,
    /\byes,?\s*(let'?s?\s*)?proceed/i,
  ]

  const rejectionPatterns = [
    /\bREJECTED\b/i,
    /\bI reject\b/i,
    /\bdo not proceed\b/i,
    /\bno,?\s*(do not|don'?t)\s*proceed/i,
  ]

  for (const msg of lastMessages) {
    for (const pattern of approvalPatterns) {
      if (pattern.test(msg)) return 'approved'
    }
    for (const pattern of rejectionPatterns) {
      if (pattern.test(msg)) return 'rejected'
    }
  }

  return null
}
```

### Structured Outcomes

For structured responses, Claude is instructed to output a specific format:

```typescript
// System prompt addition for structured outcomes
const structuredPromptSuffix = `

When you have gathered all necessary information and the human is ready to conclude:
1. Summarize the decision/findings
2. Output the final response in this exact JSON format:
\`\`\`json
{"decision": <structured_response_here>}
\`\`\`
`

function extractStructuredResponse(
  transcript: string,
  schema: z.ZodType
): unknown {
  // Find the last JSON block in transcript
  const jsonMatch = transcript.match(/```json\s*\n({[\s\S]*?})\n```/g)
  if (!jsonMatch) return null

  const lastJson = jsonMatch[jsonMatch.length - 1]
  const content = lastJson.replace(/```json\s*\n/, '').replace(/\n```$/, '')

  try {
    const parsed = JSON.parse(content)
    return schema.parse(parsed.decision ?? parsed)
  } catch {
    return null
  }
}
```

</section>

---

<section name="plan-output">

## Plan Output

Interactive sessions appear in plan output:

```xml
<human-interaction type="interactive_session" status="pending">
  <prompt>Review the proposed database schema changes and approve or reject them.</prompt>
  <config>
    <model>sonnet</model>
    <timeout>1800000</timeout>
    <outcome-type>approval</outcome-type>
  </config>
  <message>Waiting for interactive session to complete...</message>
</human-interaction>
```

When resolved:

```xml
<human-interaction type="interactive_session" status="completed">
  <prompt>Review the proposed database schema changes and approve or reject them.</prompt>
  <outcome>approved</outcome>
  <duration>342000</duration>
  <response>{"approved": true, "notes": "Schema looks good after reviewing indexes"}</response>
</human-interaction>
```

</section>

---

<section name="implementation-plan">

## Implementation Plan

### Phase 1: Database Schema (0.5 day)

1. Add migration for new columns in `human_interactions` table
2. Update `HumanInteraction` type with new fields
3. Test: Schema migration works on existing databases

### Phase 2: Human Module Extension (0.5 day)

1. Add `requestInteractive()` method to `HumanModule`
2. Add `completeInteractive()` method to `HumanModule`
3. Update `listPending()` to include session type filter option
4. Test: Interactive sessions created/completed correctly

### Phase 3: Hook Implementation (1 day)

1. Create `src/hooks/useHumanInteractive.ts`
2. Implement reactive subscription to session state
3. Implement promise resolution on session completion
4. Export from `src/hooks/index.ts`
5. Test: Hook correctly awaits and resolves interactive sessions

### Phase 4: Documentation (0.5 day)

1. Add API documentation for `useHumanInteractive`
2. Add usage examples
3. Document harness integration requirements

### Phase 5: Example Harness (0.5 day)

1. Create example harness implementation showing how to:
   - Detect interactive session requests
   - Launch Claude interactive mode
   - Capture and resolve outcomes

</section>

---

<section name="comparison-with-useHuman">

## Comparison: useHuman vs useHumanInteractive

| Aspect | `useHuman` | `useHumanInteractive` |
|--------|-----------|----------------------|
| **API pattern** | `useMutation`-like | `useMutation`-like |
| **Interaction type** | Simple prompt/response | Multi-turn conversation |
| **Human capability** | Select from options, confirm, input text | Rich session (files, tools, commands) |
| **Duration** | Seconds | Minutes to hours |
| **Context** | Prompt string only | Rich context object + system prompt |
| **Outcome** | Direct response | Structured or extracted from conversation |
| **Harness dependency** | Harness-agnostic | Harness-agnostic |
| **Use case** | Approvals, selections, simple inputs | Complex decisions, investigation, consultation |

Both hooks follow the same pattern: create a DB record, let the harness fulfill it, resolve when complete. Neither hook automatically pauses or blocks execution—the caller decides whether to `await` the result.

### When to Use Each

**Use `useHuman` when:**
- Simple yes/no decision
- Selection from predefined options
- Quick text input needed
- No AI assistance required for the decision

**Use `useHumanInteractive` when:**
- Human needs to investigate before deciding
- Complex context requires exploration
- AI assistance helps the human understand the situation
- Decision requires running commands/viewing files
- Multi-turn dialogue needed for clarification

</section>

---

<section name="design-review-changes">

## Design Review Changes (P0 Issues Resolved)

This section documents critical design changes made to address P0 issues identified in the design review.

### 1. Serializable Schema Configuration ✅

**Problem:** `z.ZodType` instances cannot be JSON stringified and stored in the database, breaking harness-agnostic promise.

**Solution:**
- `outcomeSchema.jsonSchema` now accepts `Record<string, unknown>` (JSON Schema format)
- Separate `zodSchema` option for client-side validation after session completes
- Harness receives JSON Schema (serializable) in DB; hook validates with Zod afterward

### 2. Status Semantics (Lifecycle vs Decision) ✅

**Problem:** Using `status = 'approved'` to mean "completed" conflates lifecycle with business logic, breaking queries and dashboards.

**Solution:**
- `status` now represents **lifecycle only**: `pending | completed | cancelled | timeout | failed`
- Approval/rejection decisions stored in `response` field, not `status`
- Backward compatible with existing confirmation flows (still use `approved/rejected`)
- Clear separation: lifecycle (status) vs decision (response)

### 3. Proper DB Row Types and Parsing ✅

**Problem:** `useQueryOne` returns raw DB rows with JSON strings, but hook assumed parsed objects.

**Solution:**
- Added `HumanInteractionRow` type matching actual table columns
- Added `parseHumanInteraction(row)` mapper function
- Hook now queries `HumanInteractionRow` and parses before use
- Consistent with existing module patterns (`mapAgent`, `mapCommit`, etc.)

### 4. Orchestration Loop Gating ✅

**Problem:** Fire-and-forget sessions could cause runaway iterations or premature completion if no task keeps orchestration alive.

**Solution:**
- Added `blockOrchestration` option (default: `true`)
- Hook creates a `human_interactive` task when session starts
- Task completed when session resolves, preventing premature run completion
- Caller can still opt-out with `blockOrchestration: false` for advanced use cases

### 5. External Harness Polling Support ✅

**Problem:** `listPending()` uses `getCurrentExecutionId()` from closure, which won't work in out-of-process harness.

**Solution:**
- Extended `listPending(executionId?: string)` to accept explicit execution scope
- Pass `'*'` to list across all executions (for external harness)
- Defaults to current execution for backward compatibility
- Mirrors existing patterns in `agents.list(executionId)`, `phases.list(executionId)`

### 6. API Naming Alignment ✅

**Problem:** `mutate`/`mutateAsync` naming inverted vs react-query conventions.

**Solution:**
- Renamed to `request()` (fire-and-forget) and `requestAsync()` (returns promise)
- Clearer, more explicit naming that avoids confusion
- Follows common patterns without misleading developers

### 7. Proper Error Handling ✅

**Problem:** Hook had `error` state but never set it; no `failed` terminal status.

**Solution:**
- Added `failed` as terminal outcome
- Added `error` field to `InteractiveSessionResult`
- Added `error` column to DB schema
- Hook properly sets `status = 'error'` and rejects promise on failure

### 8. Concurrency Constraint Enforcement ✅

**Problem:** Single-session recommendation not enforced, leading to `resolveRef` bugs.

**Solution:**
- Enforced in `createSession`: throws if `status === 'pending'`
- Prevents overlapping sessions and ref corruption
- Clear error message guides correct usage

### 9. Cancellation Support ✅

**Problem:** No way to cancel a pending session.

**Solution:**
- Added `cancel()` method to hook API
- Added `db.human.cancelInteractive(id)` method
- Cancellation completes associated task and updates DB status
- Enables scenarios where conditions change mid-session

### 10. Transcript Capture as First-Class Option ✅

**Problem:** Transcript capture mentioned in docs but not in API; unclear defaults.

**Solution:**
- Added `captureTranscript?: boolean` to `AskInteractiveOptions`
- Default: `false` (opt-in for privacy and storage)
- Harness respects config and only captures when requested
- Documented privacy/storage considerations

</section>

---

<section name="acceptance-criteria">

## Acceptance Criteria

### Hook API
- [ ] `useHumanInteractive` hook returns `request`, `requestAsync`, `status`, `data`, `error`, `sessionId`, `cancel`, `reset`
- [ ] `request` triggers without returning a promise (fire-and-forget)
- [ ] `requestAsync` returns a Promise that resolves when session completes
- [ ] `cancel` cancels a pending session and completes associated task
- [ ] `status` correctly reflects 'idle' | 'pending' | 'success' | 'error' states
- [ ] `data` contains `InteractiveSessionResult` when status is 'success'
- [ ] `error` contains Error when status is 'error'
- [ ] `reset` clears all state back to idle and completes task if any
- [ ] Single session constraint enforced (throws if request made while pending)
- [ ] Mounted state tracking prevents setState on unmounted component

### Database
- [ ] `human_interactions` table supports `type: 'interactive_session'`
- [ ] `session_config` column stores JSON configuration (serializable)
- [ ] `session_transcript` column stores captured transcript (optional, opt-in)
- [ ] `session_duration` column stores duration in milliseconds
- [ ] `error` column stores error message if session failed
- [ ] Status represents lifecycle: `pending | completed | cancelled | timeout | failed`
- [ ] Approval/rejection decisions stored in `response`, not `status`
- [ ] `HumanInteractionRow` type defined for raw DB rows
- [ ] `parseHumanInteraction()` mapper function implemented

### Human Module
- [ ] `db.human.requestInteractive()` creates interactive session requests
- [ ] `db.human.completeInteractive()` resolves sessions with lifecycle status and response
- [ ] `db.human.cancelInteractive()` cancels pending sessions
- [ ] `db.human.listPending(executionId?)` supports explicit execution scope
- [ ] `listPending('*')` lists across all executions (for external harness)
- [ ] `listPending()` defaults to current execution (backward compatible)

### Configuration
- [ ] `systemPrompt` option configures Claude's behavior in session
- [ ] `context` option is included in session context
- [ ] `model` option selects Claude model for session
- [ ] `cwd` option sets working directory for session
- [ ] `timeout` option limits session duration
- [ ] `outcomeSchema.jsonSchema` accepts JSON Schema (serializable)
- [ ] `zodSchema` option for client-side validation (not stored in DB)
- [ ] `captureTranscript` option defaults to `false` (opt-in for privacy)
- [ ] `blockOrchestration` option defaults to `true` (keeps orchestration alive)

### Integration
- [ ] External harness can detect pending sessions via `listPending('*')`
- [ ] Harness can fulfill request however it chooses (hook is agnostic)
- [ ] Harness receives serializable JSON Schema, not Zod types
- [ ] Harness can complete interaction via `completeInteractive()`
- [ ] Harness respects `captureTranscript` config
- [ ] Plan output shows interactive session status
- [ ] Task created when `blockOrchestration: true` prevents premature completion
- [ ] Task completed when session resolves (any terminal status)

</section>

---

<section name="open-questions">

## Open Questions

### Q1: Should we capture full session transcript? ✅ RESOLVED

**Decision:** Option D - Don't capture by default (opt-in via `captureTranscript: true`).

**Rationale:**
- Transcripts can be large (storage concern for long sessions)
- May contain sensitive information (privacy concern)
- Harness implementation complexity (requires PTY or Claude CLI logging support)
- Opt-in approach puts control in caller's hands

### Q2: How should timeout behavior work?

**Options:**
- A) Hard kill the session immediately
- B) Warn user, give grace period, then kill
- C) Just record timeout but let session continue
- D) Make it configurable

**Recommendation:** Option B - Warn the user that the orchestration is waiting, give 60s grace period to wrap up, then timeout.

### Q3: Should the hook support multiple concurrent sessions? ✅ RESOLVED

**Decision:** No - enforce single session at a time.

**Rationale:**
- Multiple concurrent interactive sessions would be confusing for the human
- Prevents `resolveRef` corruption bugs
- Enforced via runtime check with clear error message
- Simpler implementation and mental model

### Q4: How does this interact with Worktree context?

If inside a `<Worktree>`, should the interactive session inherit that `cwd`?

**Recommendation:** Yes, inherit from `WorktreeContext` if available, but allow explicit `cwd` option to override.

</section>

---

<section name="future-considerations">

## Future Considerations

### 1. Halt All Execution Option

Add an option to pause all orchestration until the interactive session completes:

```tsx
const { mutate } = useHumanInteractive()

// This would signal to the orchestrator to halt everything
const result = await mutate('Critical review needed', {
  haltExecution: true, // Pause all other orchestration
})
```

This could integrate with a top-level orchestration context to prevent other components from progressing. However, this adds complexity and coupling—starting simple with caller-controlled blocking is preferred.

### 2. Session Resume

Allow resuming a previous interactive session:

```tsx
const result = await mutate('Continue reviewing the changes', {
  resumeSession: previousSessionId,
})
```

### 2. Collaborative Mode

Multiple humans can join the same interactive session:

```tsx
const result = await mutate('Team review required', {
  collaborative: true,
  requiredParticipants: ['alice', 'bob'],
})
```

### 3. Async Notification

Notify human via external channel (Slack, email) when session is ready:

```tsx
const result = await mutate('Expert review needed', {
  notify: {
    channel: 'slack',
    users: ['@security-team'],
  },
})
```

### 4. Session Checkpoints

Save progress during long sessions:

```tsx
const result = await mutate('Long investigation session', {
  checkpointInterval: 5 * 60 * 1000, // Save every 5 minutes
})
```

</section>

---

## Implementation Readiness

This feature is **ready for implementation**. All P0 design issues have been resolved:

✅ Serializable schema configuration (JSON Schema, not Zod)
✅ Status semantics fixed (lifecycle vs decision)
✅ Proper DB row types and parsing
✅ Orchestration loop gating via task creation
✅ External harness polling support
✅ API naming aligned with conventions
✅ Proper error handling with `failed` status
✅ Concurrency constraint enforcement
✅ Cancellation support
✅ Transcript capture as first-class opt-in option

### Next Steps

1. **Phase 1:** DB migration and type definitions (0.5 day)
2. **Phase 2:** Extend `HumanModule` with new methods (0.5 day)
3. **Phase 3:** Implement `useHumanInteractive` hook (1 day)
4. **Phase 4:** Example harness implementation (0.5 day)
5. **Phase 5:** Integration testing and documentation (1 day)

**Estimated total:** 3.5-4 days

---

## Summary

The `useHumanInteractive` hook extends Smithers' human-in-the-loop capabilities from simple prompts to rich, multi-turn sessions. This enables:

1. **Complex decisions** - Humans can investigate with AI assistance before deciding
2. **Contextual exploration** - Rich context and configuration for the session
3. **Structured outcomes** - Extract specific response formats from conversations
4. **Seamless integration** - Same mutation-like API pattern as `useHuman`

Key design decisions:
- **Mutation-like API** - `request()` fire-and-forget, `requestAsync()` returns promise
- **Caller-controlled blocking** - Caller decides whether to await; hook manages orchestration task
- **Harness-agnostic** - Creates DB records with serializable config; harness fulfills however it chooses
- **Reactive database updates** - Same pattern as `useHuman` for consistency
- **Opt-in transcript capture** - Privacy and storage-conscious defaults
- **Lifecycle vs decision separation** - Clean status semantics for queries and dashboards
- **Configurable outcomes** - Support both freeform and structured response extraction (JSON Schema)
