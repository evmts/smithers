# Plue

**A declarative framework for building AI agents in React.**

Build AI agents the same way you build user interfaces. Plue lets you compose complex agent workflows from simple, reusable components using JSX—with React state driving behavior, conditional rendering controlling flow, and TypeScript keeping everything type-safe.

```tsx
import { useState } from 'react'
import { Claude, Phase, Step } from 'plue'

function CodeReviewAgent({ pr }) {
  const [review, setReview] = useState(null)

  if (!review) {
    return (
      <Claude tools={[github, filesystem]} onFinished={setReview}>
        <Phase name="review">
          <Step>Check out PR #{pr} and read the changes</Step>
          <Step>Analyze for bugs, security issues, and style</Step>
          <Step>Write a detailed review with inline comments</Step>
        </Phase>
      </Claude>
    )
  }

  return <Claude>Summarize this review: {JSON.stringify(review)}</Claude>
}
```

## Why Plue?

**Agents are just UIs for LLMs.** The same problems you solved with React for user interfaces—composition, state management, conditional rendering—apply to agent orchestration. Plue brings the React mental model to AI agents.

| Without Plue | With Plue |
|--------------|-----------|
| Imperative chains of API calls | Declarative component trees |
| Scattered state across functions | Centralized React state |
| Copy-paste prompt templates | Reusable, composable components |
| Hard to visualize agent flow | Preview the plan before execution |
| Manual parallel orchestration | `<Subagent parallel>` |

## Install

```bash
npm install plue
# or
bun add plue
```

## Quick Start

### 1. Create an agent

Create `review-agent.tsx`:

```tsx
import { Claude, Constraints, OutputFormat } from 'plue'

export function ReviewAgent({ files }) {
  return (
    <Claude tools={[filesystem, grep]}>
      <Constraints>
        - Focus on bugs and security issues
        - Be constructive, not pedantic
        - Ignore formatting (that's what linters are for)
      </Constraints>

      Review these files for issues: {files.join(', ')}

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
plue run review-agent.tsx --props '{"files": ["src/auth.ts"]}'

# Or auto-approve and execute immediately
plue run review-agent.tsx --props '{"files": ["src/auth.ts"]}' --auto-approve
```

### 3. See the plan

Plue shows you exactly what the agent will do before executing:

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

## Core Concepts

### Components Are Prompts

Every Plue component renders to part of a prompt. The `<Claude>` component marks execution boundaries—everything inside becomes the prompt sent to Claude.

```tsx
<Claude>
  <Persona role="Senior Engineer">
    You have 10 years of experience in distributed systems.
  </Persona>

  <Constraints>
    - Always consider edge cases
    - Suggest tests for any code changes
  </Constraints>

  Review this architecture proposal: {proposal}
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

Use React state to control what your agent does. When state changes, the component re-renders with a new plan.

```tsx
function ResearchAgent({ topic }) {
  const [phase, setPhase] = useState('research')
  const [findings, setFindings] = useState(null)

  if (phase === 'research') {
    return (
      <Claude
        tools={[webSearch]}
        onFinished={(result) => {
          setFindings(result)
          setPhase('synthesize')
        }}
      >
        Research {topic}. Find 5 authoritative sources.
      </Claude>
    )
  }

  if (phase === 'synthesize') {
    return (
      <Claude onFinished={() => setPhase('done')}>
        Synthesize these findings into a report: {JSON.stringify(findings)}
      </Claude>
    )
  }

  return <div>Research complete!</div>
}
```

The agent automatically progresses through phases as `onFinished` callbacks update state.

### Composition

Build complex agents from simple, reusable pieces:

```tsx
// Reusable persona component
function SecurityExpert({ children }) {
  return (
    <Persona role="Security Expert">
      You are a senior application security engineer with expertise
      in OWASP Top 10, secure coding practices, and threat modeling.
      {children}
    </Persona>
  )
}

