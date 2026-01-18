---
name: smithers-orchestrator
description: Create and monitor multi-agent AI orchestrations using Smithers framework. Use when user wants to coordinate multiple AI agents, create complex workflows, build agent pipelines, or mentions "smithers", "multi-agent", "orchestration", "workflow", "agent coordination". Strongly recommends plan mode for orchestrations with 3+ phases.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
user-invocable: true
recommend-plan-mode: true
---

# Smithers Orchestrator

Create and monitor multi-agent AI workflows using declarative JSX.

## When to Use

Use this skill when the user wants to:
- Orchestrate multiple AI agents working together
- Create complex multi-phase workflows
- Build agent pipelines with state management
- Coordinate agents with dependencies between them

**Trigger keywords**: "smithers", "multi-agent", "orchestration", "workflow", "agent pipeline", "coordinate agents"

## Quick Start

### 1. Install and initialize

```bash
bun add smithers-orchestrator
bunx smithers-orchestrator init
```

Creates `.smithers/main.tsx` with a template.

### 2. Edit the orchestration program

Modify `.smithers/main.tsx` to define your agent workflow.

### 3. Configure bunfig.toml

Add to your project's `bunfig.toml`:

```toml
preload = ["./node_modules/smithers-orchestrator/preload.ts"]
```

This enables Solid JSX transform via bun-plugin-solid.

### 4. Monitor execution

```bash
bunx smithers-orchestrator monitor
```

Streams LLM-friendly execution updates.

## Plan Mode Recommendation

**For orchestrations with 3+ phases, recommend plan mode:**

> I recommend using plan mode for this orchestration. This lets us design the
> workflow carefully before execution. The Smithers JSX program will serve as
> the executable plan that you review before running.
>
> Press Shift+Tab twice to enter plan mode.

In plan mode:
1. Research requirements (read-only exploration)
2. Design the `.smithers/main.tsx` program
3. User reviews the JSX code (this IS the plan)
4. Execute with `bunx smithers-orchestrator monitor`

## The Smithers Pattern

Smithers uses the "Ralph Wiggum Loop" - a declarative iteration pattern:

```tsx
<Ralph maxIterations={5}>
  {phase === 'research' && (
    <Claude onFinished={() => setPhase('implement')}>
      Research the topic
    </Claude>
  )}
  {phase === 'implement' && (
    <Claude onFinished={() => setPhase('test')}>
      Implement the solution
    </Claude>
  )}
  {phase === 'test' && (
    <Claude onFinished={() => setPhase('done')}>
      Test the implementation
    </Claude>
  )}
</Ralph>
```

**How it works:**
1. `<Claude>` components execute on mount
2. `onFinished` callbacks update Zustand state
3. State change triggers re-render
4. Ralph detects completion and increments key
5. Key change forces remount → next phase executes
6. Loop continues until no more `<Claude>` components render

## CLI Commands

### `bunx smithers-orchestrator init`

Creates `.smithers/` directory with template:
```
.smithers/
├── main.tsx    # Your orchestration program
└── logs/       # Monitor output logs
```

### `bunx smithers-orchestrator run [file]`

Simple execution:
```bash
bunx smithers-orchestrator run .smithers/main.tsx
```

### `bunx smithers-orchestrator monitor [file]`

**Recommended for execution.** Provides LLM-friendly streaming output:

```bash
bunx smithers-orchestrator monitor .smithers/main.tsx
```

Output format:
```
[10:30:00] ◆ PHASE: Research
           Status: STARTING

[10:30:01] ● AGENT: Claude (sonnet)
           Status: RUNNING

[10:30:05] ⚡ TOOL CALL: Read
           File: src/index.ts
           SUMMARY: Main entry point with exports...
           📄 Full: .smithers/logs/tool-001.txt

[10:30:12] ✓ PHASE: Research
           Status: COMPLETE
```

## Reading Monitor Output

The monitor output uses these symbols:
- `▶` Orchestration start/end
- `◆` Phase events
- `●` Agent status
- `⚡` Tool calls
- `↻` Ralph iteration
- `✓` Success
- `✗` Error

**Large outputs are summarized.** To see full content:
```bash
cat .smithers/logs/tool-001.txt
```

## Creating Orchestrations

### Template Structure

```tsx
#!/usr/bin/env bun
import { create } from 'zustand'
import { createSmithersRoot } from 'smithers'
import { Ralph } from 'smithers/components/Ralph'
import { Claude } from 'smithers/components/Claude'
import { Phase } from 'smithers/components/Phase'

// 1. Define state with Zustand
const useStore = create((set) => ({
  phase: 'initial',
  data: null,
  setPhase: (phase: string) => set({ phase }),
  setData: (data: any) => set({ data }),
}))

// 2. Define orchestration component
function Orchestration() {
  const { phase, setPhase, data, setData } = useStore()

  return (
    <Ralph maxIterations={10}>
      {phase === 'initial' && (
        <Phase name="Phase 1">
          <Claude
            model="sonnet"
            onFinished={(result) => {
              setData(result)
              setPhase('next')
            }}
          >
            Your prompt here
          </Claude>
        </Phase>
      )}

      {/* Add more phases... */}
    </Ralph>
  )
}

// 3. Create root and show plan
const root = createSmithersRoot()
console.log('=== ORCHESTRATION PLAN ===')
console.log(root.toXML())
console.log('===========================\n')

// 4. Execute
root.mount(() => <Orchestration />)

// 5. Keep alive
await new Promise(() => {})
```

