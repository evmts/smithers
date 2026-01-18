# useHumanInteractive Hook: Interactive Claude Sessions for Human Input

<metadata>
  <priority>medium</priority>
  <category>feature</category>
  <estimated-effort>2-3 days</estimated-effort>
  <status>design-review</status>
  <dependencies>
    - src/hooks/useHuman.ts
    - src/db/human.ts
    - src/components/agents/claude-cli/executor.ts
    - src/components/SmithersProvider.tsx
  </dependencies>
</metadata>

---

## Executive Summary

Add a `useHumanInteractive` hook that pauses orchestration to open an interactive Claude Code session where a human can collaborate with Claude to answer a question or resolve an issue. Unlike `useHuman` which presents simple prompts/options, this hook enables rich, multi-turn conversations with full Claude Code capabilities (file editing, tool use, etc.).

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
const decision = await askInteractive(
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

```tsx
interface UseHumanInteractiveResult {
  /**
   * Open an interactive Claude session for human input.
   * Resolves when the session ends with the session outcome.
   */
  askInteractive: <T = InteractiveSessionResult>(
    prompt: string,
    options?: AskInteractiveOptions
  ) => Promise<T>

  /**
   * Current interaction status
   */
  status: 'idle' | 'pending' | 'resolved'

  /**
   * The current session ID (if any)
   */
  sessionId: string | null
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
    schema?: z.ZodType
  }
}

interface InteractiveSessionResult {
  /**
   * How the session ended
   */
  outcome: 'completed' | 'cancelled' | 'timeout'

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
}
```

### Usage Examples

**Basic interactive session:**

```tsx
const { askInteractive } = useHumanInteractive()

async function reviewChanges() {
  const result = await askInteractive(
    'Please review the proposed database schema changes and approve or reject them.'
  )

  if (result.outcome === 'completed' && result.response === 'approved') {
    // Proceed with migration
  }
}
```

**With context and structured outcome:**

```tsx
const result = await askInteractive<{ approved: boolean; notes: string }>(
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
      schema: z.object({
        approved: z.boolean(),
        notes: z.string(),
      }),
    },
  }
)
```

**Expert consultation:**

```tsx
const { askInteractive } = useHumanInteractive()

// Escalate to human expert when AI is uncertain
const diagnosis = await askInteractive(
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
  }
)
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
```

### HumanInteraction Type Extension

```typescript
interface HumanInteraction {
  id: string
  execution_id: string
  type: 'confirmation' | 'select' | 'input' | 'interactive_session'
  prompt: string
  options: string[] | null
  status: 'pending' | 'approved' | 'rejected' | 'timeout' | 'cancelled'
  response: any | null
  created_at: string
  resolved_at: string | null
  // New fields for interactive sessions
  session_config?: InteractiveSessionConfig | null
  session_transcript?: string | null
  session_duration?: number | null
}

interface InteractiveSessionConfig {
  systemPrompt?: string
  context?: Record<string, unknown>
  model?: string
  cwd?: string
  mcpConfig?: string
  timeout?: number
  outcomeSchema?: OutcomeSchemaConfig
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
import type { HumanInteraction } from '../db/human.js'
import { useQueryOne } from '../reactive-sqlite/index.js'

export function useHumanInteractive(): UseHumanInteractiveResult {
  const { db } = useSmithers()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const resolveRef = useRef<((value: any) => void) | null>(null)
  const startTimeRef = useRef<number | null>(null)

  // Reactive subscription to the current session
  const { data: session } = useQueryOne<HumanInteraction>(
    db.db,
    sessionId
      ? `SELECT * FROM human_interactions WHERE id = ?`
      : `SELECT 1 WHERE 0`,
    sessionId ? [sessionId] : []
  )

  // Resolve promise when session completes
  useEffect(() => {
    if (session && session.status !== 'pending' && resolveRef.current) {
      const duration = startTimeRef.current
        ? Date.now() - startTimeRef.current
        : 0

      let response = null
      try {
        response = session.response
          ? JSON.parse(session.response as string)
          : null
      } catch {
        response = session.response
      }

      const result: InteractiveSessionResult = {
        outcome: session.status === 'approved' ? 'completed'
               : session.status === 'cancelled' ? 'cancelled'
               : 'timeout',
        response,
        transcript: session.session_transcript ?? undefined,
        duration,
      }

      const resolve = resolveRef.current
      resolveRef.current = null
      startTimeRef.current = null
      resolve(result)
    }
  }, [session])

  const askInteractive = useCallback(async <T = InteractiveSessionResult>(
    prompt: string,
    options?: AskInteractiveOptions
  ): Promise<T> => {
    return new Promise<T>((resolve) => {
      resolveRef.current = resolve as (value: any) => void
      startTimeRef.current = Date.now()

      // Create interactive session request in DB
      const config: InteractiveSessionConfig = {
        systemPrompt: options?.systemPrompt,
        context: options?.context,
        model: options?.model,
        cwd: options?.cwd,
        mcpConfig: options?.mcpConfig,
        timeout: options?.timeout,
        outcomeSchema: options?.outcomeSchema,
      }

      const id = db.human.requestInteractive(prompt, config)
      setSessionId(id)
    })
  }, [db])

  return {
    askInteractive,
    status: sessionId
      ? (session?.status === 'pending' ? 'pending' : 'resolved')
      : 'idle',
    sessionId,
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
   * Complete an interactive session
   */
  completeInteractive: (
    id: string,
    outcome: 'completed' | 'cancelled' | 'timeout',
    response: unknown,
    transcript?: string,
    duration?: number
  ) => void
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
  outcome: 'completed' | 'cancelled' | 'timeout',
  response: unknown,
  transcript?: string,
  duration?: number
) => {
  const status = outcome === 'completed' ? 'approved'
               : outcome === 'cancelled' ? 'cancelled'
               : 'timeout'

  rdb.run(
    `UPDATE human_interactions
     SET status = ?, response = ?, session_transcript = ?,
         session_duration = ?, resolved_at = ?
     WHERE id = ?`,
    [status, JSON.stringify(response), transcript ?? null, duration ?? null, now(), id]
  )
}
```

</section>

---

<section name="harness-integration">

## External Harness Integration

The external harness (UI/CLI) is responsible for:

1. **Detecting interactive session requests** - Poll `db.human.listPending()` for `type: 'interactive_session'`
2. **Launching Claude Code** - Start an interactive `claude` process (without `--print`)
3. **Providing context** - Inject the session config (system prompt, context) into Claude
4. **Capturing outcome** - When session ends, call `db.human.completeInteractive()`

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
    captureTranscript: true,
  })

  // Extract structured response if schema provided
  const response = config.outcomeSchema
    ? extractStructuredResponse(result, config.outcomeSchema)
    : result.lastResponse

  // Complete the interaction
  db.human.completeInteractive(
    request.id,
    result.exitReason, // 'completed' | 'cancelled' | 'timeout'
    response,
    result.transcript,
    Date.now() - startTime
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
| **Interaction type** | Simple prompt/response | Multi-turn conversation |
| **Human capability** | Select from options, confirm, input text | Full Claude Code session (files, tools, commands) |
| **Duration** | Seconds | Minutes to hours |
| **Context** | Prompt string only | Rich context object + system prompt |
| **Outcome** | Direct response | Structured or extracted from conversation |
| **Claude involvement** | None (pure human input) | Claude assists the human |
| **Use case** | Approvals, selections, simple inputs | Complex decisions, investigation, consultation |

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

<section name="acceptance-criteria">

## Acceptance Criteria

### Hook API
- [ ] `useHumanInteractive` hook returns `askInteractive`, `status`, `sessionId`
- [ ] `askInteractive` returns a Promise that resolves when session completes
- [ ] `status` correctly reflects 'idle' | 'pending' | 'resolved' states
- [ ] Promise resolves with `InteractiveSessionResult` containing outcome, response, duration

### Database
- [ ] `human_interactions` table supports `type: 'interactive_session'`
- [ ] `session_config` column stores JSON configuration
- [ ] `session_transcript` column stores captured transcript (optional)
- [ ] `session_duration` column stores duration in milliseconds

### Human Module
- [ ] `db.human.requestInteractive()` creates interactive session requests
- [ ] `db.human.completeInteractive()` resolves sessions with outcome and response
- [ ] `db.human.listPending()` includes interactive sessions

### Configuration
- [ ] `systemPrompt` option configures Claude's behavior in session
- [ ] `context` option is included in session context
- [ ] `model` option selects Claude model for session
- [ ] `cwd` option sets working directory for session
- [ ] `timeout` option limits session duration
- [ ] `outcomeSchema` option enables structured response extraction

### Integration
- [ ] Harness can detect pending interactive sessions
- [ ] Harness can launch Claude in interactive mode
- [ ] Harness can capture session completion and resolve interaction
- [ ] Plan output shows interactive session status

</section>

---

<section name="open-questions">

## Open Questions

### Q1: Should we capture full session transcript?

**Options:**
- A) Always capture full transcript (storage concern for long sessions)
- B) Capture last N messages only
- C) Make it configurable via option
- D) Don't capture by default, opt-in only