// Reusable output format
function JSONOutput({ schema }) {
  return (
    <OutputFormat schema={schema}>
      Respond with valid JSON matching the schema. No markdown, no explanation.
    </OutputFormat>
  )
}

// Composed agent
function SecurityAudit({ codebase }) {
  return (
    <Claude tools={[filesystem, grep]}>
      <SecurityExpert />
      <Constraints>
        - Focus on high and critical severity issues
        - Provide actionable remediation steps
      </Constraints>

      Audit {codebase} for security vulnerabilities.

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
function ParallelResearch({ topics }) {
  const [results, setResults] = useState({})

  const pendingTopics = topics.filter(t => !results[t])

  if (pendingTopics.length > 0) {
    return (
      <>
        {pendingTopics.map(topic => (
          <Subagent key={topic} name={`researcher-${topic}`}>
            <Claude
              tools={[webSearch]}
              onFinished={(result) => {
                setResults(prev => ({ ...prev, [topic]: result }))
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
```

All `<Subagent>` components execute in parallel. The parent waits for all to complete before the next render.

## Real-World Examples

### Multi-Agent Code Generation

An architect designs the solution, then multiple developers implement in parallel:

```tsx
function FeatureTeam({ feature }) {
  const [plan, setPlan] = useState(null)
  const [implementations, setImplementations] = useState({})

  // Phase 1: Architect designs the plan
  if (!plan) {
    return (
      <Claude onFinished={setPlan}>
        <Persona role="Software Architect" />
        Design an implementation plan for: {feature}

        Break it into independent subtasks that can be worked on in parallel.
        <OutputFormat schema={{ subtasks: [{ id: 'string', description: 'string' }] }} />
      </Claude>
    )
  }

  // Phase 2: Developers implement in parallel
  const pendingTasks = plan.subtasks.filter(t => !implementations[t.id])

  if (pendingTasks.length > 0) {
    return (
      <>
        {pendingTasks.map(task => (
          <Subagent key={task.id} name={`dev-${task.id}`}>
            <Claude
              tools={[filesystem, terminal]}
              onFinished={(code) => {
                setImplementations(prev => ({ ...prev, [task.id]: code }))
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
```

### Data Processing Pipeline

Process data through multiple stages with error handling:

```tsx
function DataPipeline({ source }) {
  const [stage, setStage] = useState('extract')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  if (error) {
    return (
      <Claude onFinished={() => { setError(null); setStage('extract') }}>
        This error occurred: {error.message}
        Suggest how to fix it and retry.
      </Claude>
    )
  }

  const stages = {
    extract: (
      <Claude
        tools={[database, api]}
        onFinished={(d) => { setData(d); setStage('transform') }}
        onError={setError}
      >
        <Phase name="extract">
          Extract data from {source}.
          Handle pagination and rate limits.
        </Phase>
      </Claude>
    ),

    transform: (
      <Claude
        onFinished={(d) => { setData(d); setStage('validate') }}
        onError={setError}
      >
        <Phase name="transform">
          Clean and normalize this data: {JSON.stringify(data)}
          - Remove duplicates
          - Standardize date formats
          - Fill missing values where possible
        </Phase>
      </Claude>
    ),

    validate: (
      <Claude
        onFinished={(d) => { setData(d); setStage('load') }}
        onError={setError}
      >
        <Phase name="validate">
          Validate this data: {JSON.stringify(data)}
          Check for: completeness, consistency, accuracy
        </Phase>
      </Claude>
    ),

    load: (
      <Claude
        tools={[database]}
        onFinished={() => setStage('done')}
        onError={setError}
      >
        <Phase name="load">
          Load this validated data into the target database:
          {JSON.stringify(data)}
        </Phase>
      </Claude>
    ),

    done: <div>Pipeline complete!</div>
  }

  return stages[stage]
}
```

### Interactive Refinement Loop

An agent that iterates based on feedback:

```tsx
function WritingAssistant({ assignment }) {
  const [draft, setDraft] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [iteration, setIteration] = useState(0)

  // Initial draft
  if (!draft) {
    return (
      <Claude onFinished={setDraft}>
        Write a first draft for: {assignment}
      </Claude>
    )
  }

  // Get feedback
  if (!feedback) {
    return (
      <Claude onFinished={setFeedback}>
        <Persona role="Editor" />
        Review this draft and provide specific, actionable feedback:
        {draft}
      </Claude>
    )
  }

  // Refine based on feedback (max 3 iterations)
  if (iteration < 3 && feedback.needsWork) {
    return (
      <Claude
        onFinished={(newDraft) => {
          setDraft(newDraft)
          setFeedback(null)
          setIteration(i => i + 1)
        }}
      >
        Revise this draft based on the feedback:

        Draft: {draft}
        Feedback: {JSON.stringify(feedback)}
      </Claude>
    )
  }

  return (
    <Claude>
      Polish this final draft for publication: {draft}
    </Claude>
  )
}
```

## CLI Reference

### `plue run`

Execute an agent file.

```bash
plue run <file> [options]

Options:
  --props, -p <json>     Props to pass to the component
  --auto-approve, -y     Skip plan approval prompt
  --verbose, -v          Show detailed execution logs
  --max-frames <n>       Maximum execution iterations (default: 100)
  --timeout <ms>         Execution timeout in milliseconds
  --output, -o <file>    Write final output to file
```

Examples:

```bash
# Run with props
plue run agent.tsx --props '{"repo": "my-org/my-repo"}'

# Auto-approve for CI/CD
plue run agent.tsx -y

# Debug mode
plue run agent.tsx --verbose

# Save output
plue run agent.tsx -o result.json
```

### `plue plan`

Preview the plan without executing.

```bash
plue plan <file> [options]

Options:
  --props, -p <json>     Props to pass to the component
  --output, -o <file>    Write plan XML to file
```

### `plue init`

Scaffold a new Plue project.

```bash
plue init [directory]

Creates:
  - package.json with plue dependency
  - tsconfig.json configured for JSX
  - src/agent.tsx starter template
  - .env.example for API keys
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

Stops execution of the closest parent ralph until a human intervenes:

```tsx
{needsHumanReview && <Human>Please review the progress so far</Human>}
```

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

Use Plue in your own applications:

```tsx
import { renderPlan, executePlan, Claude } from 'plue'

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

import { Claude, Constraints } from 'plue'
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
plue run review.mdx --props '{"repo": "acme/api", "pr": 123}'
```

## TypeScript

Plue is written in TypeScript and exports full type definitions:

```tsx
import type {
  ClaudeProps,
  SubagentProps,
  ExecutionResult,
  Tool,
} from 'plue'

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

function MyAgent({ topic, maxResults = 10 }: MyAgentProps) {
  return (
    <Claude tools={[searchTool]}>
      Search for {maxResults} results about: {topic}
    </Claude>
  )
}
```

## How It Works

Plue uses a custom React renderer (like react-dom, but for AI agents):

1. **Render**: Your JSX components render to an internal tree
2. **Serialize**: The tree is converted to an XML plan
3. **Preview**: You see the plan before execution (unless `--auto-approve`)
4. **Execute**: `<Claude>` nodes are executed via the Claude API
5. **Update**: `onFinished` callbacks update React state
6. **Loop**: State changes trigger re-render, back to step 1
7. **Complete**: When no pending `<Claude>` nodes remain, execution finishes

This "render loop" model means your agent's behavior emerges from your React component logic—conditionals, state machines, composition—all the patterns you already know.

## Documentation

- [Core Concepts](./docs/concepts.md) - Deep dive into the mental model
- [Component Reference](./docs/components.md) - Full API documentation
- [Examples](./examples) - More complete examples

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

MIT
