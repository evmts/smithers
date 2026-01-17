# Smithers Orchestrator Plugin

Multi-agent orchestration framework for Claude Code using the Smithers framework. Create complex AI agent workflows with declarative JSX.

## Installation

```bash
claude plugin install smithers-orchestrator
```

Or install locally for development:

```bash
git clone <repo-url>
cd smithers-orchestrator
claude plugin install .
```

## Quick Start

Once installed, trigger the skill by asking Claude:

```
"Create a multi-agent workflow to build a REST API"
```

Claude will:
1. Create a `.smithers/main.tsx` file with your workflow
2. Show you the plan (the JSX code itself)
3. Wait for your approval
4. Execute the workflow

## What is Smithers?

Smithers is a declarative framework for AI agent orchestration using:

- **JSX** - Declarative workflow definition
- **Ralph Wiggum Loop** - Automatic remount-based iteration
- **Self-Executing Components** - Agents that execute themselves on mount
- **Type Safety** - Full TypeScript support
- **Fine-Grained Reactivity** - Powered by Solid.js

### Example Workflow

```tsx
import { Ralph, Claude, Phase } from 'smithers'
import { create } from 'zustand'

const useStore = create((set) => ({
  phase: 'research',
  setPhase: (phase) => set({ phase }),
}))

export default function Workflow() {
  const { phase, setPhase } = useStore()

  return (
    <Ralph maxIterations={3}>
      {phase === 'research' && (
        <Phase name="Research">
          <Claude onFinished={() => setPhase('implement')}>
            Research the best approach
          </Claude>
        </Phase>
      )}

      {phase === 'implement' && (
        <Phase name="Implementation">
          <Claude onFinished={() => setPhase('test')}>
            Implement the solution
          </Claude>
        </Phase>
      )}

      {phase === 'test' && (
        <Phase name="Testing">
          <Claude onFinished={() => setPhase('done')}>
            Test and verify
          </Claude>
        </Phase>
      )}
    </Ralph>
  )
}
```

## Key Features

### 🎯 Declarative Workflows

Define what should happen, not how to orchestrate it:

```tsx
<Ralph maxIterations={5}>
  <Phase name="Setup">
    <Claude>Initialize the project</Claude>
  </Phase>
  <Phase name="Build">
    <Claude>Implement features</Claude>
  </Phase>
</Ralph>
```

### 🔄 Automatic Iteration

The Ralph Wiggum loop automatically handles iteration:
- Detects task completion
- Triggers remounts for next iteration
- Respects maxIterations limits

### 🎨 Type-Safe JSX

Full TypeScript support with custom JSX elements:

```tsx
<Claude model="sonnet" maxTurns={10}>
  Your prompt here
</Claude>
```

### 📦 State Management

Built-in Zustand integration for phase transitions:

```tsx
const useStore = create((set) => ({
  phase: 'start',
  setPhase: (phase) => set({ phase }),
}))
```

### ✅ Validation

Optional validation for quality control:

```tsx
<Claude
  validate={async (result) => result.tests_passing === true}
  onFinished={() => setPhase('next')}
>
  Run tests
</Claude>
```

## Components

### Ralph - Loop Controller

Manages the remount loop for iterative workflows.

```tsx
<Ralph maxIterations={10} onIteration={(i) => console.log(i)}>
  {/* workflow */}
</Ralph>
```

### Claude - Agent Component

Self-executing AI agent.

```tsx
<Claude
  model="sonnet"
  onFinished={(result) => {}}
  onError={(error) => {}}
>
  Your task here
</Claude>
```

### Phase - Semantic Grouping

Organize workflows into logical phases.

```tsx
<Phase name="Research">
  {/* tasks */}
</Phase>
```

### Step - Fine-Grained Organization

Sub-tasks within phases.

```tsx
<Step name="Configuration">
  {/* task */}
</Step>
```

## Documentation

- **[SKILL.md](skills/smithers-orchestrator/SKILL.md)** - Complete skill guide with patterns and best practices
- **[REFERENCE.md](skills/smithers-orchestrator/REFERENCE.md)** - Full API documentation
- **[EXAMPLES.md](skills/smithers-orchestrator/EXAMPLES.md)** - Working examples covering common patterns

## Trigger Phrases

The skill activates when you mention:
- Multi-agent
- Orchestration
- Smithers
- Workflow
- Agent coordination
- Multi-phase
- Iterative agents

## Workflow Patterns

### Sequential Execution

```tsx
phase === 'step1' → onFinished → phase = 'step2'
phase === 'step2' → onFinished → phase = 'step3'
```

### Conditional Branching

