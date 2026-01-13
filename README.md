# Smithers

**A declarative framework for building AI agents in SolidJS.**

Build AI agents the same way you build user interfaces. Smithers lets you compose complex agent workflows from simple, reusable components using JSX—with SolidJS signals driving behavior, conditional rendering controlling flow, and TypeScript keeping everything type-safe.

```tsx
import { createSignal } from 'solid-js'
import { renderPlan, executePlan, Claude, Phase, Step, Subagent } from '@evmts/smithers'

function ResearchAgent(props) {
  const [phase, setPhase] = createSignal('research')
  const [sources, setSources] = createSignal([])
  const [analyses, setAnalyses] = createSignal({})

  // Return a closure to track signal updates (standard SolidJS pattern for dynamic sub-trees)
  return () => {
    const p = phase()
    const s = sources()
    const a = analyses()

    if (p === 'research') {
      return (
        <Claude tools={[webSearch]} onFinished={(result) => {
          setSources(result.sources)
          setPhase('analyze')
        }}>
          <Phase name="research">
            <Step>Search for recent articles about {props.topic}</Step>
            <Step>Find at least 5 credible sources</Step>
          </Phase>
        </Claude>
      )
    }

    if (p === 'analyze') {
      return (
        <>
          {s.map((source) => (
            <Subagent key={source.id} name={`analyzer-${source.id}`}>
              <Claude onFinished={(result) => {
                 setAnalyses(prev => ({ ...prev, [source.id]: result }))
                 if (Object.keys(analyses()).length === s.length) {
                   setPhase('write')
                 }
              }}>
                Analyze: {source.url}
                Identify: main argument, evidence quality, potential biases
              </Claude>
            </Subagent>
          ))}
        </>
      )
    }

    return (
      <Claude tools={[filesystem]}>
        <Phase name="write">
          Write a research report synthesizing: {JSON.stringify(Object.values(a))}
          Save to output/report.md
        </Phase>
      </Claude>
    )
  }
}

// Preview the XML plan
const xml = await renderPlan(() => <ResearchAgent topic="quantum computing" />)
console.log(xml)

// Execute the agent
const result = await executePlan(() => <ResearchAgent topic="quantum computing" />)
```

## Why Smithers?

**Agents are just UIs for LLMs.** The same problems you solved with component frameworks for user interfaces—composition, state management, conditional rendering—apply to agent orchestration. Smithers brings the SolidJS mental model to AI agents.

| Without Smithers | With Smithers |
|--------------|-----------|
| Imperative chains of API calls | Declarative component trees |
| Scattered state across functions | Centralized Solid signals |
| Copy-paste prompt templates | Reusable, composable components |
| Hard to visualize agent flow | Preview the plan before execution |
| Manual parallel orchestration | `<Subagent parallel>` |

## Key Features

✨ **Desktop App** - Real-time execution visualization with the Smithers Desktop (Tauri)
🔄 **The Ralph Wiggum Loop** - Automatic re-execution until your agent completes its goals
Signal **SolidJS State Management** - Use signals, stores, and effects
🎯 **Terraform-Style Approval** - Preview the plan before execution
🧩 **Component Composition** - Build complex agents from simple, reusable pieces
⚡ **Parallel Execution** - Run multiple agents concurrently with `<Subagent parallel>`
🔧 **MCP Integration** - Connect to Model Context Protocol servers for external tools
🎮 **Interactive Commands** - Pause, inject context, skip steps during execution
🌳 **Git Worktrees** - Isolate agents in separate git worktrees for parallel development
📊 **Rate Limiting & Cost Control** - Built-in usage tracking and budget enforcement
🧪 **Mock Mode** - Test agents without API calls
📝 **MDX Support** - Write agents in Markdown with JSX components

## Install