### Best Practices

1. **Always use Zustand** for state (not Solid signals with Ralph)
2. **Always set maxIterations** to prevent infinite loops
3. **Include a terminal phase** where no `<Claude>` renders
4. **Use Phase components** for semantic grouping
5. **Start simple** - 2-3 phases first, add complexity later

### Error Handling

```tsx
<Claude
  onFinished={(result) => setPhase('next')}
  onError={(error) => {
    console.error('Agent failed:', error)
    setPhase('error-recovery')
  }}
  validate={async (result) => {
    // Return false to retry
    return result.quality > 0.8
  }}
>
  Do work with validation
</Claude>
```

## Workflow Example

User: "Create an agent workflow to research a topic and write a summary"

**Step 1**: Initialize
```bash
bunx smithers-orchestrator init
```

**Step 2**: Edit `.smithers/main.tsx`
```tsx
const useStore = create((set) => ({
  phase: 'research',
  findings: null,
  setPhase: (phase) => set({ phase }),
  setFindings: (findings) => set({ findings }),
}))

function ResearchWorkflow() {
  const { phase, setPhase, findings, setFindings } = useStore()

  return (
    <Ralph maxIterations={3}>
      {phase === 'research' && (
        <Phase name="Research">
          <Claude onFinished={(result) => {
            setFindings(result)
            setPhase('summarize')
          }}>
            Research the topic "{userTopic}" and gather key findings.
            Return structured findings as JSON.
          </Claude>
        </Phase>
      )}

      {phase === 'summarize' && (
        <Phase name="Summarize">
          <Claude onFinished={() => setPhase('done')}>
            Based on these findings:
            {JSON.stringify(findings)}

            Write a clear, concise summary.
          </Claude>
        </Phase>
      )}
    </Ralph>
  )
}
```

**Step 3**: Monitor execution
```bash
bunx smithers-orchestrator monitor
```

**Step 4**: Watch the stream for phase transitions and results

## Using This Skill in Claude Code

When a user asks for multi-agent orchestration:

1. **Initialize the project**:
   ```bash
   bunx smithers-orchestrator init
   ```

2. **Create the orchestration program**:
   - Use Write tool to create `.smithers/main.tsx`
   - Follow the template structure
   - Define phases based on user requirements
   - Set up Zustand state for phase transitions

3. **Show the plan to user**:
   - The JSX code IS the plan
   - Explain what each phase does
   - Highlight key transitions

4. **Execute with monitoring**:
   ```bash
   bunx smithers-orchestrator monitor
   ```

5. **Read monitor output**:
   - Parse the structured output
   - Summarize progress for user
   - If errors occur, read full logs from `.smithers/logs/`

## Debugging

### If orchestration doesn't start

```bash
# Check for syntax errors
bun check .smithers/main.tsx

# Run with verbose output
DEBUG=smithers:* bunx smithers-orchestrator monitor
```

### If agents aren't executing

- Check that `<Claude>` components are rendering (phase conditions)
- Verify Zustand state is updating in `onFinished`
- Check Ralph `maxIterations` isn't 0

### If infinite loop

- Ensure a terminal phase exists (no `<Claude>` components)
- Check `onFinished` is setting phase correctly
- Verify `maxIterations` is set

## Monitor Output Integration

When executing orchestrations, the monitor command provides structured output designed for LLM consumption:

**What you'll see:**
- Timestamps on all events
- Phase transitions with status
- Agent execution updates
- Tool call summaries (large outputs auto-summarized)
- Full output paths for detailed inspection

**How to use it:**
1. Run `bunx smithers-orchestrator monitor`
2. Read the streaming output
3. For large tool outputs, check the summary first
4. If needed, read full output from `.smithers/logs/` directory
5. Report progress and results back to user

## Advanced: Haiku Summarization

The monitor command uses Claude Haiku to summarize large outputs (> 50 lines). This keeps the stream concise while preserving access to full content.

**Configuration:**
```bash
# Enable summarization (requires API key)
export ANTHROPIC_API_KEY=sk-...

# Adjust threshold (default: 50 lines)
export SMITHERS_SUMMARY_THRESHOLD=100

# Run monitor
bunx smithers-orchestrator monitor
```

**Without API key:**
- Large outputs are truncated
- Full content still saved to `.smithers/logs/`

## Additional Resources

For complete API reference, see [REFERENCE.md](REFERENCE.md)
For working examples, see [EXAMPLES.md](EXAMPLES.md)
