# Development Team

A complete multi-agent development team with Architect, Developer, and Reviewer roles. Demonstrates complex orchestration, inter-agent communication, and iterative workflows.

## What This Example Shows

- **Multi-agent orchestration** with distinct specialized roles
- **Sequential workflow** with dependencies between agents
- **Iterative refinement** - Reviewer can request changes from Developer
- **Complex state management** tracking multiple subtasks
- **Dependency resolution** - subtasks respect their dependencies

## The Team

| Agent | Role | Responsibilities |
|-------|------|------------------|
| **Architect** | Software Architect | Analyzes task, designs solution, breaks into subtasks |
| **Developer** | Senior Developer | Implements subtasks, writes tests, follows patterns |
| **Reviewer** | Tech Lead | Runs tests, reviews code, approves or requests changes |

## Workflow

```
[Planning]
  Architect analyzes task
  -> Creates plan with subtasks and dependencies

[Implementing]
  For each subtask (respecting dependencies):
    Developer implements the subtask
    -> Updates status to 'complete'

[Reviewing]
  Reviewer runs tests and reviews all code
  -> If approved: Done
  -> If changes needed: Back to implementing with revision notes

[Done]
  All subtasks complete and approved
```

## Complex State

```tsx
interface DevTeamState {
  stage: 'planning' | 'implementing' | 'reviewing' | 'done'

  plan: {
    overview: string
    subtasks: Subtask[]
  }

  currentSubtask: string | null

  reviewResult: {
    approved: boolean
    notes: string[]
    requiredChanges: string[]
  }
}
```

## Dependency Resolution

Subtasks can declare dependencies on other subtasks:

```tsx
{
  id: 'auth-api',
  name: 'Authentication API',
  dependencies: ['db-schema'],  // Must complete first
}
```

The Developer component checks dependencies before executing:

```tsx
function Developer({ subtask }) {
  // Check if dependencies are complete
  const depsComplete = subtask.dependencies.every((depId) =>
    store.plan?.subtasks.find((s) => s.id === depId)?.status === 'complete'
  )

  if (!depsComplete) {
    return null  // Wait for dependencies
  }

  return <Claude>...</Claude>
}
```

## Revision Loop

If the Reviewer finds issues, they can request revisions:

```tsx
function Reviewer() {
  return (
    <Claude
      onFinished={(result) => {
        if (result.approved) {
          actions.nextStage()  // -> done
        } else {
          // Send back to implementing with notes
          result.requiredChanges.forEach((change) => {
            actions.requestRevision(change.subtaskId, change.change)
          })
        }
      }}
    >
      ...
    </Claude>
  )
}
```

## Agent Personas

Each agent has a distinct persona and constraints:

```tsx
function Architect({ task }) {
  return (
    <Claude>
      <Persona role="software architect">
        You are a senior software architect with expertise in system design,
        clean architecture, and breaking down complex tasks.
      </Persona>

      <Constraints>
        - Break the task into 2-4 focused subtasks
        - Each subtask should be independently implementable
        - Define clear interfaces between components
      </Constraints>
      ...
    </Claude>
  )
}
```

## Running

```bash
# Default task (user authentication)
bun run examples/05-dev-team/agent.tsx

# Custom task
bun run examples/05-dev-team/agent.tsx "Build a REST API for user management"
```

## Example Execution

```
[Frame 1] Stage: planning
  Architect: Analyzing "Add user authentication..."
  -> Plan: 3 subtasks (db-schema, auth-api, ui-components)

[Frame 2] Stage: implementing
  Developer: Working on db-schema (no dependencies)
  -> Complete

[Frame 3] Stage: implementing
  Developer: Working on auth-api (depends on db-schema)
  -> Complete

[Frame 4] Stage: implementing
  Developer: Working on ui-components (depends on auth-api)
  -> Complete

[Frame 5] Stage: reviewing
  Reviewer: Running tests, reviewing code
  -> Changes requested for auth-api

[Frame 6] Stage: implementing
  Developer: Revising auth-api with notes
  -> Complete

[Frame 7] Stage: reviewing
  Reviewer: Re-reviewing
  -> Approved

[Frame 8] Stage: done
```

## Key Patterns Demonstrated

1. **State Machine** - Clear stages with defined transitions
2. **Dependency Graph** - Subtasks with dependencies
3. **Retry Logic** - Revision loop for quality
4. **Role Separation** - Each agent has focused responsibilities
5. **Inter-agent Communication** - Via shared state

## Extending the Team

Add more agents by following the pattern:

```tsx
function QAEngineer({ subtask }) {
  return (
    <Claude tools={[runTestsTool, browserTool]}>
      <Persona role="QA engineer">
        You write comprehensive test cases and perform exploratory testing.
      </Persona>
      ...
    </Claude>
  )
}
```

Then integrate into the orchestrator's state machine.

## Related Examples

- [03-research-pipeline](../03-research-pipeline/) - Simpler multi-phase workflow
- [04-parallel-research](../04-parallel-research/) - Parallel execution patterns