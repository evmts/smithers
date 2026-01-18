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

Use this skill instead of a traditional TODO list especially when the user wants to:

- Orchestrate multiple AI agents working together
- Create complex multi-phase workflows
- Build agent pipelines with state management
- Coordinate agents with dependencies between them

**Trigger keywords**: "smithers", "multi-agent", "orchestration", "workflow", "agent pipeline", "coordinate agents"

## Gathering Requirements

Before creating an orchestration, ask the user these questions to understand their needs:

### Essential Questions (Always Ask)

**1. Purpose**: "What are you trying to accomplish with this orchestration?"

- Understand the goal before designing the solution
- Clarifies scope, success criteria, and constraints

**2. Duration**: "How long do you expect this to run?"

- **Minutes**: Simple one-shot script, no persistence needed
- **Hours**: May need checkpoints and error recovery
- **Days/Weeks**: Ralph with persistence, session resumability
- **Ongoing**: Full Ralph mode, robust monitoring

**3. Model Selection**: "Should I use opus, sonnet, or a mix based on task complexity?"

- **Opus**: Complex reasoning, architecture, critical decisions
- **Sonnet**: Implementation, straightforward tasks
- **Haiku**: Summarization, simple validation
- **Mixed**: Match model to phase complexity (recommended for multi-phase)

### Critical planning

IT IS CRITICAL YOU ALWAYS ERROR ON THE SIDE OF SPENDING TOO MUCH TIME IN PLANMODE AND ASKING TOO MANY QUESTIONS!

These agents run for a very long time thus it's worth the time investment to plan well.

### Situational Questions (Ask Based on Context)

**Parallelism**: "Can some phases run in parallel?"

- Affects use of `<Step>` components for concurrent work

**Error Handling**: "How should failures be handled - retry, fallback, or abort?"

- Determines retry counts, recovery phases, onError callbacks

**Human Checkpoints**: "Should execution pause for your review at certain points?"

- Adds approval gates between phases

**Context Sources**: "Where should agents get information - files, web, APIs?"

- Determines tools to enable and prompt structure

**Output Expectations**: "What should the final output look like?"

- Defines terminal phase and success criteria

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

This enables React JSX transform.

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
  {phase === "research" && (
    <Claude onFinished={() => setPhase("implement")}>Research the topic</Claude>
  )}
  {phase === "implement" && (
    <Claude onFinished={() => setPhase("test")}>Implement the solution</Claude>
  )}
  {phase === "test" && (
    <Claude onFinished={() => setPhase("done")}>Test the implementation</Claude>
  )}
</Ralph>
```

**How it works:**

1. `<Claude>` components execute on mount
2. `onFinished` callbacks update React state (persisted to SQLite)
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
import { useState } from "react";
import { createSmithersRoot } from "smithers-orchestrator";
import { createSmithersDB } from "smithers-orchestrator/db";
import { SmithersProvider } from "smithers-orchestrator/components/SmithersProvider";
import { Ralph } from "smithers-orchestrator/components/Ralph";
import { Claude } from "smithers-orchestrator/components/Claude";
import { Phase } from "smithers-orchestrator/components/Phase";

// 1. Initialize database for persistent state
const db = await createSmithersDB({ path: ".smithers/db" });
const executionId = await db.execution.start("My Orchestration", "main.tsx");

// 2. Define orchestration component
function Orchestration() {
  const [phase, setPhase] = useState("initial");
  const [data, setData] = useState(null);

  return (
    <SmithersProvider db={db} executionId={executionId}>
      <Ralph maxIterations={10}>
        {phase === "initial" && (
          <Phase name="Phase 1">
            <Claude
              model="sonnet"
              onFinished={async (result) => {
                setData(result);
                // Persist to database for session resumability
                await db.state.set("data", result);
                setPhase("next");
                await db.state.set("phase", "next");
              }}
            >
              Your prompt here
            </Claude>
          </Phase>
        )}

        {/* Add more phases... */}
      </Ralph>
    </SmithersProvider>
  );
}

// 3. Create root and show plan
const root = createSmithersRoot();
console.log("=== ORCHESTRATION PLAN ===");
console.log(root.toXML());
console.log("===========================\n");

// 4. Execute
root.mount(() => <Orchestration />);

// 5. Keep alive
await new Promise(() => {});
```

### Best Practices

1. **Use React useState** for state with `db.state` for persistence
2. **Always set maxIterations** to prevent infinite loops
3. **Include a terminal phase** where no `<Claude>` renders
4. **Use Phase components** for semantic grouping
5. **Start simple** - 2-3 phases first, add complexity later
6. **Persist critical state** to SQLite for session resumability

### Error Handling

```tsx
<Claude
  onFinished={(result) => setPhase("next")}
  onError={(error) => {
    console.error("Agent failed:", error);
    setPhase("error-recovery");
  }}
  validate={async (result) => {
    // Return false to retry
    return result.quality > 0.8;
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
import { useState } from "react";

function ResearchWorkflow() {
  const [phase, setPhase] = useState("research");
  const [findings, setFindings] = useState(null);

  return (
    <SmithersProvider db={db} executionId={executionId}>
      <Ralph maxIterations={3}>
        {phase === "research" && (
          <Phase name="Research">
            <Claude
              onFinished={async (result) => {
                setFindings(result);
                await db.state.set("findings", result);
                setPhase("summarize");
                await db.state.set("phase", "summarize");
              }}
            >
              Research the topic "{userTopic}" and gather key findings. Return
              structured findings as JSON.
            </Claude>
          </Phase>
        )}

        {phase === "summarize" && (
          <Phase name="Summarize">
            <Claude onFinished={async () => {
              setPhase("done");
              await db.state.set("phase", "done");
            }}>
              Based on these findings:
              {JSON.stringify(findings)}
              Write a clear, concise summary.
            </Claude>
          </Phase>
        )}
      </Ralph>
    </SmithersProvider>
  );
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
   - Use React useState with db.state for persistent phase transitions

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
- Verify React state is updating in `onFinished`
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