**Recommendation:** Option D - Don't capture by default. Transcripts can be large and may contain sensitive information. Opt-in via `captureTranscript: true` option.

### Q2: How should timeout behavior work?

**Options:**
- A) Hard kill the session immediately
- B) Warn user, give grace period, then kill
- C) Just record timeout but let session continue
- D) Make it configurable

**Recommendation:** Option B - Warn the user that the orchestration is waiting, give 60s grace period to wrap up, then timeout.

### Q3: Should the hook support multiple concurrent sessions?

The current `useHuman` only supports one request at a time. Should `useHumanInteractive` be different?

**Recommendation:** No, keep single session at a time for simplicity. Multiple concurrent interactive sessions would be confusing for the human anyway.

### Q4: How does this interact with Worktree context?

If inside a `<Worktree>`, should the interactive session inherit that `cwd`?

**Recommendation:** Yes, inherit from `WorktreeContext` if available, but allow explicit `cwd` option to override.

</section>

---

<section name="future-considerations">

## Future Considerations

### 1. Session Resume

Allow resuming a previous interactive session:

```tsx
const result = await askInteractive('Continue reviewing the changes', {
  resumeSession: previousSessionId,
})
```

### 2. Collaborative Mode

Multiple humans can join the same interactive session:

```tsx
const result = await askInteractive('Team review required', {
  collaborative: true,
  requiredParticipants: ['alice', 'bob'],
})
```

### 3. Async Notification

Notify human via external channel (Slack, email) when session is ready:

```tsx
const result = await askInteractive('Expert review needed', {
  notify: {
    channel: 'slack',
    users: ['@security-team'],
  },
})
```

### 4. Session Checkpoints

Save progress during long sessions:

```tsx
const result = await askInteractive('Long investigation session', {
  checkpointInterval: 5 * 60 * 1000, // Save every 5 minutes
})
```

</section>

---

## Summary

The `useHumanInteractive` hook extends Smithers' human-in-the-loop capabilities from simple prompts to rich, multi-turn Claude Code sessions. This enables:

1. **Complex decisions** - Humans can investigate with AI assistance before deciding
2. **Contextual exploration** - Full access to Claude Code's file/tool capabilities
3. **Structured outcomes** - Extract specific response formats from conversations
4. **Seamless integration** - Same promise-based API as `useHuman`, just richer interaction

Key design decisions:
- **External harness launches the session** - Keep the hook simple, let harness handle process management
- **Reactive database updates** - Same pattern as `useHuman` for consistency
- **Optional transcript capture** - Don't store by default for privacy/storage reasons
- **Configurable outcomes** - Support both freeform and structured response extraction