```tsx
<Claude onFinished={(result) => {
  if (result.success) {
    setPhase('success-path')
  } else {
    setPhase('retry-path')
  }
}}>
  Analyze requirements
</Claude>
```

### Parallel Execution

```tsx
<Phase name="Parallel">
  <Claude>Task 1</Claude>
  <Claude>Task 2</Claude>
  <Claude>Task 3</Claude>
</Phase>
```

### Error Handling

```tsx
<Claude
  onError={(error) => {
    if (retryCount < maxRetries) {
      setPhase('retry')
    } else {
      setPhase('recovery')
    }
  }}
>
  Critical task
</Claude>
```

## Requirements

- **Bun** - Runtime for executing Smithers workflows
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```

- **Claude Code** - v1.0.0 or higher

## Project Structure

```
smithers-orchestrator/
├── plugin.json              # Plugin metadata
├── README.md               # This file
├── skills/
│   └── smithers-orchestrator/
│       ├── SKILL.md        # Skill implementation guide
│       ├── REFERENCE.md    # API reference
│       └── EXAMPLES.md     # Working examples
└── scripts/
    ├── monitor.sh          # Workflow monitoring
    └── install-deps.sh     # Dependency installation
```

## Development

### Testing Locally

1. Clone the repository
2. Install locally:
   ```bash
   claude plugin install .
   ```

3. Test the skill:
   ```bash
   claude "Create a multi-agent workflow for testing"
   ```

### Monitoring Workflows

Use the monitoring script to track execution:

```bash
bash scripts/monitor.sh .smithers/main.tsx
```

### Mock Mode

Test without real API calls:

```bash
MOCK_MODE=true bun run .smithers/main.tsx
```

## Architecture

Smithers uses several innovative patterns:

### 1. Self-Executing Components

Components execute themselves on mount - no external orchestrator needed.

```tsx
export function Claude(props) {
  onMount(() => {
    (async () => {
      const result = await executePrompt(props.children)
      props.onFinished?.(result)
    })()
  })

  return <claude>{props.children}</claude>
}
```

### 2. Ralph Wiggum Loop

Key-based remount triggers iteration:

```tsx
const [key, setKey] = createSignal(0)

// When tasks complete:
setKey(k => k + 1)  // Forces remount
```

### 3. JSX as Plan

The `.smithers/main.tsx` file IS the executable plan. Users review the actual code that will execute, not a separate markdown document.

### 4. Fine-Grained Reactivity

Powered by Solid.js for efficient in-place updates.

## Troubleshooting

### Skill Not Activating

Make sure you use trigger phrases:
- "Create a multi-agent workflow"
- "Set up orchestration for"
- "I need a Smithers workflow"

### Dependencies Not Installed

```bash
cd .smithers
bun install smithers zustand
```

### Workflow Loops Forever

Check:
1. `maxIterations` is set
2. Terminal state exists (`phase === 'done'`)
3. `onFinished` updates phase correctly

### State Not Updating

Use Zustand, not Solid signals:

```tsx
// ✅ Correct
const useStore = create((set) => ({
  phase: 'start',
  setPhase: (phase) => set({ phase }),
}))

// ❌ Wrong
const [phase, setPhase] = createSignal('start')
```

## Examples

See [EXAMPLES.md](skills/smithers-orchestrator/EXAMPLES.md) for complete working examples:

1. **Simple Sequential** - Basic three-phase workflow
2. **Conditional Branching** - Branch based on results
3. **Parallel Execution** - Multiple agents simultaneously
4. **Error Handling** - Retry logic and recovery
5. **Data Flow** - Passing data between phases

## Contributing

Contributions welcome! Please see the main Smithers repository for guidelines.

## License

MIT

## Links

- [Smithers Framework](https://github.com/smithers-framework/smithers)
- [Claude Code](https://claude.com/claude-code)
- [Plugin Documentation](https://code.claude.com/docs/en/plugins)
- [Skills Documentation](https://code.claude.com/docs/en/skills)

## Support

For issues or questions:
- GitHub Issues: [smithers-orchestrator](https://github.com/smithers-framework/smithers-orchestrator/issues)
- Smithers Docs: See included documentation files
- Claude Code Docs: https://code.claude.com/docs

## Version History

### 1.0.0 (Current)
- Initial release
- Core orchestration patterns
- Ralph, Claude, Phase, Step components
- Zustand state management
- Complete documentation
- 5 working examples
- Monitoring scripts

---

**Ready to build complex AI workflows?**

```bash
claude plugin install smithers-orchestrator
```

Then ask Claude:

```
"Create a multi-agent workflow to build a full-stack application"
```

Watch the magic happen! ✨