**Requirements:**
- [Bun](https://bun.sh) - Required for the CLI and tests
- Node.js 18+ - Works for programmatic/library usage
- [pnpm](https://pnpm.io) - For monorepo development

```bash
# Install the core library
npm install @evmts/smithers solid-js
# or with bun
bun add @evmts/smithers solid-js

# Install the CLI (globally)
npm install -g @evmts/smithers-cli
# or use npx
npx @evmts/smithers-cli run agent.mdx
```

## Quick Start

### 1. Create an agent

Create `review-agent.tsx`:

```tsx
import { Claude, Constraints, OutputFormat } from '@evmts/smithers'

export default function ReviewAgent(props) {
  return (
    <Claude tools={[filesystem, grep]}>
      <Constraints>
        - Focus on bugs and security issues
        - Be constructive, not pedantic
        - Ignore formatting (that's what linters are for)
      </Constraints>

      Review these files for issues: {props.files.join(', ')}

      <OutputFormat>
        Return JSON: { issues: [{ file, line, severity, message }] }
      </OutputFormat>
    </Claude>
  )
}
```

### 2. Run it

```bash
# Preview the plan first (Terraform-style)
smithers run review-agent.tsx --props '{"files": ["src/auth.ts"]}'

# Or auto-approve and execute immediately
smithers run review-agent.tsx --props '{"files": ["src/auth.ts"]}' --auto-approve
```

### 3. See the plan

Smithers shows you exactly what the agent will do before executing:

```
┌─ Plan ─────────────────────────────────────────────────────┐
│                                                            │
│  <claude tools="filesystem,grep">                          │
│    <constraints>                                           │
│      - Focus on bugs and security issues                   │
│      - Be constructive, not pedantic                       │
│      - Ignore formatting (that's what linters are for)     │
│    </constraints>                                          │
│                                                            │
│    Review these files for issues: src/auth.ts              │
│                                                            │
│    <output-format>                                         │
│      Return JSON: { issues: [{ file, line, severity...     │
│    </output-format>                                        │
│  </claude>                                                 │
│                                                            │
└────────────────────────────────────────────────────────────┘

? Execute this plan? (Y/n)
```

### 4. Watch it run with the Desktop App

When running the CLI, the Smithers Desktop app can connect for real-time visualization:

```bash
smithers run review-agent.tsx
# Press 'o' to open Smithers Desktop when prompted
```

The desktop app shows the execution tree, agent outputs, and allows interactive control:

```
┌─ Smithers Desktop ────────────────────────────── Frame: 3 | Elapsed: 12.5s ─┐
│ Tree View                    │ Agent Details                               │
│ ▼ ROOT                       │ Prompt:                                     │
│   ▼ claude                   │ Review these files for issues: src/auth.ts  │
│     ● constraints (complete) │                                             │
│     ⚙ Phase: review (running)│ Output:                                     │
│     ○ output-format (pending)│ Analyzing src/auth.ts...                    │
│                              │ Found 3 potential issues:                  │
│ Status: ●Running             │ 1. Line 42: Missing input validation       │
│ Commands: ↑↓ Navigate        │ 2. Line 58: SQL injection risk             │
│          ←→ Expand/Collapse  │ 3. Line 91: Unused import                  │
│          ⏎  View Details     │                                            │
│          q  Quit             │ Commands: ↑↓ Scroll | Esc Back             │
└──────────────────────────────────────────────────────────────────────────┘
```

See [TUI Usage Guide](docs/guides/tui-usage.mdx) for keyboard shortcuts and interactive commands.

## The Complete Development Workflow

This is the flagship example showing how to build production-grade features with Smithers. It implements a comprehensive workflow with:

- **Human-in-the-loop** approval at multiple checkpoints
- **Research → Plan → POC → Refine → Implement** cycle
- **Extended thinking** for deep analysis
- **Test-driven development** flow

```tsx
import { createStore } from 'solid-js/store'
import { executePlan, Claude, Phase, Step, Persona, Constraints, OutputFormat, Human, Stop } from '@evmts/smithers'

type WorkflowPhase =
  | 'prompt-input' | 'research' | 'planning' | 'plan-review'
  | 'poc' | 'poc-analysis' | 'refined-review'
  | 'api-impl' | 'test-impl' | 'test-verify' | 'implementation'
  | 'done' | 'cancelled'

function FeatureWorkflow(props) {
  const [state, setState] = createStore({
    phase: 'prompt-input' as WorkflowPhase,
    prompt: '',
    fileResearch: [],
    initialPlan: null,
    refinedPlan: null,
    pocResult: null,
  })

  const nextPhase = () => {
    const phases = ['prompt-input', 'research', 'planning', 'plan-review', 'poc', 'poc-analysis', 'refined-review', 'api-impl', 'test-impl', 'test-verify', 'implementation', 'done']
    const idx = phases.indexOf(state.phase)
    if (idx < phases.length - 1) setState('phase', phases[idx + 1] as WorkflowPhase)
  }

  return () => {
    switch (state.phase) {
      // Phase 1: Human confirms the feature request
      case 'prompt-input':
        return (
          <Human
            message="Review the feature request before proceeding"
            onApprove={() => { setState('prompt', props.prompt); nextPhase() }}
            onReject={() => setState('phase', 'cancelled')}
          >
            Feature: {props.prompt}
          </Human>
        )

      // Phase 2: Research the codebase
      case 'research':
        return (
          <Claude
            allowedTools={['Read', 'Glob', 'Grep']}
            onFinished={(result) => {
              setState('fileResearch', result.files)
              nextPhase()
            }}
          >
            <Persona role="senior software architect">
              You explore codebases thoroughly before acting.
            </Persona>
            <Phase name="research">
              <Step>Search for relevant file paths</Step>
              <Step>Find existing patterns and conventions</Step>
              <Step>Identify integration points</Step>
            </Phase>
            Feature to implement: {state.prompt}
          </Claude>
        )

      // Phase 3: Create implementation plan
      case 'planning':
        return (
          <Claude onFinished={(plan) => { setState('initialPlan', plan); nextPhase() }}>
            <Persona role="software architect">Create detailed, actionable plans.</Persona>
            <Phase name="planning">
              <Step>Analyze research findings</Step>
              <Step>Break down into concrete steps</Step>
              <Step>Identify test cases including edge cases</Step>
              <Step>Define public API surface</Step>
            </Phase>
            <OutputFormat schema={{ summary: 'string', steps: 'array', testCases: 'array', apis: 'array' }}>
              Return a JSON implementation plan.
            </OutputFormat>
          </Claude>
        )

      // Phase 4: Human reviews the plan
      case 'plan-review':
        return (
          <Human
            message="Review the implementation plan"
            onApprove={() => nextPhase()}
            onReject={() => setState('phase', 'cancelled')}
          >
            {JSON.stringify(state.initialPlan, null, 2)}
          </Human>
        )

      // Phase 5: Build a proof of concept
      case 'poc':
        return (
          <Claude
            allowedTools={['Read', 'Write', 'Edit', 'Bash']}
            onFinished={(result) => { setState('pocResult', result); nextPhase() }}
          >
            <Persona role="rapid prototyping engineer">
              Build quick, working prototypes to validate approaches.
            </Persona>
            <Constraints>
              - Build a WORKING proof of concept, not production code
              - Goal is to validate the approach and discover unknowns
              - Document discoveries and suggestions for the real implementation
            </Constraints>
          </Claude>
        )

      // Phase 6: Deep analysis with extended thinking
      case 'poc-analysis':
        return (
          <Claude
            maxThinkingTokens={16000}
            onFinished={(result) => {
              setState('refinedPlan', result.refinedPlan)
              nextPhase()
            }}
          >
            <Persona role="senior architect">Deep analysis of POC results.</Persona>
            <Phase name="poc-analysis">
              <Step>Analyze POC discoveries</Step>
              <Step>Update plan based on learnings</Step>
              <Step>Add detailed test cases from POC findings</Step>
            </Phase>
            POC Result: {JSON.stringify(state.pocResult)}
          </Claude>
        )

      // Phase 7: Human reviews refined plan
      case 'refined-review':
        return (
          <Human
            message="Review the refined plan with APIs and test cases"
            onApprove={() => nextPhase()}
            onReject={() => setState('phase', 'cancelled')}
          >
            {JSON.stringify(state.refinedPlan, null, 2)}
          </Human>
        )

      // Phase 8: Implement types and JSDoc (throw not implemented)
      case 'api-impl':
        return (
          <Claude allowedTools={['Read', 'Write', 'Edit']} onFinished={() => nextPhase()}>
            <Phase name="api-impl">
              <Step>Create TypeScript interfaces and types</Step>
              <Step>Write comprehensive JSDoc documentation</Step>
              <Step>All function bodies throw new Error('Not implemented')</Step>
            </Phase>
          </Claude>
        )

      // Phase 9: Write tests
      case 'test-impl':
        return (
          <Claude allowedTools={['Read', 'Write', 'Edit']} onFinished={() => nextPhase()}>
            <Phase name="test-impl">
              <Step>Write tests for all test cases from plan</Step>
              <Step>Tests should FAIL at this point</Step>
            </Phase>
          </Claude>
        )

      // Phase 10: Verify tests fail
      case 'test-verify':
        return (
          <Claude allowedTools={['Bash']} onFinished={() => nextPhase()}>
            <Phase name="test-verify">
              <Step>Run test suite</Step>
              <Step>Verify tests fail with "Not implemented"</Step>
            </Phase>
          </Claude>
        )

      // Phase 11: Implement the actual code
      case 'implementation':
        return (
          <Claude allowedTools={['Read', 'Write', 'Edit', 'Bash']} onFinished={() => nextPhase()}>
            <Phase name="implementation">
              <Step>Replace stubs with real implementation</Step>
              <Step>Run tests until they pass</Step>
            </Phase>
          </Claude>
        )

      case 'done':
        return null

      case 'cancelled':
        return <Stop reason="Workflow cancelled by user" />
    }
  }
}

// Run the workflow
await executePlan(
  () => <FeatureWorkflow prompt="Add user authentication" />,
  {
    onHumanPrompt: async (message, content) => {
      console.log(message, content)
      return true // or show UI for approval
    },
  }
)
```

This workflow demonstrates how senior engineers build features:
1. **Research first** - understand the codebase before coding
2. **Human checkpoints** - catch issues early with approval gates
3. **POC validation** - discover unknowns before committing to a plan
4. **TDD flow** - types → tests (fail) → implementation (pass)
5. **Extended thinking** - deep analysis for complex decisions

See [examples/00-feature-workflow](./examples/00-feature-workflow) for the full implementation.

## Core Concepts

### Components Are Prompts

Every Smithers component renders to part of a prompt. The `<Claude>` component marks execution boundaries—everything inside becomes the prompt sent to Claude.

```tsx
<Claude>
  <Persona role="Senior Engineer">
    You have 10 years of experience in distributed systems.
  </Persona>

  <Constraints>
    - Always consider edge cases
    - Suggest tests for any code changes
  </Constraints>

  Review this architecture proposal: {props.proposal}
</Claude>
```

Renders to:

```xml
<claude>
  <persona role="Senior Engineer">
    You have 10 years of experience in distributed systems.
  </persona>
  <constraints>
    - Always consider edge cases
    - Suggest tests for any code changes
  </constraints>
  Review this architecture proposal: ...
</claude>
```

### State Drives Behavior

Use SolidJS signals or stores to control what your agent does. When state changes, the plan automatically updates.

```tsx
import { createSignal } from 'solid-js'

function ResearchAgent(props) {
  const [phase, setPhase] = createSignal('research')
  const [findings, setFindings] = createSignal(null)

  const complete = () => setPhase('done')

  // Return a closure to create a reactive effect
  return () => {
    const p = phase()

    if (p === 'research') {
      return (
        <Claude tools={[webSearch]} onFinished={(result) => {
          setFindings(result)
          setPhase('synthesize')
        }}>
          Research {props.topic}. Find 5 authoritative sources.
        </Claude>
      )
    }

    if (p === 'synthesize') {
      return (
        <Claude onFinished={complete}>
          Synthesize these findings into a report: {JSON.stringify(findings())}
        </Claude>
      )
    }

    return <div>Research complete!</div>
  }
}
```

The agent automatically progresses through phases as `onFinished` callbacks update state.

### Composition

Build complex agents from simple, reusable pieces:

```tsx
// Reusable persona component
function SecurityExpert(props) {
  return (
    <Persona role="Security Expert">
      You are a senior application security engineer with expertise
      in OWASP Top 10, secure coding practices, and threat modeling.
      {props.children}
    </Persona>
  )
}

// Reusable output format
function JSONOutput(props) {
  return (
    <OutputFormat schema={props.schema}>
      Respond with valid JSON matching the schema. No markdown, no explanation.
    </OutputFormat>
  )
}

// Composed agent
function SecurityAudit(props) {
  return (
    <Claude tools={[filesystem, grep]}>
      <SecurityExpert />
      <Constraints>
        - Focus on high and critical severity issues
        - Provide actionable remediation steps
      </Constraints>

      Audit {props.codebase} for security vulnerabilities.

      <JSONOutput schema={{
        vulnerabilities: [{
          severity: 'critical | high | medium | low',
          location: 'string',
          description: 'string',
          remediation: 'string'
        }]
      }} />
    </Claude>
  )
}
```

### Parallel Execution

Use `<Subagent>` to run multiple agents concurrently:

```tsx
import { createStore } from 'solid-js/store'

function ParallelResearch(props) {
  const [results, setResults] = createStore({})

  return () => {
    const pendingTopics = props.topics.filter(t => !results[t])

    if (pendingTopics.length > 0) {
      return (
        <>
          {pendingTopics.map(topic => (
            <Subagent key={topic} name={`researcher-${topic}`}>
              <Claude
                tools={[webSearch]}
                onFinished={(result) => {
                  setResults(topic, result)
                }}
              >
                Research: {topic}
              </Claude>
            </Subagent>
          ))}
        </>
      )
    }

    return (
      <Claude>
        Combine these research results into a unified report:
        {JSON.stringify(results)}
      </Claude>
    )
  }
}
```

All `<Subagent>` components execute in parallel. The parent waits for all to complete before the next render.

## Real-World Examples

### Multi-Agent Code Generation

An architect designs the solution, then multiple developers implement in parallel:

```tsx
import { createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'

function FeatureTeam(props) {
  const [plan, setPlan] = createSignal(null)
  const [implementations, setImplementations] = createStore({})

  return () => {
    const p = plan()

    // Phase 1: Architect designs the plan
    if (!p) {
      return (
        <Claude onFinished={setPlan}>
          <Persona role="Software Architect" />
          Design an implementation plan for: {props.feature}

          Break it into independent subtasks that can be worked on in parallel.
          <OutputFormat schema={{ subtasks: [{ id: 'string', description: 'string' }] }} />
        </Claude>
      )
    }

    // Phase 2: Developers implement in parallel
    const pendingTasks = p.subtasks.filter(t => !implementations[t.id])

    if (pendingTasks.length > 0) {
      return (
        <>
          {pendingTasks.map(task => (
            <Subagent key={task.id} name={`dev-${task.id}`}>
              <Claude
                tools={[filesystem, terminal]}
                onFinished={(code) => {
                  setImplementations(task.id, code)
                }}
              >
                <Persona role="Senior Developer" />
                Implement this subtask: {task.description}
                Write clean, tested code.
              </Claude>
            </Subagent>
          ))}
        </>
      )
    }

    // Phase 3: Integration
    return (
      <Claude tools={[filesystem, terminal]}>
        <Persona role="Tech Lead" />
        Review and integrate these implementations:
        {JSON.stringify(implementations)}

        Ensure everything works together and tests pass.
      </Claude>
    )
  }
}
```

### Data Processing Pipeline

Process data through multiple stages with error handling:

```tsx
import { createSignal } from 'solid-js'

function DataPipeline(props) {
  const [stage, setStage] = createSignal('extract')
  const [data, setData] = createSignal(null)
  const [error, setError] = createSignal(null)

  return () => {
    const s = stage()
    const d = data()
    const err = error()

    if (err) {
      return (
        <Claude onFinished={() => { setError(null); setStage('extract') }}>
          This error occurred: {err.message}
          Suggest how to fix it and retry.
        </Claude>
      )
    }

    if (s === 'extract') {
      return (
        <Claude
          tools={[database, api]}
          onFinished={(res) => { setData(res); setStage('transform') }}
          onError={setError}
        >
          <Phase name="extract">
            Extract data from {props.source}.
            Handle pagination and rate limits.
          </Phase>
        </Claude>
      )
    }

    if (s === 'transform') {
      return (
        <Claude
          onFinished={(res) => { setData(res); setStage('validate') }}
          onError={setError}
        >
          <Phase name="transform">
            Clean and normalize this data: {JSON.stringify(d)}
            - Remove duplicates
            - Standardize date formats
            - Fill missing values where possible
          </Phase>
        </Claude>
      )
    }

    if (s === 'validate') {
      return (
        <Claude
          onFinished={(res) => { setData(res); setStage('load') }}
          onError={setError}
        >
          <Phase name="validate">
            Validate this data: {JSON.stringify(d)}
            Check for: completeness, consistency, accuracy
          </Phase>
        </Claude>
      )
    }

    if (s === 'load') {
      return (
        <Claude
          tools={[database]}
          onFinished={() => setStage('done')}
          onError={setError}
        >
          <Phase name="load">
            Load this validated data into the target database:
            {JSON.stringify(d)}
          </Phase>
        </Claude>
      )
    }

    return <div>Pipeline complete!</div>
  }
}
```

### Interactive Refinement Loop

An agent that iterates based on feedback:

```tsx
import { createSignal } from 'solid-js'

function WritingAssistant(props) {
  const [draft, setDraft] = createSignal(null)
  const [feedback, setFeedback] = createSignal(null)
  const [iteration, setIteration] = createSignal(0)

  return () => {
    const d = draft()
    const f = feedback()
    const i = iteration()

    // Initial draft
    if (!d) {
      return (
        <Claude onFinished={setDraft}>
          Write a first draft for: {props.assignment}
        </Claude>
      )
    }

    // Get feedback
    if (!f) {
      return (
        <Claude onFinished={setFeedback}>
          <Persona role="Editor" />
          Review this draft and provide specific, actionable feedback:
          {d}
        </Claude>
      )
    }

    // Refine based on feedback (max 3 iterations)
    if (i < 3 && f.needsWork) {
      return (
        <Claude
          onFinished={(newDraft) => {
            setDraft(newDraft)
            setFeedback(null)
            setIteration(prev => prev + 1)
          }}
        >
          Revise this draft based on the feedback:

          Draft: {d}
          Feedback: {JSON.stringify(f)}
        </Claude>
      )
    }

    return (
      <Claude>
        Polish this final draft for publication: {d}
      </Claude>
    )
  }
}
```

## CLI Reference

### `smithers run`

Execute an agent file.

```bash
smithers run <file> [options]

Options:
  --props, -p <json>     Props to pass to the component
  --auto-approve, -y     Skip plan approval prompt
  --tui                  Launch interactive terminal UI
  --verbose, -v          Show detailed execution logs
  --max-frames <n>       Maximum execution iterations (default: 100)
  --timeout <ms>         Execution timeout in milliseconds
  --output, -o <file>    Write final output to file
  --mock                 Run in mock mode (no API calls)
```

Examples:

```bash
# Run with props
smithers run agent.tsx --props '{"repo": "my-org/my-repo"}'

# Auto-approve for CI/CD
smithers run agent.tsx -y

# Interactive TUI with live execution visualization
smithers run agent.tsx --tui

# Debug mode
smithers run agent.tsx --verbose

# Save output
smithers run agent.tsx -o result.json

# Mock mode for testing (no API costs)
smithers run agent.tsx --mock
```

**Interactive Commands** (available during execution with `--tui`):

While your agent runs, use these commands to control execution:

- `/pause` - Pause after current frame
- `/resume` - Resume from paused state
- `/status` - Show execution state
- `/tree` - Display the current agent tree
- `/focus <path>` - Navigate to a specific node
- `/skip [path]` - Skip a pending node
- `/inject <prompt>` - Add context to next Claude call
- `/abort [reason]` - Stop execution immediately
- `/help` - Show command reference

See [Interactive Commands Guide](docs/guides/interactive-commands.mdx) for details.

### `smithers plan`

Preview the plan without executing.

```bash
smithers plan <file> [options]

Options:
  --props, -p <json>     Props to pass to the component
  --output, -o <file>    Write plan XML to file
```

### `smithers init`

Scaffold a new Smithers project.

```bash
smithers init [directory]

Creates:
  - agent.mdx starter template (based on `--template`)
  - package.json with smithers dependency (if missing)
```

## Components

### `<Claude>`

The core execution component. Everything inside becomes the prompt.

```tsx
<Claude
  tools={[tool1, tool2]}        // MCP servers to connect
  onFinished={(output) => {}}   // Called with structured output
  onError={(error) => {}}       // Called on failure
  model="claude-sonnet-4"       // Model override
>
  {/* Prompt content */}
</Claude>
```

### `<Subagent>`

Parallel execution boundary.

```tsx
<Subagent
  name="worker-1"               // Identifier for logs
  parallel={true}               // Run concurrently (default: true)
>
  <Claude>...</Claude>
</Subagent>
```

### `<Phase>` / `<Step>`

Semantic organization for multi-step plans.

```tsx
<Phase name="analysis">
  <Step>Gather requirements</Step>
  <Step>Identify constraints</Step>
  <Step>Propose solutions</Step>
</Phase>
```

### `<RunInParallel>`

Runs a series of steps in parallel:

```tsx
<Phase name="implementation">
  <RunInParallel>
    <Step>Read the existing code</Step>
    <Step>Write the new feature</Step>
  </RunInParallel>
  <Step>Run tests</Step>
</Phase>
```

### `<Human>`

Pauses execution and waits for human approval before continuing. Useful for requiring manual review at critical checkpoints.

```tsx
function DeploymentAgent() {
  const [approved, setApproved] = useState(false)

  if (!approved) {
    return (
      <Human
        message="Review changes before deployment"
        onApprove={() => setApproved(true)}
        onReject={() => console.log('Deployment cancelled')}
      >
        The following changes will be deployed to production:
        - Update user authentication flow
        - Add new API endpoints
      </Human>
    )
  }

  return (
    <Claude>Deploy the changes to production</Claude>
  )
}
```

**Props:**
- `message?: string` - Message to display to the user (default: "Human approval required to continue")
- `onApprove?: () => void` - Callback when user approves (typically updates state to remove the Human node)
- `onReject?: () => void` - Callback when user rejects (if not provided, execution halts)
- `children?: ReactNode` - Content to display for review

**Note:** The `<Human>` component requires an `onHumanPrompt` callback in `executePlan()` options for interactive prompting. Without it, the component auto-approves (useful for testing).

### `<Persona>`

Define the agent's role and expertise.

```tsx
<Persona role="Database Expert">
  You have 15 years of experience with PostgreSQL, MySQL, and MongoDB.
  You prioritize query performance and data integrity.
</Persona>
```

### `<Constraints>`

Set behavioral boundaries.

```tsx
<Constraints>
  - Never modify production data directly
  - Always explain your reasoning
  - Ask for clarification if requirements are ambiguous
</Constraints>
```

### `<OutputFormat>`

Specify expected response structure.

```tsx
<OutputFormat schema={{
  type: 'object',
  properties: {
    summary: { type: 'string' },
    confidence: { type: 'number' }
  }
}}>
  Return valid JSON matching this schema.
</OutputFormat>
```

## Programmatic API

Use Smithers in your own applications:

```tsx
import { renderPlan, executePlan, Claude } from '@evmts/smithers'

// Just render to XML (no execution)
const xml = await renderPlan(<MyAgent topic="AI safety" />)
console.log(xml)

// Execute with full control
const result = await executePlan(<MyAgent topic="AI safety" />, {
  autoApprove: true,
  maxFrames: 50,
  onPlan: (xml, frame) => console.log(`Frame ${frame}:`, xml),
  onFrame: (result) => console.log('Completed:', result.executedNodes),
})

console.log('Final output:', result.output)
console.log('Total frames:', result.frames)
```

## Don't write Smithers code!

Prompt the plan! Consider using your favorite coding harness like Claude Code to implement the plan using Smithers. You can then tell Claude Code to sleep for 5 minutes at a time and deliver you an easy to read report of what happened every 5 minutes.

## MDX Support

Write agents in MDX for a documentation-friendly format:

```mdx
---
name: Code Review Agent
---

import { Claude, Constraints } from '@evmts/smithers'
import { github } from './tools'

# Code Review Agent

This agent reviews pull requests for code quality issues.

<Claude tools={[github]}>
  <Constraints>
    - Focus on logic errors, not style
    - Be constructive and specific
  </Constraints>

  Review PR #{props.pr} on {props.repo}.
  Comment directly on problematic lines.
</Claude>
```

This agent.mdx file represents your entrypoint. [Ralph](https://ghuntley.com/ralph/) will act as the runtime rerunning this entrypoint file everytime.

Run it:

```bash
smithers run review.mdx --props '{"repo": "acme/api", "pr": 123}'
```

## TypeScript

Smithers is written in TypeScript and exports full type definitions:

```tsx
import type {
  ClaudeProps,
  SubagentProps,
  ExecutionResult,
  Tool,
} from '@evmts/smithers'

// Define typed tools
const searchTool: Tool = {
  name: 'web-search',
  description: 'Search the web for information',
  parameters: {
    query: { type: 'string', required: true }
  }
}

// Type-safe component props
interface MyAgentProps {
  topic: string
  maxResults?: number
}

function MyAgent(props: MyAgentProps) {
  return (
    <Claude tools={[searchTool]}>
      Search for {props.maxResults || 10} results about: {props.topic}
    </Claude>
  )
}
```

## How It Works

Smithers uses a custom SolidJS renderer:

1.  **Render**: Your JSX components render to an internal `SmithersNode` tree using Solid's fine-grained reactivity.
2.  **Serialize**: The tree is converted to an XML plan.
3.  **Preview**: You see the plan before execution (unless `--auto-approve`).
4.  **Execute**: `<Claude>` nodes are executed via the Claude API.
5.  **Update**: `onFinished` callbacks update Solid signals.
6.  **Loop**: Signal changes trigger fine-grained updates to the tree, back to step 2.
7.  **Complete**: When no pending `<Claude>` nodes remain, execution finishes.

This "render loop" model means your agent's behavior emerges from your SolidJS component logic—conditionals, state machines, composition—all the patterns you already know.

## Documentation

- [Core Concepts](./docs/concepts.md) - Deep dive into the mental model
- [Component Reference](./docs/components.md) - Full API documentation
- [Examples](./examples) - More complete examples
- [Manual Tests](./manual-tests) - Real API integration tests

## Project Structure

Smithers is organized as a pnpm monorepo:

```
smithers/
├── packages/
│   ├── smithers/           # @evmts/smithers - Core library (SolidJS)
│   ├── cli/                # @evmts/smithers-cli - CLI tool
│   └── protocol/           # @evmts/smithers-protocol - WebSocket protocol
├── apps/
│   └── tauri-app/          # @evmts/smithers-desktop - Desktop app (Tauri + Solid.js)
├── evals/                  # Test suite
├── examples/               # Example agents
└── docs/                   # Documentation
```

### Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
bun test

# Run typecheck
pnpm typecheck

# Start desktop app in dev mode
cd apps/tauri-app && pnpm dev:tauri
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

MIT
